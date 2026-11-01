// Logic for Collaborate → Create's fourth set of tools (M74): text helpers (Morse, numbers in words,
// Roman numerals, fancy letters), maths (fractions, equations, factors), money (loans, savings,
// splitting a bill), age, number bases, name styles, cron, HTML escaping, sample data, the tuner's
// pitch finder, colour-blind views and a photo's hidden location. Pure; tested in more-tools.test.ts.

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...',
  ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '"': '.-..-.', '@': '.--.-.',
};
const FROM_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
/** Text to Morse: letters split by spaces, words by " / ". */
export const toMorse = (t: string) => t.toUpperCase().trim().split(/\s+/).map((w) => [...w].map((c) => MORSE[c] ?? '').filter(Boolean).join(' ')).filter(Boolean).join(' / ');
export const fromMorse = (m: string) => m.trim().split(/\s*\/\s*|\s{3,}/).map((w) => w.split(/\s+/).map((c) => FROM_MORSE[c] ?? '').join('')).join(' ');

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALE = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];
const under1000 = (n: number) => {
  const h = Math.floor(n / 100), r = n % 100, out: string[] = [];
  if (h) out.push(`${ONES[h]} hundred`);
  if (r) out.push((h ? 'and ' : '') + (r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : '')));
  return out.join(' ');
};
/** 1234.5 → "one thousand two hundred and thirty-four point five" (British "and"). */
export function numberToWords(input: string | number): string {
  const s = String(input).trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('Type a number, like 1250 or 3.75.');
  const neg = s.startsWith('-'), [int, dec] = s.replace('-', '').split('.');
  if (int.length > 18) throw new Error('That number is too big.');
  let n = BigInt(int), words: string[] = [], k = 0;
  if (n === BigInt(0)) words = ['zero'];
  while (n > BigInt(0)) { const part = Number(n % BigInt(1000)); if (part) words.unshift(under1000(part) + (SCALE[k] ? ` ${SCALE[k]}` : '')); n /= BigInt(1000); k++; }
  let out = words.join(' ');
  if (dec) out += ` point ${[...dec].map((d) => ONES[+d]).join(' ')}`;
  return (neg ? 'minus ' : '') + out;
}

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) throw new Error('Roman numerals go from 1 to 3999.');
  let out = '';
  for (const [v, r] of ROMAN) while (n >= v) { out += r; n -= v; }
  return out;
}
export function fromRoman(s: string): number {
  const t = s.trim().toUpperCase();
  if (!/^[MDCLXVI]+$/.test(t)) throw new Error('Use the letters I, V, X, L, C, D and M.');
  const val: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let n = 0;
  for (let i = 0; i < t.length; i++) n += val[t[i]] < (val[t[i + 1]] ?? 0) ? -val[t[i]] : val[t[i]];
  if (toRoman(n) !== t) throw new Error(`That isn’t written the usual way (${toRoman(n)} is ${n}).`);
  return n;
}

/** Letter styles for posts and names (Unicode letters, so they paste anywhere). */
export const FANCY = ['Bold', 'Italic', 'Bold italic', 'Sans bold', 'Script', 'Double-struck', 'Monospace', 'Circled', 'Strikethrough', 'Underline'] as const;
export type Fancy = (typeof FANCY)[number];
const BASES: Partial<Record<Fancy, [number, number, number | null]>> = {
  Bold: [0x1d400, 0x1d41a, 0x1d7ce], Italic: [0x1d434, 0x1d44e, null], 'Bold italic': [0x1d468, 0x1d482, null], 'Sans bold': [0x1d5d4, 0x1d5ee, 0x1d7ec],
  Script: [0x1d4d0, 0x1d4ea, null], 'Double-struck': [0x1d538, 0x1d552, 0x1d7d8], Monospace: [0x1d670, 0x1d68a, 0x1d7f6],
};
const HOLES: Record<string, string> = { 'Italic:h': 'ℎ', 'Double-struck:C': 'ℂ', 'Double-struck:H': 'ℍ', 'Double-struck:N': 'ℕ', 'Double-struck:P': 'ℙ', 'Double-struck:Q': 'ℚ', 'Double-struck:R': 'ℝ', 'Double-struck:Z': 'ℤ' };
export function fancy(t: string, style: Fancy): string {
  if (style === 'Strikethrough') return [...t].map((c) => (c === ' ' ? c : `${c}̶`)).join('');
  if (style === 'Underline') return [...t].map((c) => (c === ' ' ? c : `${c}̲`)).join('');
  return [...t].map((c) => {
    const code = c.charCodeAt(0);
    if (style === 'Circled') {
      if (c >= 'A' && c <= 'Z') return String.fromCodePoint(0x24b6 + code - 65);
      if (c >= 'a' && c <= 'z') return String.fromCodePoint(0x24d0 + code - 97);
      if (c === '0') return '⓪';
      if (c >= '1' && c <= '9') return String.fromCodePoint(0x2460 + code - 49);
      return c;
    }
    const [up, low, dig] = BASES[style]!;
    if (HOLES[`${style}:${c}`]) return HOLES[`${style}:${c}`];
    if (c >= 'A' && c <= 'Z') return String.fromCodePoint(up + code - 65);
    if (c >= 'a' && c <= 'z') return String.fromCodePoint(low + code - 97);
    if (dig !== null && c >= '0' && c <= '9') return String.fromCodePoint(dig + code - 48);
    return c;
  }).join('');
}

const letters = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '');
export const isAnagram = (a: string, b: string) => !!letters(a) && [...letters(a)].sort().join('') === [...letters(b)].sort().join('');
export const isPalindrome = (s: string) => !!letters(s) && letters(s) === [...letters(s)].reverse().join('');

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
/** Placeholder text: paragraphs of sentences; the first starts "Lorem ipsum dolor sit amet". */
export function lorem(paragraphs: number, sentences: number, rand: () => number = Math.random): string {
  const word = () => LOREM[Math.floor(rand() * LOREM.length)];
  return Array.from({ length: paragraphs }, (_, p) => Array.from({ length: sentences }, (_, s) => {
    const n = 6 + Math.floor(rand() * 9), w = Array.from({ length: n }, word);
    if (p === 0 && s === 0) w.splice(0, 5, 'lorem', 'ipsum', 'dolor', 'sit', 'amet');
    const t = w.join(' ');
    return `${t[0].toUpperCase()}${t.slice(1)}.`;
  }).join(' ')).join('\n\n');
}

// ── Maths ──
export const gcd = (a: number, b: number): number => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
export const lcm = (a: number, b: number) => (a && b ? Math.abs(a * b) / gcd(a, b) : 0);
export function primeFactors(n: number): number[] {
  const out: number[] = [];
  for (let d = 2; d * d <= n; d++) while (n % d === 0) { out.push(d); n /= d; }
  if (n > 1) out.push(n);
  return out;
}
export const isPrime = (n: number) => Number.isInteger(n) && n > 1 && primeFactors(n).length === 1;
export function divisors(n: number): number[] {
  const lo: number[] = [], hi: number[] = [];
  for (let d = 1; d * d <= n; d++) if (n % d === 0) { lo.push(d); if (d * d !== n) hi.unshift(n / d); }
  return [...lo, ...hi];
}

export type Frac = [number, number];
/** "3/4", "1 1/2", "-2", "0.25" → a fraction in lowest terms. */
export function parseFrac(s: string): Frac {
  const t = s.trim();
  let m = /^(-?)(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (m) return simplify([(m[1] ? -1 : 1) * (+m[2] * +m[4] + +m[3]), +m[4]]);
  m = /^(-?\d+)\/(-?\d+)$/.exec(t);
  if (m) return simplify([+m[1], +m[2]]);
  if (/^-?\d+(\.\d+)?$/.test(t)) { const d = 10 ** (t.split('.')[1]?.length ?? 0); return simplify([Math.round(+t * d), d]); }
  throw new Error(`“${s}” isn’t a fraction like 3/4 or 1 1/2.`);
}
export function simplify([n, d]: Frac): Frac {
  if (!d) throw new Error('A fraction can’t have 0 at the bottom.');
  const g = gcd(n, d) || 1, sign = d < 0 ? -1 : 1;
  return [(sign * n) / g, (sign * d) / g];
}
export function fracOp(a: Frac, op: '+' | '-' | '×' | '÷', b: Frac): Frac {
  if (op === '+') return simplify([a[0] * b[1] + b[0] * a[1], a[1] * b[1]]);
  if (op === '-') return simplify([a[0] * b[1] - b[0] * a[1], a[1] * b[1]]);
  if (op === '×') return simplify([a[0] * b[0], a[1] * b[1]]);
  if (!b[0]) throw new Error('You can’t divide by zero.');
  return simplify([a[0] * b[1], a[1] * b[0]]);
}
export const mixed = ([n, d]: Frac) => (d === 1 ? `${n}` : Math.abs(n) > d ? `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / d)} ${Math.abs(n) % d}/${d}` : `${n}/${d}`);

/** ax² + bx + c = 0 with the working shown; a = 0 is solved as a straight line. */
export function solveQuadratic(a: number, b: number, c: number): { roots: string[]; steps: string[] } {
  const r = (x: number) => String(Math.round(x * 1e6) / 1e6);
  if (!a) {
    if (!b) return { roots: [], steps: [c ? 'No x makes this true.' : 'Every x makes this true.'] };
    return { roots: [r(-c / b)], steps: [`${r(b)}x + ${r(c)} = 0`, `${r(b)}x = ${r(-c)}`, `x = ${r(-c)} ÷ ${r(b)} = ${r(-c / b)}`] };
  }
  const D = b * b - 4 * a * c, steps = [`Discriminant: b² − 4ac = ${r(b)}² − 4 × ${r(a)} × ${r(c)} = ${r(D)}`];
  if (D < 0) {
    const re = r(-b / (2 * a)), im = r(Math.sqrt(-D) / (2 * Math.abs(a)));
    steps.push('It is below 0: no real answers; two complex ones.', `x = ${re} ± ${im}i`);
    return { roots: [`${re} + ${im}i`, `${re} − ${im}i`], steps };
  }
  const x1 = (-b + Math.sqrt(D)) / (2 * a), x2 = (-b - Math.sqrt(D)) / (2 * a);
  steps.push(`x = (−b ± √D) ÷ 2a = (${r(-b)} ± ${r(Math.sqrt(D))}) ÷ ${r(2 * a)}`);
  return { roots: D === 0 ? [r(x1)] : [r(x1), r(x2)], steps };
}

// ── Money and dates ──
/** Monthly instalment (EMI) and the schedule for a loan. */
export function loan(principal: number, annualPct: number, months: number) {
  const i = annualPct / 1200;
  const emi = i ? (principal * i * (1 + i) ** months) / ((1 + i) ** months - 1) : principal / months;
  let left = principal;
  const rows = Array.from({ length: months }, (_, k) => {
    const interest = left * i, paid = emi - interest;
    left = Math.max(0, left - paid);
    return { month: k + 1, interest, principal: paid, left };
  });
  return { emi, total: emi * months, interest: emi * months - principal, rows };
}
/** Savings growing with interest compounded monthly and a deposit each month: the balance per year. */
export function growth(start: number, monthly: number, annualPct: number, years: number) {
  const i = annualPct / 1200, out: { year: number; balance: number; deposited: number }[] = [];
  let bal = start, dep = start;
  for (let m = 1; m <= years * 12; m++) { bal = bal * (1 + i) + monthly; dep += monthly; if (m % 12 === 0) out.push({ year: m / 12, balance: bal, deposited: dep }); }
  return out;
}
/** Exact age between two YYYY-MM-DD dates, and days to the next birthday. */
export function age(birth: string, on: string) {
  const b = new Date(`${birth}T00:00:00Z`), t = new Date(`${on}T00:00:00Z`);
  if (Number.isNaN(+b) || Number.isNaN(+t) || b > t) return null;
  let y = t.getUTCFullYear() - b.getUTCFullYear(), m = t.getUTCMonth() - b.getUTCMonth(), d = t.getUTCDate() - b.getUTCDate();
  if (d < 0) { m--; d += new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)).getUTCDate(); }
  if (m < 0) { y--; m += 12; }
  let next = new Date(Date.UTC(t.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
  if (next < t) next = new Date(Date.UTC(t.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate()));
  return { years: y, months: m, days: d, totalDays: Math.round((+t - +b) / 86_400_000), toBirthday: Math.round((+next - +t) / 86_400_000) };
}
/** Who pays whom so everyone has paid the same share: the fewest payments, biggest first. */
export function settle(paid: { name: string; amount: number }[]) {
  const total = paid.reduce((a, p) => a + p.amount, 0), share = paid.length ? total / paid.length : 0;
  const owe = paid.map((p) => ({ name: p.name, bal: Math.round((p.amount - share) * 100) / 100 }));
  const give = owe.filter((p) => p.bal < 0).sort((a, b) => a.bal - b.bal), get = owe.filter((p) => p.bal > 0).sort((a, b) => b.bal - a.bal);
  const moves: { from: string; to: string; amount: number }[] = [];
  let i = 0, j = 0;
  while (i < give.length && j < get.length) {
    const amt = Math.min(-give[i].bal, get[j].bal);
    if (amt > 0.004) moves.push({ from: give[i].name, to: get[j].name, amount: Math.round(amt * 100) / 100 });
    give[i].bal += amt; get[j].bal -= amt;
    if (Math.abs(give[i].bal) < 0.005) i++;
    if (Math.abs(get[j].bal) < 0.005) j++;
  }
  return { total, share, moves };
}

// ── Code ──
/** A whole number from one base (2–36) to another, any size. */
export function convertBase(v: string, from: number, to: number): string {
  const t = v.trim().toLowerCase().replace(/^0[xbo]/, '').replace(/[\s_]/g, '');
  const neg = t.startsWith('-'), digits = neg ? t.slice(1) : t;
  if (!digits || [...digits].some((c) => { const d = parseInt(c, 36); return Number.isNaN(d) || d >= from; })) throw new Error(`That isn’t a number in base ${from}.`);
  let n = BigInt(0);
  for (const c of digits) n = n * BigInt(from) + BigInt(parseInt(c, 36));
  return (neg ? '-' : '') + n.toString(to);
}
/** One name in the styles code uses. */
export function nameStyles(t: string) {
  const w = t.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((x) => x.toLowerCase());
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  return {
    camelCase: w.map((x, i) => (i ? cap(x) : x)).join(''), PascalCase: w.map(cap).join(''), snake_case: w.join('_'), 'kebab-case': w.join('-'),
    CONSTANT_CASE: w.join('_').toUpperCase(), 'dot.case': w.join('.'), 'Title Case': w.map(cap).join(' '), 'Sentence case': cap(w.join(' ')),
  };
}

const CRON_NAMES = ['minute', 'hour', 'day of the month', 'month', 'day of the week'];
const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function cronField(f: string, k: number): Set<number> {
  const [lo, hi] = RANGES[k], out = new Set<number>();
  const named = f.toLowerCase().replace(/[a-z]{3}/g, (m) => { const i = (k === 3 ? MONTHS : DAYS).findIndex((x) => x.toLowerCase() === m); if (i < 0) throw new Error(`Unknown name “${m}”.`); return String(k === 3 ? i + 1 : i); });
  for (const part of named.split(',')) {
    const [range, stepS] = part.split('/'), step = stepS ? +stepS : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`Bad step in the ${CRON_NAMES[k]}.`);
    let a = lo, b = hi;
    if (range !== '*') { const m = /^(\d+)(?:-(\d+))?$/.exec(range); if (!m) throw new Error(`The ${CRON_NAMES[k]} “${part}” isn’t understood.`); a = +m[1]; b = m[2] ? +m[2] : stepS ? hi : a; }
    if (k === 4) { if (a === 7) a = 0; if (b === 7) b = 6; }
    if (a < lo || b > hi || a > b) throw new Error(`The ${CRON_NAMES[k]} must be ${lo}–${hi}.`);
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}
/** A 5-part cron schedule in words, and its next runs after `from` (UTC). */
export function cron(expr: string, from: Date, count = 5) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('A cron schedule has 5 parts: minute hour day month weekday.');
  const sets = parts.map(cronField);
  const list = (k: number, f: (v: number) => string) => (parts[k] === '*' ? null : [...sets[k]].map(f).join(', '));
  const time = parts[0] !== '*' && parts[1] !== '*' && sets[0].size === 1 && sets[1].size === 1 ? `at ${String([...sets[1]][0]).padStart(2, '0')}:${String([...sets[0]][0]).padStart(2, '0')}` : `${parts[0] === '*' ? 'every minute' : `at minute ${list(0, String)}`}${parts[1] === '*' ? '' : ` past hour ${list(1, String)}`}`;
  const bits = [time, list(2, String) && `on day ${list(2, String)} of the month`, list(3, (v) => MONTHS[v - 1]) && `in ${list(3, (v) => MONTHS[v - 1])}`, list(4, (v) => DAYS[v]) && `on ${list(4, (v) => DAYS[v])}`].filter(Boolean);
  const next: Date[] = [];
  const d = new Date(from); d.setUTCSeconds(0, 0); d.setUTCMinutes(d.getUTCMinutes() + 1);
  const domAny = parts[2] === '*', dowAny = parts[4] === '*';
  for (let i = 0; i < 600_000 && next.length < count; i++) {
    const dayOk = domAny && dowAny ? true : domAny ? sets[4].has(d.getUTCDay()) : dowAny ? sets[2].has(d.getUTCDate()) : sets[2].has(d.getUTCDate()) || sets[4].has(d.getUTCDay());
    if (sets[3].has(d.getUTCMonth() + 1) && dayOk && sets[1].has(d.getUTCHours()) && sets[0].has(d.getUTCMinutes())) next.push(new Date(d));
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  const words = bits.join(', ');
  return { words: words.charAt(0).toUpperCase() + words.slice(1), next };
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ESC[c]);
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', euro: '€', pound: '£', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export const unescapeHtml = (t: string) => t.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m; }
  return NAMED[e.toLowerCase()] ?? m;
});

const FIRST = ['Aisha', 'Ben', 'Chen', 'Dara', 'Elif', 'Finn', 'Grace', 'Hiro', 'Isha', 'Jonas', 'Kofi', 'Lena', 'Mateo', 'Nia', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sami', 'Tara', 'Umar', 'Vera', 'Wei', 'Yara', 'Zane'];
const LAST = ['Khan', 'Smith', 'Okafor', 'Garcia', 'Nguyen', 'Patel', 'Kim', 'Silva', 'Müller', 'Rossi', 'Haddad', 'Sato', 'Mensah', 'Novak', 'Ali'];
const CITIES = ['Mumbai', 'Lagos', 'London', 'São Paulo', 'Nairobi', 'Tokyo', 'Berlin', 'Toronto', 'Dubai', 'Sydney', 'Delhi', 'Cairo'];
export const MOCK_FIELDS = ['id', 'name', 'email', 'age', 'city', 'score', 'joined', 'active'] as const;
export type MockField = (typeof MOCK_FIELDS)[number];
/** Made-up rows for testing (emails on example.com, which never delivers). */
export function mockRows(n: number, fields: MockField[], rand: () => number = Math.random) {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  return Array.from({ length: n }, (_, i) => {
    const first = pick(FIRST), last = pick(LAST), row: Record<string, string | number | boolean> = {};
    for (const f of fields) {
      if (f === 'id') row.id = i + 1;
      if (f === 'name') row.name = `${first} ${last}`;
      if (f === 'email') row.email = `${first}.${last}${i + 1}@example.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (f === 'age') row.age = 16 + Math.floor(rand() * 50);
      if (f === 'city') row.city = pick(CITIES);
      if (f === 'score') row.score = Math.round(rand() * 1000) / 10;
      if (f === 'joined') row.joined = new Date(Date.UTC(2024, 0, 1) + Math.floor(rand() * 900) * 86_400_000).toISOString().slice(0, 10);
      if (f === 'active') row.active = rand() > 0.3;
    }
    return row;
  });
}

// ── Sound and pictures ──
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** The nearest note to a frequency (A4 = 440 Hz) and how many cents off it is. */
export function noteOf(freq: number) {
  const midi = 69 + 12 * Math.log2(freq / 440), near = Math.round(midi);
  return { note: NOTES[((near % 12) + 12) % 12], octave: Math.floor(near / 12) - 1, cents: Math.round((midi - near) * 100), target: 440 * 2 ** ((near - 69) / 12) };
}
/** The main pitch in a sound sample (autocorrelation), or null when it's too quiet or unclear. */
export function detectPitch(buf: Float32Array, rate: number): number | null {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / n) < 0.01) return null;
  const minLag = Math.floor(rate / 1500), maxLag = Math.min(Math.floor(rate / 50), n - 1);
  const corr = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) { let s = 0; for (let i = 0; i + lag < n; i++) s += buf[i] * buf[i + lag]; corr[lag] = s; }
  let best = -1, bestLag = 0;
  // The first strong peak after the correlation first dips (avoids octave mistakes).
  let lag = minLag;
  while (lag < maxLag && corr[lag] > corr[lag + 1]) lag++;
  for (; lag <= maxLag; lag++) if (corr[lag] > best) { best = corr[lag]; bestLag = lag; }
  if (!bestLag || best <= 0) return null;
  const a = corr[bestLag - 1] ?? 0, b = corr[bestLag], c = corr[bestLag + 1] ?? 0, shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return rate / (bestLag + (Number.isFinite(shift) ? shift : 0));
}

/** How people with each kind of colour blindness see colours (linear RGB matrices, Machado 2009, full strength). */
export const COLOUR_BLIND: Record<string, number[]> = {
  'Red-blind (protanopia)': [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  'Green-blind (deuteranopia)': [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  'Blue-blind (tritanopia)': [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  'No colour (achromatopsia)': [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
};
const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const srgb = (c: number) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)));
/** Applies a colour-blind matrix to RGBA pixels in place. */
export function simulateColourBlind(px: Uint8ClampedArray, m: number[]) {
  const table = new Float32Array(256).map((_, i) => lin(i));
  for (let i = 0; i < px.length; i += 4) {
    const r = table[px[i]], g = table[px[i + 1]], b = table[px[i + 2]];
    px[i] = srgb(m[0] * r + m[1] * g + m[2] * b); px[i + 1] = srgb(m[3] * r + m[4] * g + m[5] * b); px[i + 2] = srgb(m[6] * r + m[7] * g + m[8] * b);
  }
  return px;
}

/** What a JPEG carries besides the picture: camera details (EXIF) and whether that includes a location (GPS). */
export function jpegDetails(bytes: Uint8Array): { exif: boolean; gps: boolean } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return { exif: false, gps: false };
  let i = 2;
  while (i + 4 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1], len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xe1 && String.fromCharCode(...bytes.slice(i + 4, i + 8)) === 'Exif') {
      const t = i + 10, le = bytes[t] === 0x49;
      const u16 = (o: number) => (le ? bytes[t + o] | (bytes[t + o + 1] << 8) : (bytes[t + o] << 8) | bytes[t + o + 1]);
      const u32 = (o: number) => (le ? (bytes[t + o] | (bytes[t + o + 1] << 8) | (bytes[t + o + 2] << 16)) + bytes[t + o + 3] * 2 ** 24 : bytes[t + o] * 2 ** 24 + ((bytes[t + o + 1] << 16) | (bytes[t + o + 2] << 8) | bytes[t + o + 3]));
      const ifd = u32(4), count = u16(ifd);
      let gps = false;
      for (let k = 0; k < count; k++) if (u16(ifd + 2 + k * 12) === 0x8825) gps = true;
      return { exif: true, gps };
    }
    if (marker === 0xda) break;
    i += 2 + len;
  }
  return { exif: false, gps: false };
}
