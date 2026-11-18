// A brand's area alerts for copies (M308): which countries it watches, how many likely copies in a day
// (scans the checker calls suspect, plus fakes buyers reported) set off an alert, and whether a cluster
// anywhere counts (the 0.5° cell copies were seen in, as the Radar shows). One alert per area a day.

export type Watch = { countries: string[]; threshold: number; anywhere: boolean };
export const THRESHOLDS = [1, 3, 5, 10, 25] as const;
export const DEFAULT_WATCH: Watch = { countries: [], threshold: 3, anywhere: true };

export function cleanWatch(raw: unknown): Watch {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const countries = Array.isArray(o.countries) ? [...new Set(o.countries.filter((c): c is string => typeof c === 'string' && /^[A-Za-z]{2}$/.test(c)).map((c) => c.toUpperCase()))].slice(0, 40) : [];
  const t = Number(o.threshold);
  return { countries, threshold: (THRESHOLDS as readonly number[]).includes(t) ? t : DEFAULT_WATCH.threshold, anywhere: o.anywhere === undefined ? DEFAULT_WATCH.anywhere : o.anywhere === true };
}

/** The area a copy was seen in, for this brand's watch: its country if watched, else its 0.5° cell when clusters anywhere count. */
export function areaOf(w: Watch, at: { country: string | null; lat: number | null; lng: number | null }): string | null {
  if (at.country && w.countries.includes(at.country.toUpperCase())) return `c:${at.country.toUpperCase()}`;
  if (w.anywhere && at.lat !== null && at.lng !== null) return `g:${(Math.floor(at.lat * 2) / 2).toFixed(1)},${(Math.floor(at.lng * 2) / 2).toFixed(1)}`;
  return null;
}

/** Whether this area may be told again (not in the last 24 hours). */
export function mayTell(sent: Record<string, string>, area: string, now = Date.now()) {
  const last = Date.parse(sent[area] ?? '');
  return !Number.isFinite(last) || now - last > 24 * 3600_000;
}

/** The last-told list, without areas older than two days (kept short). */
export function prune(sent: Record<string, string>, now = Date.now()): Record<string, string> {
  return Object.fromEntries(Object.entries(sent).filter(([, at]) => now - Date.parse(at) < 48 * 3600_000).slice(-200));
}
