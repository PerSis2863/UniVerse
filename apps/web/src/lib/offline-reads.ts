import { isSampleMode } from './sample-mode';
import { viewAsToken } from './view-as';

// M46: today's timetable, courses and recent messages readable offline. API answers are never put
// in the service worker's cache (they're per person), so the last answer of these few reads is kept
// in this device's offline database instead (src/lib/outbox.ts, wiped at sign-out) and handed back
// when there's no connection. public/offline.html reads the same copies, so even a page that was
// never opened shows today's classes, the courses and the latest chats.

/** The reads kept, as the app requests them. `today`: shown only on the day it was saved (it holds
 *  today's classes at their times). */
const KEPT: { re: RegExp; today?: boolean }[] = [
  { re: /^\/api\/core\/timetable\/my$/ },
  { re: /^\/api\/core\/courses\/my$/ },
  { re: /^\/api\/chat\/conversations$/ },
  { re: /^\/api\/student\/overview\?dow=\d$/ }, // one per weekday: its classes are that day's
  { re: /^\/api\/core\/dashboard\/teacher$/ },
  { re: /^\/api\/home\?tz=[^&]*$/, today: true },
];
const MAX_AGE = 14 * 24 * 3600_000;
// The chat list is asked for again with every new message: save each read at most every 30 s.
const savedAt = new Map<string, number>();

/** The signed-in person's id, as the app keeps it (src/store/auth.ts). */
function me(): string | null {
  try {
    return (JSON.parse(localStorage.getItem('universe-auth') ?? 'null') as { state?: { user?: { id?: string } } } | null)?.state?.user?.id ?? null;
  } catch {
    return null;
  }
}

function ruleFor(url: string) {
  // Sample answers and someone else's account (owner support) are never kept.
  if (typeof window === 'undefined' || isSampleMode() || viewAsToken()) return null;
  return KEPT.find((k) => k.re.test(url)) ?? null;
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Whether a kept copy may still be shown (pure; tested). */
export function usable(saved: { uid: string; savedAt: number }, uid: string | null, today: boolean, now = Date.now()) {
  return !!uid && saved.uid === uid && now - saved.savedAt < MAX_AGE && (!today || sameDay(saved.savedAt, now));
}

/**
 * Runs a read; for the kept ones, saves the answer, and when there's no connection answers with the
 * saved copy instead of failing. `data` picks what to save from the result, `wrap` turns a saved
 * copy back into one.
 */
export async function withOfflineCopy<R>(url: string, load: () => Promise<R>, data: (r: R) => unknown = (r) => r, wrap: (d: unknown) => R = (d) => d as R): Promise<R> {
  const rule = ruleFor(url);
  if (!rule) return load();
  const outbox = import('./outbox').catch(() => null); // alongside the request, never before it
  try {
    const r = await load();
    const uid = me();
    if (uid && Date.now() - (savedAt.get(url) ?? 0) > 30_000) {
      savedAt.set(url, Date.now());
      void outbox.then((o) => o?.keepRead(url, uid, data(r))).catch(() => {});
    }
    return r;
  } catch (e) {
    const o = await outbox;
    if (!o?.isOfflineError(e)) throw e;
    const saved = await o.keptRead(url).catch(() => null);
    if (!saved || !usable(saved, me(), !!rule.today)) throw e;
    return wrap(saved.data);
  }
}

/** Once a day for school accounts, quietly refreshes the copies the offline page shows (at most
 *  three small reads), so they're there even if those pages weren't opened. */
export async function refreshOfflineCopies(role: string | undefined, read: (url: string) => Promise<unknown>) {
  if (role !== 'STUDENT' && role !== 'TEACHER') return;
  if (!navigator.onLine || !ruleFor('/api/chat/conversations')) return;
  const o = await import('./outbox');
  for (const url of ['/api/core/timetable/my', '/api/core/courses/my', '/api/chat/conversations']) {
    const saved = await o.keptRead(url).catch(() => null);
    if (saved && saved.uid === me() && Date.now() - saved.savedAt < 12 * 3600_000) continue;
    await read(url).catch(() => {});
  }
}
