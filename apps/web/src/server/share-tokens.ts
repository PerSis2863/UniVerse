import { createHmac, timingSafeEqual } from 'node:crypto';

// Signed links that open a read-only view without signing in: a parent's progress page
// (/guardian/<token>) and a calendar feed (/api/calendar/<token>). Signed with SESSION_SECRET, like
// the LMS sign-in tokens, but each kind signs its own label so one can never be used as another.
// Nothing is stored: a guardian link stops working when it expires, and a calendar link works until
// SESSION_SECRET changes (which also ends every other link). There is no per-person field to bump,
// so a single link can't be switched off early.
//   guardian: "g1.<userId>.<expiry, seconds, base 36>.<HMAC>"
//   calendar: "c1.<userId>.<HMAC>"

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

export const shareLinksEnabled = () => secret() !== null;

const mac = (key: string, body: string) => createHmac('sha256', key).update(body).digest('base64url');

function sameMac(expected: string, given: string) {
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// User ids are cuids; refusing anything else keeps tokens to URL-safe characters.
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const GUARDIAN_DAYS = [7, 30, 90] as const;

export function issueGuardianToken(userId: string, days: number): { token: string; expiresAt: Date } {
  const key = secret();
  if (!key) throw new Error('SESSION_SECRET is not set');
  const exp = Math.floor(Date.now() / 1000) + days * 86_400;
  const body = `g1.${userId}.${exp.toString(36)}`;
  return { token: `${body}.${mac(key, `guardian:${body}`)}`, expiresAt: new Date(exp * 1000) };
}

/** The student id in a valid guardian link, or why it doesn't open. */
export function verifyGuardianToken(token: string): { userId: string; expiresAt: Date } | { error: 'invalid' | 'expired' } {
  const key = secret();
  const parts = token.split('.');
  if (!key || parts.length !== 4 || parts[0] !== 'g1' || !ID.test(parts[1])) return { error: 'invalid' };
  const body = parts.slice(0, 3).join('.');
  if (!sameMac(mac(key, `guardian:${body}`), parts[3])) return { error: 'invalid' };
  const exp = parseInt(parts[2], 36);
  if (!Number.isFinite(exp)) return { error: 'invalid' };
  if (exp * 1000 < Date.now()) return { error: 'expired' };
  return { userId: parts[1], expiresAt: new Date(exp * 1000) };
}

export function issueCalendarToken(userId: string): string {
  const key = secret();
  if (!key) throw new Error('SESSION_SECRET is not set');
  const body = `c1.${userId}`;
  return `${body}.${mac(key, `calendar:${body}`)}`;
}

/** The user id in a valid calendar feed token, or null. */
export function verifyCalendarToken(token: string): string | null {
  const key = secret();
  const parts = token.split('.');
  if (!key || parts.length !== 3 || parts[0] !== 'c1' || !ID.test(parts[1])) return null;
  return sameMac(mac(key, `calendar:c1.${parts[1]}`), parts[2]) ? parts[1] : null;
}
