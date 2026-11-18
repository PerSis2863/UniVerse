import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Authenticator-app codes (M301; RFC 6238 TOTP: HMAC-SHA1, 30-second steps, 6 digits), the second
// sign-in step anyone can turn on (Settings → Privacy & Security). The secret is shown once as a QR
// code and kept encrypted (src/server/secret-box.ts). Only node:crypto, like two-step.ts, so the
// Worker's light paths can use it too.

const STEP = 30;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Not base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A new secret: 20 random bytes, as base32 for the app. */
export const newSecret = () => base32(randomBytes(20));

/** The code for a time step (RFC 4226's dynamic truncation). */
export function codeAt(secret: string, step: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', fromBase32(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 10 ** digits).padStart(digits, '0');
}

export const stepOf = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);

/**
 * The step a typed code belongs to (this one, or one either side for a phone's clock), or null. A code
 * whose step is not after `lastUsed` is refused, so one code can't be used twice.
 */
export function matchStep(secret: string, code: unknown, lastUsed: number | null, now = Date.now()): number | null {
  const given = String(code ?? '').replace(/\D/g, '');
  if (given.length !== 6) return null;
  const at = stepOf(now);
  for (const s of [at, at - 1, at + 1]) {
    if (lastUsed !== null && s <= lastUsed) continue;
    const want = Buffer.from(codeAt(secret, s));
    if (timingSafeEqual(want, Buffer.from(given))) return s;
  }
  return null;
}

/** What the authenticator app scans: otpauth://totp/UniVerse:<account>?secret=…&issuer=UniVerse */
export const otpauthUrl = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`UniVerse:${account}`)}?secret=${secret}&issuer=UniVerse&algorithm=SHA1&digits=6&period=${STEP}`;
