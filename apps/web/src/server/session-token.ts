import { createHmac, timingSafeEqual } from 'node:crypto';

// UniVerse's own sign-in tokens, for people who arrive from an LMS (LTI launch) and have no
// Firebase account. Format: "ut1.<base64url JSON {uid, iat, exp, src}>.<HMAC-SHA256>", signed with
// the SESSION_SECRET secret (32+ characters). Short-lived; the LMS launch issues a new one.

const PREFIX = 'ut1.';
export const SESSION_TTL_SEC = 12 * 3600;

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

export const sessionTokensEnabled = () => secret() !== null;
export const isSessionToken = (token: string) => token.startsWith(PREFIX);

const mac = (key: string, body: string) => createHmac('sha256', key).update(body).digest('base64url');

export function issueSessionToken(userId: string, src = 'lti', ttlSec = SESSION_TTL_SEC): string {
  const key = secret();
  if (!key) throw new Error('SESSION_SECRET is not set');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ uid: userId, iat: now, exp: now + ttlSec, src }), 'utf8').toString('base64url');
  return `${PREFIX}${body}.${mac(key, `${PREFIX}${body}`)}`;
}

/** The user id in a valid, unexpired token, or null. */
export function verifySessionToken(token: string): string | null {
  const key = secret();
  if (!key || !token.startsWith(PREFIX)) return null;
  const rest = token.slice(PREFIX.length);
  const dot = rest.lastIndexOf('.');
  if (dot < 1) return null;
  const body = rest.slice(0, dot), sig = rest.slice(dot + 1);
  const expected = Buffer.from(mac(key, `${PREFIX}${body}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { uid?: unknown; exp?: unknown };
    if (typeof p.uid !== 'string' || typeof p.exp !== 'number' || p.exp * 1000 < Date.now()) return null;
    return p.uid;
  } catch {
    return null;
  }
}
