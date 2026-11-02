// Collaborate → Create's second set of quick tools (M71): the logic, all in the browser.

/** Replace text, plain or whole words, matching case or not; how many were replaced. */
export function findReplace(t: string, find: string, put: string, o: { caseSensitive?: boolean; words?: boolean } = {}) {
  if (!find) return { text: t, count: 0 };
  const esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(o.words ? `(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])` : esc, `gu${o.caseSensitive ? '' : 'i'}`);
  let count = 0;
  const text = t.replace(re, () => { count++; return put; });
  return { text, count };
}

/** Syllables in an English word (a good estimate). */
export function syllables(w: string) {
  const s = w.toLowerCase().replace(/[^a-z]/g, '');
  if (s.length <= 3) return s ? 1 : 0;
  const m = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, m?.length ?? 1);
}
/** Flesch reading ease (higher is easier) and the school grade it suits. */
export function readability(t: string) {
  const words: string[] = t.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  const sentences = Math.max(1, t.split(/[.!?]+(?:\s|$)/).filter((s) => /[A-Za-z]/.test(s)).length);
  if (!words.length) return null;
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const ease = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
  const label = ease >= 80 ? 'Easy' : ease >= 60 ? 'Plain' : ease >= 40 ? 'Fairly hard' : 'Hard';
  return { ease: Math.round(ease), grade: Math.max(1, Math.round(grade)), label, wordsPerSentence: Math.round((words.length / sentences) * 10) / 10 };
}

export interface Source { authors: string; title: string; site?: string; year?: string; url?: string; accessed?: string }
/** A reference in APA (7th) or MLA (9th) style, from "Last, First; Last, First" authors. */
export function cite(s: Source, style: 'apa' | 'mla'): string {
  const people = s.authors.split(';').map((a) => a.trim()).filter(Boolean).map((a) => { const [last, first = ''] = a.split(',').map((x) => x.trim()); return { last, first }; });
  const t = s.title.trim().replace(/\.$/, '');
  if (style === 'apa') {
    const names = people.map((p) => `${p.last}${p.first ? `, ${p.first.split(/\s+/).map((n) => `${n[0]}.`).join(' ')}` : ''}`);
    const who = names.length > 1 ? `${names.slice(0, -1).join(', ')}, & ${names.at(-1)}` : names[0] ?? '';
    return [`${who}${who ? ' ' : ''}(${s.year || 'n.d.'}).`, `${t}.`, s.site ? `${s.site}.` : '', s.url ?? ''].filter(Boolean).join(' ');
  }
  const who = people.length > 2 ? `${people[0].last}, ${people[0].first}, et al.` : people.length === 2 ? `${people[0].last}, ${people[0].first}, and ${people[1].first} ${people[1].last}.` : people[0] ? `${people[0].last}, ${people[0].first}.` : '';
  return [who, `“${t}.”`, s.site ? `${s.site},` : '', s.year ? `${s.year},` : '', s.url ? `${s.url}.` : '', s.accessed ? `Accessed ${s.accessed}.` : ''].filter(Boolean).join(' ').replace(/,$/, '.');
}

/** A safe calculator (no eval): + − × ÷ ^ %, brackets, sqrt, sin, cos, tan, log, ln, abs, round, pi, e. */
export function calc(src: string): number {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  const FN: Record<string, (x: number) => number> = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round };
  const atom = (): number => {
    if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error('A bracket is missing.'); return v; }
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    const word = /^[a-z]+/.exec(s.slice(i))?.[0];
    if (word) { i += word.length; if (word === 'pi') return Math.PI; if (word === 'e') return Math.E; const f = FN[word]; if (!f) throw new Error(`Unknown: ${word}`); return f(atom()); }
    const n = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i))?.[0];
    if (!n) throw new Error('Something is missing.');
    i += n.length; return Number(n);
  };
  const factor = (): number => { let v = atom(); if (peek() === '%') { i++; v /= 100; } if (peek() === '^') { i++; v **= factor(); } return v; };
  const term = (): number => { let v = factor(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : v / r; } return v; };
  const expr = (): number => { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  const v = expr();
  if (i < s.length) throw new Error(`Not understood at “${s.slice(i)}”.`);
  return v;
}

/** Units per kind, each as how many of the base unit it is. Temperature is handled apart. */
export const UNITS: Record<string, Record<string, number>> = {
  Length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, inch: 0.0254, foot: 0.3048, yard: 0.9144, mile: 1609.344 },
  Weight: { mg: 0.000001, g: 0.001, kg: 1, tonne: 1000, ounce: 0.028349523125, pound: 0.45359237, stone: 6.35029318 },
  Area: { 'cm²': 0.0001, 'm²': 1, hectare: 10000, 'km²': 1e6, 'ft²': 0.09290304, acre: 4046.8564224 },
  Volume: { ml: 0.001, litre: 1, 'm³': 1000, teaspoon: 0.00492892, cup: 0.2365882365, gallon: 3.785411784 },
  Speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 0.514444 },
  Data: { byte: 1, KB: 1000, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824 },
  Time: { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, year: 31557600 },
  Temperature: { '°C': 0, '°F': 0, K: 0 },
};
export function convertUnit(kind: string, v: number, from: string, to: string): number {
  if (kind === 'Temperature') {
    const c = from === '°F' ? (v - 32) * 5 / 9 : from === 'K' ? v - 273.15 : v;
    return to === '°F' ? c * 9 / 5 + 32 : to === 'K' ? c + 273.15 : c;
  }
  return (v * UNITS[kind][from]) / UNITS[kind][to];
}

/** People into n groups at random (a fair shuffle). */
export function groups<T>(items: T[], n: number, rand: () => number = Math.random): T[][] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const out: T[][] = Array.from({ length: Math.max(1, Math.min(n, a.length || 1)) }, () => []);
  a.forEach((x, i) => out[i % out.length].push(x));
  return out;
}

/** Days between two dates (YYYY-MM-DD), and the weekdays (Monday to Friday) among them. */
export function daysBetween(a: string, b: string) {
  const d0 = Date.parse(`${a}T00:00:00Z`), d1 = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(d0) || Number.isNaN(d1)) return null;
  const [lo, hi] = d0 <= d1 ? [d0, d1] : [d1, d0], days = Math.round((hi - lo) / 86_400_000);
  let weekdays = 0;
  for (let t = lo; t < hi; t += 86_400_000) { const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) weekdays++; }
  return { days, weeks: Math.floor(days / 7), weekdays };
}
export const addDays = (a: string, n: number) => new Date(Date.parse(`${a}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** #rgb or #rrggbb → [r, g, b], or null. */
export function hexRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((k) => parseInt(full.slice(k, k + 2), 16)) as [number, number, number];
}
export function rgbHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
}
/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string, b: string): number | null {
  const x = hexRgb(a), y = hexRgb(b);
  if (!x || !y) return null;
  const lum = (c: [number, number, number]) => { const [r, g, bb] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bb; };
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** A Unix time (seconds or milliseconds) or a date text → milliseconds, or null. */
export function toMillis(v: string): number | null {
  const t = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) { const n = Number(t); return Math.abs(n) < 1e11 ? n * 1000 : n; }
  const d = Date.parse(t);
  return Number.isNaN(d) ? null : d;
}

/** A web address in parts, with its query as name/value pairs. */
export function urlParts(u: string) {
  try {
    const x = new URL(u.trim());
    return { protocol: x.protocol.replace(':', ''), host: x.host, path: decodeURIComponent(x.pathname), hash: x.hash.slice(1), query: [...x.searchParams] };
  } catch { return null; }
}

/** The readable parts of a JWT (header and payload). It is never checked or sent anywhere. */
export function jwtParts(t: string) {
  const [h, p] = t.trim().split('.');
  const dec = (s: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0)))) as Record<string, unknown>;
  try { return { header: dec(h), payload: dec(p) }; } catch { return null; }
}

/** A random password from the chosen kinds of characters (crypto-strong). */
export function password(len: number, kinds: { lower?: boolean; upper?: boolean; digits?: boolean; symbols?: boolean }) {
  const set = [kinds.lower && 'abcdefghijkmnopqrstuvwxyz', kinds.upper && 'ABCDEFGHJKLMNPQRSTUVWXYZ', kinds.digits && '23456789', kinds.symbols && '!@#$%^&*-_=+?'].filter(Boolean).join('') || 'abcdefghijkmnopqrstuvwxyz';
  const r = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(r, (x) => set[x % set.length]).join('');
}
