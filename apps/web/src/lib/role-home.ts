import { APPS, appHome, type AppId } from './apps';
import { onlyApp, shownOr } from './shown-apps';
import { inviteHref, pendingInvite } from './course-invite';

// Where someone's app starts after signing in: the app they picked on the website or the sign-in
// page (?app=trace), the owner console for the owner, the parent app for guardians, and otherwise
// the app they used last on this device (M198), teachers and admins their school home, and otherwise
// the hub of every app (src/lib/apps.ts).
export function homeFor(user: { role?: string | null; owner?: boolean | null } | null | undefined, app?: string | null): string {
  if (!user?.role) return '/login';
  if (user.role === 'GUARDIAN') return '/parent';
  // M113: a student who opened a teacher's class link before signing up or in goes back to it.
  const invited = user.role === 'STUDENT' ? pendingInvite() : null;
  if (invited) return inviteHref(invited);
  if (app && APPS.some((a) => a.id === app)) return appHome(shownOr(app as AppId), user.role);
  if (user.owner) return '/console';
  // M203: when the owner shows one app, the website is that app (no hub).
  const only = onlyApp();
  if (only) return appHome(only, user.role);
  const last = lastApp();
  if (last) return appHome(shownOr(last), user.role);
  return user.role === 'TEACHER' || user.role === 'ADMIN' ? appHome(shownOr('campus'), user.role) : '/hub';
}

// M198: the app someone used last on this device, so the app opens where they left off (a student of a
// class goes back to it, not to the hub of every app). Written by AppBackdrop on an app's own pages.
const LAST = 'uv-last-app';
export function rememberApp(id: AppId) {
  try { if (localStorage.getItem(LAST) !== id) localStorage.setItem(LAST, id); } catch { /* storage blocked */ }
}
function lastApp(): AppId | null {
  try { const v = localStorage.getItem(LAST); return APPS.some((a) => a.id === v) ? (v as AppId) : null; } catch { return null; }
}

/** The app picked on the website or the sign-in page, remembered for the next screens of signing in. */
export function chosenApp(): string | null {
  try { return new URLSearchParams(location.search).get('app') ?? sessionStorage.getItem('uv-app'); } catch { return null; }
}
