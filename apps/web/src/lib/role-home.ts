import { APPS, appHome, type AppId } from './apps';
import { onlyApp, shownOr } from './shown-apps';
import { inviteHref, pendingInvite } from './course-invite';

// Where someone's app starts after signing in: the app they picked on the website or the sign-in
// page (?app=trace), the owner console for the owner, the parent app for guardians, and otherwise
// the hub of every app (src/lib/apps.ts).
export function homeFor(user: { role?: string | null; owner?: boolean | null } | null | undefined, app?: string | null): string {
  if (!user?.role) return '/login';
  if (user.role === 'GUARDIAN') return '/parent';
  // M113: a student who opened a teacher's class link before signing up or in goes back to it.
  const invited = user.role === 'STUDENT' ? pendingInvite() : null;
  if (invited) return inviteHref(invited);
  if (app && APPS.some((a) => a.id === app)) return appHome(shownOr(app as AppId), user.role);
  if (user.owner) return '/console';
  // M197: when the owner shows one app, the website is that app (no hub).
  const only = onlyApp();
  return only ? appHome(only, user.role) : '/hub';
}

/** The app picked on the website or the sign-in page, remembered for the next screens of signing in. */
export function chosenApp(): string | null {
  try { return new URLSearchParams(location.search).get('app') ?? sessionStorage.getItem('uv-app'); } catch { return null; }
}
