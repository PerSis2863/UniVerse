/**
 * Returns a valid bearer token for the API / chat socket.
 *
 * - Demo sessions use their stored "mock-token-*".
 * - Real users use their Firebase ID token. Firebase caches it and refreshes it automatically
 *   before it expires (tokens last 1 hour), so we always ask Firebase instead of re-using the
 *   token saved at login — re-using that stale copy is what caused "Firebase ID token has expired"
 *   errors in the API logs.
 */
export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  let stored: string | null = null;
  try {
    stored = localStorage.getItem('accessToken');
  } catch {
    stored = null;
  }
  if (stored && stored.startsWith('mock-token-')) return stored;
  if (stored && stored.startsWith('ut1.')) return stored; // signed in from an LMS (LTI)

  try {
    const { auth } = await import('./firebase');
    // On a fresh page load Firebase restores the session asynchronously; wait for it.
    await auth.authStateReady();
    const current = auth.currentUser;
    if (!current) return null;
    const token = await current.getIdToken(forceRefresh);
    try {
      localStorage.setItem('accessToken', token);
    } catch {
      /* storage unavailable */
    }
    return token;
  } catch (e) {
    console.warn('Could not get a Firebase ID token', e);
    return null;
  }
}

/** The pass from the emailed sign-in code (admins and the owner; src/server/two-step.ts). */
export function twoStepPass(): string | null {
  try {
    return localStorage.getItem('uv-pass');
  } catch {
    return null;
  }
}

/** fetch() for this app's own /api routes, with the user's bearer token attached. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const pass = twoStepPass();
  if (pass) headers.set('X-UV-Pass', pass);
  return fetch(input, { ...init, headers });
}
