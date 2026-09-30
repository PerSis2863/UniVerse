'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { authedFetch } from '@/lib/authed-fetch';
import { isSampleMode } from '@/lib/sample-mode';

// Records what people do in the app for the owner console: each page they open and each button,
// link or tab they press, with the time (the Privacy Policy's "pages visited, feature utilization
// and interaction timestamps", kept 90 days). Only the control's label is kept, never what anyone
// types. Events are sent in batches (one request a minute at most while something happened, and
// when the tab is hidden), so this costs very few requests.

type Ev = { k: 'VIEW' | 'CLICK'; l?: string; p: string; t: number };

const FLUSH_MS = 60_000;
const MAX_QUEUE = 50;
const CONTROLS = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], summary, select, input[type="checkbox"], input[type="radio"], input[type="submit"]';

let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const events = queue;
  queue = [];
  void authedFetch('/api/core/activity/ui', { method: 'POST', body: JSON.stringify({ events }), keepalive: true }).catch(() => {});
}

function push(e: Ev) {
  if (isSampleMode()) return;
  queue.push(e);
  if (queue.length >= MAX_QUEUE) flush();
  else timer ??= setTimeout(flush, FLUSH_MS);
}

/** What the control says: its accessible name, title or visible text (first line, shortened). */
function labelOf(el: Element): string | undefined {
  const aria = el.getAttribute('aria-label') || el.getAttribute('title');
  const input = el instanceof HTMLInputElement ? (el.type === 'submit' ? el.value : el.labels?.[0]?.textContent) : null;
  const text = aria || input || (el instanceof HTMLSelectElement ? el.labels?.[0]?.textContent || el.name : (el as HTMLElement).innerText);
  const line = text?.split('\n').map((s) => s.trim()).find(Boolean);
  return line ? line.slice(0, 120) : undefined;
}

export function ActivityTracker() {
  const pathname = usePathname();

  useEffect(() => {
    push({ k: 'VIEW', p: pathname, t: Date.now() });
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(CONTROLS);
      if (!el || el.closest('[data-no-track]')) return;
      const href = el instanceof HTMLAnchorElement ? new URL(el.href, location.href) : null;
      const label = labelOf(el) ?? (href && href.origin === location.origin ? href.pathname : undefined);
      push({ k: 'CLICK', l: label, p: location.pathname, t: Date.now() });
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  return null;
}
