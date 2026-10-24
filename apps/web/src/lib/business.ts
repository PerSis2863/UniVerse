// Business mode (the owner, 24 Oct 2026: "you have not remove the school related features and change
// it into the new one"): UniVerse is now UniVerse Trace, for brands, shops and the people who move
// their products. Every role gets the same business app (Trace, its maps, campaigns, the wallet,
// Messages, Collaborate, Settings; the owner also keeps the owner console). The school pages are
// still in the code but no longer reachable: opening one goes to /trace.

/** Each role's Messages page (the inbox pages are shared with the old app). */
export const inboxFor = (role: string | null | undefined) => (role === 'ADMIN' ? '/admin/inbox' : role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox');
/** Each role's Settings page. */
export const settingsFor = (role: string | null | undefined) => (role === 'ADMIN' ? '/admin/settings' : role === 'TEACHER' ? '/teacher/settings' : '/student/settings');

/** Pages of the business app (a path or anything under it). */
const OPEN = [
  '/trace', '/console', '/collab', '/boards', '/code', '/tasks', '/docs', '/sheets', '/slides', '/spaces', '/studio', '/files',
  '/calls', '/call', '/notifications', '/people', '/application', '/parent',
  '/student/inbox', '/teacher/inbox', '/admin/inbox', '/admin/announcements', '/student/settings', '/teacher/settings', '/admin/settings',
];
/** Where the school app lived: anything here that isn't OPEN goes to /trace. */
const SCHOOL = ['/student', '/teacher', '/admin', '/library', '/marketplace', '/campus-map', '/donations', '/hall', '/impact-league', '/impact-rooms'];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** Where to send someone who opens a school page (null: the page is part of the business app). */
export function businessRedirect(path: string): string | null {
  if (OPEN.some((b) => under(path, b))) return null;
  return SCHOOL.some((b) => under(path, b)) ? '/trace' : null;
}
