// M78: who a request says it is, for rate limits only (cloudflare/worker.ts `rateLimited`). The
// account named inside the token, not the token's own text: one person signing in again (a new
// token each hour) keeps one count, and a made-up token gets no fresh count of its own because it
// is paired with the address. Not a sign-in check: a forged name is refused later by the route.

const b64json = (part: string): Record<string, unknown> | null => {
  try {
    const s = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(s + '='.repeat((4 - (s.length % 4)) % 4))) as Record<string, unknown>;
  } catch { return null; }
};

/** The account a bearer token names (Firebase `user_id`/`sub`, a UniVerse session's `uid`, a local
 *  demo token's email), cut to 80 characters; null when it names none. */
export function claimedAccount(authorization: string | null | undefined): string | null {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  if (token.startsWith('mock-token-')) return token.slice(0, 80);
  const parts = token.split('.');
  const body = token.startsWith('ut1.') ? parts[1] : parts.length === 3 ? parts[1] : null;
  const claims = body ? b64json(body) : null;
  const id = claims?.user_id ?? claims?.sub ?? claims?.uid;
  return typeof id === 'string' && id ? id.slice(0, 80) : null;
}

/** The rate-limit key: the claimed account at this address, or the address alone. */
export const rateKey = (authorization: string | null | undefined, ip: string) => {
  const who = claimedAccount(authorization);
  return who ? `u:${who}@${ip}` : `ip:${ip}`;
};
