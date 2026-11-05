// M113 (the council: one real class first): a teacher's class link, /join?course=<id>. Opening it
// remembers the class on this device for a day, so signing up or in (Google's window, a new tab after
// checking an email) still ends on the join card: homeFor (src/lib/role-home.ts) sends a student there
// while one is waiting. The join itself is the existing POST /courses/:id/enroll.

const KEY = 'uv-join-course';
const DAY = 86_400_000;
/** Course ids are cuids (sample ones start smp): nothing else is kept or put in a link. */
const ID = /^[a-z0-9]{8,40}$/i;

export const inviteHref = (courseId: string) => `/join?course=${encodeURIComponent(courseId)}`;

export function rememberInvite(courseId: string, now = Date.now()) {
  if (!ID.test(courseId)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ id: courseId, at: now })); } catch { /* private mode: opening the link again still works */ }
}

/** The class waiting to be joined on this device (under a day old), if any. */
export function pendingInvite(now = Date.now()): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { id?: unknown; at?: unknown } | null;
    if (!v || typeof v.id !== 'string' || !ID.test(v.id) || typeof v.at !== 'number') return null;
    return now >= v.at && now - v.at < DAY ? v.id : null;
  } catch { return null; }
}

export function clearInvite() {
  try { localStorage.removeItem(KEY); } catch { /* nothing was kept */ }
}
