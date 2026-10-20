// "View as" for support (Stage 5 · B20): the owner sees the app as one person, read-only, in its own
// browser tab. The tab keeps that person's 30-minute session token and account in sessionStorage
// (this tab only), so the owner's own sign-in in localStorage and in other tabs is never touched.
// The server refuses every change made with it (src/server/auth.ts viewAsBlocked). No imports:
// read by the token helper, the account store and Firebase setup before anything else.

export const VIEW_AS_KEY = 'uv-view-as';
const NAME_KEY = 'uv-view-as-name';

/** The view-as session token of this tab, or null (not viewing as anyone). */
export function viewAsToken(): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(VIEW_AS_KEY);
  } catch {
    return null;
  }
}

/** Whether this tab's view-as session has run out (its 30 minutes, read from the token itself). */
export function viewAsExpired(now = Date.now()): boolean {
  const token = viewAsToken();
  if (!token) return true;
  try {
    const { exp } = JSON.parse(atob(token.slice(4).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof exp !== 'number' || exp * 1000 <= now;
  } catch {
    return true;
  }
}

/** Who this tab is viewing as (for the banner). */
export function viewAsName(): string | null {
  try {
    return sessionStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

/** Starts viewing as someone in this tab (from /view-as). */
export function startViewAs(token: string, user: { name: string }, account: unknown) {
  sessionStorage.setItem(VIEW_AS_KEY, token);
  sessionStorage.setItem(NAME_KEY, user.name);
  // The account store reads this tab's copy while viewing as (src/store/auth.ts).
  sessionStorage.setItem('universe-auth', JSON.stringify({ state: { user: account }, version: 0 }));
}

/** Ends it: this tab only, and never the owner's own sign-in. Never returns. */
export function endViewAs(why: 'ended' | 'expired' = 'ended'): Promise<never> {
  try {
    sessionStorage.removeItem(VIEW_AS_KEY);
    sessionStorage.removeItem(NAME_KEY);
    sessionStorage.removeItem('universe-auth');
  } catch {
    /* storage unavailable */
  }
  window.location.replace(`/view-as?${why}=1`);
  return new Promise<never>(() => {});
}
