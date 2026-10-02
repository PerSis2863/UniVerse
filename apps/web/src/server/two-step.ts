import { createHmac, timingSafeEqual } from 'node:crypto';

// Two-step sign-in for the owner and admin accounts: after signing in, a 6-digit code is emailed
// and must be typed before the account can do anything. Stateless: the code and the "pass" the
// app then sends with every request (X-UV-Pass header) are HMACs of the account and the moment it
// signed in (the Firebase token's auth_time), keyed by SESSION_SECRET. A new sign-in needs a new
// code; nothing is stored. Used by the Next.js app and the Worker's light paths (no imports beyond
// node:crypto for that reason).
//
// Off when SESSION_SECRET or RESEND_API_KEY is missing (no way to send the code), or when the
// TWO_STEP_OFF secret is set (the way back in if email ever stops working).

const SLOT = 10 * 60_000;
const secret = () => {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
};
export const twoStepEnabled = () => !!secret() && !!process.env.RESEND_API_KEY?.trim() && !process.env.TWO_STEP_OFF?.trim();
const mac = (text: string) => createHmac('sha256', secret()!).update(text).digest();

/** auth_time of a Firebase token (already verified by the caller), or null for other tokens. */
export function authTimeOf(token: string | null | undefined): number | null {
  const part = token?.split('.');
  if (!token || token.startsWith('ut1.') || token.startsWith('mock-token-') || part?.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(part[1], 'base64url').toString('utf8')) as { auth_time?: unknown };
    return typeof claims.auth_time === 'number' ? claims.auth_time : null;
  } catch {
    return null;
  }
}

/** Whether this signed-in account must show a pass: admins and the owner, on a Firebase sign-in. */
export const needsTwoStep = (role: string, token: string | null | undefined) => twoStepEnabled() && role === 'ADMIN' && authTimeOf(token) !== null;

export const passFor = (userId: string, authTime: number) => mac(`2fa-pass:${userId}:${authTime}`).toString('base64url');

export function hasPass(req: Request, userId: string, token: string | null | undefined): boolean {
  const at = authTimeOf(token);
  const given = req.headers.get('x-uv-pass')?.trim();
  if (at === null || !given) return false;
  const want = Buffer.from(passFor(userId, at));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function codeFor(userId: string, authTime: number, slot = Math.floor(Date.now() / SLOT)): string {
  const sig = mac(`2fa-code:${userId}:${authTime}:${slot}`);
  return String((((sig[0] << 24) | (sig[1] << 16) | (sig[2] << 8) | sig[3]) >>> 0) % 1_000_000).padStart(6, '0');
}

/** True when the code matches this 10-minute slot or the one before (so a code works 10-20 min). */
export function codeMatches(userId: string, authTime: number, code: unknown): boolean {
  const given = String(code ?? '').replace(/\D/g, '');
  const slot = Math.floor(Date.now() / SLOT);
  return given.length === 6 && (given === codeFor(userId, authTime, slot) || given === codeFor(userId, authTime, slot - 1));
}
