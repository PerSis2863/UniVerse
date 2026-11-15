import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { APPS, type AppId, type ImpactApp } from './apps';
import { ALL_APP_IDS, hideCss, parseShownApps, SHOWN_KEY } from './shown-apps-list';

// Which apps the website shows (M197, the owner: "when i want to show only one app then it should
// switch to that one app and website then no other apps should be there just that one"), set in the
// owner console → Server → Apps on the website (server_control.apps). The Worker writes the list into
// every page (window.__uvApps, cloudflare/usage-guard.ts) before anything else runs, so a page never
// shows a hidden app first; this device keeps the last list it saw (`uv-apps`), and the app checks it
// again once per visit (GET /api/core/site/apps). One shown app: no app tabs, no switcher, no hub; a hidden
// app's pages send people to a shown one. It's what the website shows, not who may use what.

const ALL = ALL_APP_IDS;

let current: AppId[] | null = null;
const subs = new Set<() => void>();
/** Told when the list changes (for stores that follow it). */
export const subscribeShown = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
function read(): AppId[] {
  if (typeof window === 'undefined') return ALL;
  const given = (window as Window & { __uvApps?: unknown }).__uvApps;
  if (Array.isArray(given)) return parseShownApps(given);
  try { const kept = localStorage.getItem(SHOWN_KEY); if (kept) return parseShownApps(kept); } catch { /* private mode */ }
  return ALL;
}

/** The ids shown now (outside React). */
export const shownIds = (): AppId[] => (current ??= read());
export const isShown = (id: AppId) => shownIds().includes(id);
/** The one app the website is, when the owner shows only one. */
export const onlyApp = (): AppId | null => { const ids = shownIds(); return ids.length === 1 ? ids[0] : null; };
/** This app if shown, otherwise the first shown one. */
export const shownOr = (id: AppId): AppId => (isShown(id) ? id : shownIds()[0]);

/** A new list (from the server, or the owner's console): kept on the device, every listener told. */
export function setShownApps(raw: unknown) {
  const next = parseShownApps(raw);
  try { localStorage.setItem(SHOWN_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  if (current && next.join() === current.join()) return;
  current = next;
  const css = hideCss(next);
  let el = document.getElementById('uv-apps-css');
  if (!css) el?.remove();
  else {
    if (!el) { el = document.createElement('style'); el.id = 'uv-apps-css'; document.head.appendChild(el); }
    el.textContent = css;
  }
  subs.forEach((f) => f());
}

let checked = false;
/** The apps shown, kept up to date (checked with the server once per visit). */
export function useShownApps(): ImpactApp[] {
  const ids = useSyncExternalStore(subscribeShown, shownIds, () => ALL);
  useEffect(() => {
    if (checked) return;
    checked = true;
    fetch('/api/core/site/apps', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d: { apps?: unknown } | null) => { if (d) setShownApps(d.apps); }).catch(() => { checked = false; });
  }, []);
  return useMemo(() => APPS.filter((a) => ids.includes(a.id)), [ids]);
}
