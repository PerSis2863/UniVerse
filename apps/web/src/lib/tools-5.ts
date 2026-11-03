// Logic for Collaborate → Create's fifth set (M75): typing scores, haiku syllables, molar mass,
// triangles, matrices, line of best fit, sample sizes, colour mixing, type scales, CSV to SQL, JSON to
// TypeScript, file permissions, IP subnets, timesheets, bingo cards, ASCII art and blob shapes.
// Pure; tested in tools-5.test.ts.

import { ELEMENTS } from './elements';
import { syllables } from './quick-tools-2';

/** Typing: words a minute (5 letters = a word) and accuracy, comparing what was typed with the target. */
export function typingScore(target: string, typed: string, ms: number) {
  let right = 0;
  for (let i = 0; i < typed.length; i++) if (typed[i] === target[i]) right++;
  const min = Math.max(ms, 1) / 60000;
  return { wpm: Math.round(right / 5 / min), raw: Math.round(typed.length / 5 / min), accuracy: typed.length ? Math.round((right / typed.length) * 100) : 100, errors: typed.length - right };
}

/** Syllables per line, and whether it's a haiku (5, 7, 5). */
export function poemLines(t: string) {
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ line: l, syllables: (l.match(/[\p{L}']+/gu) ?? ([] as string[])).reduce((a: number, w) => a + syllables(w), 0) }));
  return { lines, haiku: lines.length === 3 && lines.map((l) => l.syllables).join() === '5,7,5' };
}

const MASS = new Map(ELEMENTS.map((e) => [e.symbol, Number(e.mass.replace(/[[\]]/g, ''))]));
/** Molar mass of a formula like H2O, Ca(OH)2, CuSO4·5H2O; also the mass of each element. */
export function molarMass(f: string): { total: number; parts: [string, number, number][] } {
  const count = new Map<string, number>();
  const parse = (s: string, mult: number) => {
    let i = 0;
    const stack: Map<string, number>[] = [new Map()];
    const num = () => { const m = /^\d+/.exec(s.slice(i)); if (!m) return 1; i += m[0].length; return +m[0]; };
    while (i < s.length) {
      const c = s[i];
      if (c === '(' || c === '[') { stack.push(new Map()); i++; }
      else if (c === ')' || c === ']') {
        i++; const n = num(), top = stack.pop();
        if (!top || !stack.length) throw new Error('A bracket doesn’t match.');
        for (const [k, v] of top) stack[stack.length - 1].set(k, (stack[stack.length - 1].get(k) ?? 0) + v * n);
      } else {
        const m = /^[A-Z][a-z]?/.exec(s.slice(i));
        if (!m) throw new Error(`Not understood at “${s.slice(i)}”.`);
        if (!MASS.has(m[0])) throw new Error(`“${m[0]}” isn’t an element.`);
        i += m[0].length; const n = num(), top = stack[stack.length - 1];
        top.set(m[0], (top.get(m[0]) ?? 0) + n);
      }
    }
    if (stack.length !== 1) throw new Error('A bracket is missing.');
    for (const [k, v] of stack[0]) count.set(k, (count.get(k) ?? 0) + v * mult);
  };
  const clean = f.replace(/\s+/g, '');
  if (!clean) throw new Error('Type a formula, like H2O.');
  for (const part of clean.split(/[·.*]/)) { const m = /^(\d*)(.+)$/.exec(part); if (!m) continue; parse(m[2], m[1] ? +m[1] : 1); }
  const parts = [...count].map(([el, n]) => [el, n, n * MASS.get(el)!] as [string, number, number]);
  return { total: parts.reduce((a, p) => a + p[2], 0), parts };
}

const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
/** A triangle from any three of sides a, b, c and angles A, B, C (degrees; at least one side). */
export function solveTriangle(k: { a?: number; b?: number; c?: number; A?: number; B?: number; C?: number }) {
  let { a, b, c, A, B, C } = k;
  const known = [a, b, c, A, B, C].filter((x) => x !== undefined && x > 0).length;
  if (known < 3 || [a, b, c].every((x) => !x)) throw new Error('Give three values, at least one of them a side.');
  const angles = () => { if (A && B && !C) C = 180 - A - B; if (A && C && !B) B = 180 - A - C; if (B && C && !A) A = 180 - B - C; };
  for (let pass = 0; pass < 4; pass++) {
    angles();
    if (a && b && c && !A) { A = deg(Math.acos((b * b + c * c - a * a) / (2 * b * c))); B = deg(Math.acos((a * a + c * c - b * b) / (2 * a * c))); }
    if (a && b && C && !c) c = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(rad(C)));
    if (b && c && A && !a) a = Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(rad(A)));
    if (a && c && B && !b) b = Math.sqrt(a * a + c * c - 2 * a * c * Math.cos(rad(B)));
    // Sine rule for the rest (an angle and its opposite side known).
    const ratio = a && A ? a / Math.sin(rad(A)) : b && B ? b / Math.sin(rad(B)) : c && C ? c / Math.sin(rad(C)) : 0;
    if (ratio) {
      if (!A && a) A = deg(Math.asin(Math.min(1, a / ratio)));
      if (!B && b) B = deg(Math.asin(Math.min(1, b / ratio)));
      if (!C && c) C = deg(Math.asin(Math.min(1, c / ratio)));
      angles();
      if (!a && A) a = ratio * Math.sin(rad(A));
      if (!b && B) b = ratio * Math.sin(rad(B));
      if (!c && C) c = ratio * Math.sin(rad(C));
    }
  }
  if (!(a && b && c && A && B && C) || A + B + C > 180.01 || [a, b, c, A, B, C].some((x) => !Number.isFinite(x) || x <= 0)) throw new Error('These values can’t make a triangle.');
  const s = (a + b + c) / 2;
  return { a, b, c, A, B, C, area: Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c))), perimeter: a + b + c };
}

export type Matrix = number[][];
export const matMul = (x: Matrix, y: Matrix): Matrix => {
  if (x[0].length !== y.length) throw new Error('The first needs as many columns as the second has rows.');
  return x.map((r) => y[0].map((_, j) => r.reduce((a, v, k) => a + v * y[k][j], 0)));
};
export function det(m: Matrix): number {
  if (m.length !== m[0]?.length) throw new Error('Only square matrices have a determinant.');
  if (m.length === 1) return m[0][0];
  if (m.length === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
  return m[0].reduce((a, v, j) => a + (j % 2 ? -1 : 1) * v * det(m.slice(1).map((r) => r.filter((_, k) => k !== j))), 0);
}
export function inverse(m: Matrix): Matrix {
  const n = m.length, d = det(m);
  if (Math.abs(d) < 1e-12) throw new Error('This matrix has no inverse (its determinant is 0).');
  const a = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const pv = a[c][c]; a[c] = a[c].map((v) => v / pv);
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; a[r] = a[r].map((v, k) => v - f * a[c][k]); }
  }
  return a.map((r) => r.slice(n));
}

/** Line of best fit (least squares): y = slope·x + intercept, and how well it fits (r²). */
export function regression(pts: [number, number][]) {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxy = pts.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0), sxx = pts.reduce((a, [x]) => a + (x - mx) ** 2, 0), syy = pts.reduce((a, [, y]) => a + (y - my) ** 2, 0);
  if (!sxx) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy ? (sxy * sxy) / (sxx * syy) : 1, r: syy ? sxy / Math.sqrt(sxx * syy) : 1 };
}

/** People to ask in a survey: confidence (90/95/99), margin of error (%), population (0 = very large). */
export function sampleSize(confidence: 90 | 95 | 99, marginPct: number, population: number, p = 0.5) {
  const z = { 90: 1.645, 95: 1.96, 99: 2.576 }[confidence], e = marginPct / 100;
  const n0 = (z * z * p * (1 - p)) / (e * e);
  return Math.ceil(population > 0 ? n0 / (1 + (n0 - 1) / population) : n0);
}

const hex = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** Two colours mixed (t = share of the second), in linear light like real paint on a screen. */
export function mix(a: string, b: string, t: number) {
  const lin = (v: number) => (v / 255) ** 2.2, out = (v: number) => 255 * v ** (1 / 2.2);
  const x = hex(a), y = hex(b);
  return toHex(x.map((v, i) => out(lin(v) * (1 - t) + lin(y[i]) * t)));
}
/** Tints (towards white) and shades (towards black) of one colour. */
export const tintsShades = (c: string, n = 5) => ({ tints: Array.from({ length: n }, (_, i) => mix(c, '#ffffff', (i + 1) / (n + 1))), shades: Array.from({ length: n }, (_, i) => mix(c, '#000000', (i + 1) / (n + 1))) });

/** A type scale: sizes from small to large, each `ratio` times the last. */
export const typeScale = (base: number, ratio: number, steps = [-2, -1, 0, 1, 2, 3, 4, 5]) => steps.map((s) => ({ step: s, px: Math.round(base * ratio ** s * 100) / 100 }));

const sqlStr = (v: string) => `'${v.replace(/'/g, "''")}'`;
/** CSV rows into a CREATE TABLE and INSERT statements (numbers left bare, text quoted safely). */
export function csvToSql(rows: string[][], table: string) {
  const [head, ...body] = rows;
  if (!head?.length) return '';
  const name = table.replace(/\W+/g, '_') || 'my_table', cols = head.map((h, i) => h.trim().replace(/\W+/g, '_').replace(/^(\d)/, '_$1') || `col${i + 1}`);
  const numeric = cols.map((_, i) => body.length > 0 && body.every((r) => r[i] === undefined || r[i] === '' || /^-?\d+(\.\d+)?$/.test(r[i])));
  const create = `CREATE TABLE ${name} (\n${cols.map((c, i) => `  ${c} ${numeric[i] ? 'NUMERIC' : 'TEXT'}`).join(',\n')}\n);`;
  const inserts = body.map((r) => `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map((_, i) => (r[i] === undefined || r[i] === '' ? 'NULL' : numeric[i] ? r[i] : sqlStr(r[i]))).join(', ')});`);
  return [create, ...inserts].join('\n');
}

/** TypeScript types for a JSON value (objects become interfaces, arrays use their items' shape). */
export function jsonToTs(v: unknown, root = 'Root'): string {
  const out: string[] = [], names = new Set<string>();
  const pascal = (k: string) => (k.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/^\d/, '_$&') || 'Item');
  const typeOf = (x: unknown, name: string): string => {
    if (x === null) return 'null';
    if (Array.isArray(x)) { const ts = [...new Set(x.map((i) => typeOf(i, `${name}Item`)))]; return ts.length ? (ts.length === 1 ? `${ts[0]}[]` : `(${ts.join(' | ')})[]`) : 'unknown[]'; }
    if (typeof x === 'object') {
      let n = pascal(name), k = 2; while (names.has(n)) n = `${pascal(name)}${k++}`; names.add(n);
      const fields = Object.entries(x as Record<string, unknown>).map(([key, val]) => `  ${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}: ${typeOf(val, key)};`);
      out.push(`export interface ${n} {\n${fields.join('\n')}\n}`);
      return n;
    }
    return typeof x === 'number' ? 'number' : typeof x === 'boolean' ? 'boolean' : 'string';
  };
  const top = typeOf(v, root);
  if (!out.length || top !== pascal(root)) out.push(`export type ${pascal(root)}Value = ${top};`);
  return out.reverse().join('\n\n');
}

/** File permissions: "755" ↔ "rwxr-xr-x". */
export const chmodText = (oct: string) => { if (!/^[0-7]{3}$/.test(oct)) throw new Error('Three digits from 0 to 7, like 755.'); return [...oct].map((d) => { const n = +d; return `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`; }).join(''); };
export const chmodOctal = (t: string) => { if (!/^[r-][w-][x-]{1}[r-][w-][x-][r-][w-][x-]$/.test(t)) throw new Error('Nine letters like rwxr-xr-x.'); return [0, 3, 6].map((i) => (t[i] === 'r' ? 4 : 0) + (t[i + 1] === 'w' ? 2 : 0) + (t[i + 2] === 'x' ? 1 : 0)).join(''); };

const ipNum = (ip: string) => { const p = ip.split('.').map(Number); if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) throw new Error('An address is four numbers 0–255, like 192.168.1.10.'); return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]; };
const ipText = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
/** An IPv4 network from "192.168.1.10/24": its range, mask and how many devices fit. */
export function subnet(cidr: string) {
  const [ip, bitsS = '32'] = cidr.trim().split('/'), bits = +bitsS;
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error('The part after / is 0 to 32.');
  const n = ipNum(ip), mask = bits ? (0xffffffff << (32 - bits)) >>> 0 : 0, net = (n & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0;
  const hosts = bits >= 31 ? 2 ** (32 - bits) : 2 ** (32 - bits) - 2;
  return { network: ipText(net), broadcast: ipText(bc), mask: ipText(mask), first: ipText(bits >= 31 ? net : net + 1), last: ipText(bits >= 31 ? bc : bc - 1), hosts, private: /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ipText(net)) };
}

/** Hours worked from "09:00"–"17:30" with a break in minutes; overnight shifts allowed. */
export function shiftHours(start: string, end: string, breakMin: number) {
  const m = (t: string) => { const x = /^(\d{1,2}):(\d{2})$/.exec(t.trim()); if (!x || +x[1] > 23 || +x[2] > 59) return null; return +x[1] * 60 + +x[2]; };
  const a = m(start), b = m(end);
  if (a === null || b === null) return null;
  return Math.max(0, ((b - a + 1440) % 1440 || (b === a ? 0 : 1440)) - Math.max(0, breakMin)) / 60;
}

/** A 5×5 bingo card with a free middle: 1–15, 16–30, 31–45, 46–60, 61–75 down the columns. */
export function bingoCard(rand: () => number = Math.random): (number | null)[][] {
  const cols = Array.from({ length: 5 }, (_, c) => {
    const pool = Array.from({ length: 15 }, (_, i) => c * 15 + i + 1);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 5);
  });
  return Array.from({ length: 5 }, (_, r) => cols.map((col, c) => (r === 2 && c === 2 ? null : col[r])));
}

/** RGBA pixels (width w) to ASCII art, darker pixels to denser characters. */
export function asciiArt(px: Uint8ClampedArray, w: number, h: number, cols: number, invert = false) {
  const ramp = ' .:-=+*#%@', rows = Math.round((h / w) * cols * 0.5), cw = w / cols, ch = h / rows, out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const x = Math.min(w - 1, Math.floor((c + 0.5) * cw)), y = Math.min(h - 1, Math.floor((r + 0.5) * ch)), i = (y * w + x) * 4;
      const lum = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255 * (px[i + 3] / 255) + (1 - px[i + 3] / 255);
      const k = Math.round((invert ? lum : 1 - lum) * (ramp.length - 1));
      line += ramp[Math.max(0, Math.min(ramp.length - 1, k))];
    }
    out.push(line.trimEnd());
  }
  return out.join('\n');
}

/** A soft blob shape as an SVG path (points around a circle pushed in and out, smoothly). */
export function blobPath(points: number, wobble: number, rand: () => number = Math.random, size = 200) {
  const c = size / 2, pts = Array.from({ length: points }, (_, i) => { const a = (i / points) * Math.PI * 2, r = c * 0.7 * (1 - wobble / 2 + rand() * wobble); return [c + r * Math.cos(a), c + r * Math.sin(a)]; });
  const mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = `M${mid(pts[points - 1], pts[0]).map((v) => v.toFixed(1)).join(',')}`;
  for (let i = 0; i < points; i++) { const p = pts[i], m = mid(p, pts[(i + 1) % points]); d += ` Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${m[0].toFixed(1)},${m[1].toFixed(1)}`; }
  return `${d} Z`;
}
