import { distanceM } from './attendance-rules';

// UniVerse Trace: every product gets a passport (the owner, 24 Oct 2026). Shared rules for the codes
// printed on products and for deciding whether a scan looks genuine. The signature part of a code is
// made on the server with the batch's own secret (src/server/trace.ts); this file never sees it.

/** Crockford base32: no I, L, O or U, so a code read aloud or typed from a label isn't misread. */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const KEY_LEN = 6;
export const SERIAL_LEN = 4;
export const SIG_LEN = 8;
export const CODE_LEN = KEY_LEN + SERIAL_LEN + SIG_LEN;
/** 32⁴: the most units one batch can hold. */
export const MAX_BATCH = 32 ** SERIAL_LEN;

/** A serial number (0-based) as fixed-width base32. */
export function encodeSerial(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= MAX_BATCH) throw new RangeError('serial out of range');
  let out = '';
  for (let i = 0; i < SERIAL_LEN; i++) { out = ALPHABET[n % 32] + out; n = Math.floor(n / 32); }
  return out;
}

export function decodeSerial(s: string): number {
  let n = 0;
  for (const ch of s) { const v = ALPHABET.indexOf(ch); if (v < 0) return -1; n = n * 32 + v; }
  return n;
}

/** Tidies what someone typed or scanned (lower case, spaces, dashes, O for 0) into a code. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

/** The three parts of a well-formed code, or null. */
export function splitCode(raw: string): { key: string; serial: number; sig: string } | null {
  const c = cleanCode(raw);
  if (c.length !== CODE_LEN || [...c].some((ch) => !ALPHABET.includes(ch))) return null;
  return { key: c.slice(0, KEY_LEN), serial: decodeSerial(c.slice(KEY_LEN, KEY_LEN + SERIAL_LEN)), sig: c.slice(KEY_LEN + SERIAL_LEN) };
}

/** A code in readable groups, as printed under the QR code: ABC123-0004-9XK2M7QP. */
export const formatCode = (code: string) => `${code.slice(0, KEY_LEN)}-${code.slice(KEY_LEN, KEY_LEN + SERIAL_LEN)}-${code.slice(KEY_LEN + SERIAL_LEN)}`;

/** Bytes as base32 text of the given length (for keys and signatures). */
export function toBase32(bytes: Uint8Array, len: number): string {
  let out = '', bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5 && out.length < len) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out;
}

export type Verdict = 'FIRST' | 'SEEN' | 'SUSPECT';
/** Same code seen this far from where it was first checked: probably a copied label. */
export const FAR_M = 150_000;
/** One product doesn't get checked this often; a copied label does. */
export const MANY_SCANS = 25;

/**
 * Whether a scan looks genuine. The first scan of a code is the real one; later scans near it (the
 * buyer checking again) are fine; a scan far away, or one of too many, means the label was copied.
 * Without GPS on either side (we only use it when the browser already allows it), a scan from another
 * country than the first one counts as far away.
 */
export function verdictFor(code: { scanCount: number; firstLat: number | null; firstLng: number | null; status?: string }, here: { lat: number; lng: number } | null, countries?: { first: string | null; now: string | null }): Verdict {
  if (code.status === 'FLAGGED') return 'SUSPECT';
  if (code.scanCount === 0) return 'FIRST';
  if (code.scanCount >= MANY_SCANS) return 'SUSPECT';
  if (here && code.firstLat !== null && code.firstLng !== null) return distanceM(here, { lat: code.firstLat, lng: code.firstLng }) > FAR_M ? 'SUSPECT' : 'SEEN';
  if (countries?.first && countries.now && countries.first !== countries.now) return 'SUSPECT';
  return 'SEEN';
}

/** A batch's journey, in order. */
export const STAGES = ['MADE', 'SHIPPED', 'WAREHOUSE', 'DISTRIBUTOR', 'SHOP'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { MADE: 'Made', SHIPPED: 'Shipped', WAREHOUSE: 'At the warehouse', DISTRIBUTOR: 'With the distributor', SHOP: 'In the shop' };
