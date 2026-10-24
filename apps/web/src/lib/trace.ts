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

/** Free brands get this many units with a passport; PRO brands far more. */
export const PLAN_UNITS: Record<string, number> = { FREE: 10_000, PRO: 1_000_000 };

/**
 * Whether a scan counts for a campaign's area: a country (ISO code), a circle (centre + km), or
 * everywhere when neither is set. A circle needs a position (GPS, or Cloudflare's city estimate).
 */
export function inArea(c: { country: string | null; lat: number | null; lng: number | null; radiusKm: number | null }, here: { lat: number; lng: number } | null, country: string | null): boolean {
  if (c.country && c.country.toUpperCase() !== (country ?? '').toUpperCase()) return false;
  if (c.lat !== null && c.lng !== null && c.radiusKm) return !!here && distanceM(here, { lat: c.lat, lng: c.lng }) <= c.radiusKm * 1000;
  return true;
}

/**
 * The live map never shows a scan where it happened: positions are snapped to a grid (0.1° ≈ 11 km
 * for a brand's own scans, 0.5° ≈ 55 km for the market layer), so a shop or a person can't be found.
 */
export const cellOf = (lat: number, lng: number, step: number) => [Math.round(lat / step) * step, Math.round(lng / step) * step].map((v) => Math.round(v * 100) / 100) as [number, number];

/** The market layer only shows a grid cell once this many scans fall in it (nobody stands out). */
export const MARKET_MIN = 5;

// ─── Trace plus (migration 0179) ───

/** A shop's tier with a brand, from its verified sales in the last 90 days: more sales, more points per scan. */
export const TIERS = [
  { id: 'BRONZE', label: 'Bronze', from: 0, multiplier: 1 },
  { id: 'SILVER', label: 'Silver', from: 20, multiplier: 1.25 },
  { id: 'GOLD', label: 'Gold', from: 100, multiplier: 1.5 },
] as const;
export function tierFor(sales90: number) {
  const i = TIERS.reduce((best, t, j) => (sales90 >= t.from ? j : best), 0);
  const next = TIERS[i + 1] ?? null;
  return { ...TIERS[i], sales: sales90, next: next ? { label: next.label, need: next.from - sales90 } : null };
}

/** A scan outside a batch's authorised markets (a comma list of country codes) is "diverted": grey market. */
export function isDiverted(allowed: string | null | undefined, country: string | null | undefined) {
  const list = (allowed ?? '').split(',').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  return !!country && list.length > 0 && !list.includes(country.toUpperCase());
}

/**
 * The CO2 of one unit's journey: kilometres along the stops, by sea when a leg starts or ends at a
 * port (about 20 g per tonne-km) and by road otherwise (about 120 g per tonne-km), times its weight.
 */
export function journeyCarbon(stops: { place?: string | null; lat: number | null; lng: number | null }[], weightKg = 1) {
  const pts = stops.filter((s): s is { place?: string | null; lat: number; lng: number } => s.lat !== null && s.lng !== null);
  let km = 0, kg = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = distanceM(pts[i - 1], pts[i]) / 1000;
    const sea = /port|harbou?r|sea/i.test(`${pts[i - 1].place ?? ''} ${pts[i].place ?? ''}`);
    km += d;
    kg += (d * (weightKg / 1000)) * (sea ? 0.02 : 0.12);
  }
  return { km: Math.round(km), kg: Math.round(kg * 1000) / 1000 };
}

/**
 * The next `horizon` days of a daily series: a level and trend (Holt, smoothed) plus each weekday's
 * usual lift, with a band of about ±1.3 typical errors. Never below zero.
 */
export function forecast(series: number[], horizon = 14) {
  if (series.length < 14) return { values: Array<number>(horizon).fill(series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0), band: Array<number>(horizon).fill(0) };
  const mean = series.reduce((a, b) => a + b, 0) / series.length || 1;
  const season = Array.from({ length: 7 }, (_, d) => { const v = series.filter((_, i) => i % 7 === d); return v.reduce((a, b) => a + b, 0) / v.length - mean; });
  const a = 0.35, b = 0.08;
  let level = series[0] - season[0], trend = 0, err = 0;
  for (let i = 1; i < series.length; i++) {
    const s = season[i % 7], prev = level;
    const predicted = level + trend + s;
    err += Math.abs(series[i] - predicted);
    level = a * (series[i] - s) + (1 - a) * (level + trend);
    trend = b * (level - prev) + (1 - b) * trend;
  }
  const mae = err / (series.length - 1);
  const values = Array.from({ length: horizon }, (_, h) => Math.max(0, level + trend * (h + 1) + season[(series.length + h) % 7]));
  return { values: values.map((v) => Math.round(v * 10) / 10), band: values.map((_, h) => Math.round(mae * 1.3 * Math.sqrt(1 + h / 7) * 10) / 10) };
}

/**
 * A brand's public trust score, 0 to 100: how genuine its scans are (60%), what buyers rate it
 * (25%), and how it handles recalls (15%: every active recall with advice for buyers counts as handled).
 */
export function trustScore(x: { genuinePct: number; rating: number | null; recalls: number; recallsWithAdvice: number }) {
  const rating = x.rating === null ? 0.8 : x.rating / 5;
  const recalls = x.recalls ? x.recallsWithAdvice / x.recalls : 1;
  return Math.round(Math.max(0, Math.min(100, x.genuinePct * 0.6 + rating * 25 + recalls * 15)));
}
