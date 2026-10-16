import type { CellJSON, RuleJSON } from './book';
import { isFormula, shiftFormula } from './formula';
import { formatCode } from './format';
import { keyOf, type Area } from './refs';
import { compare, isErr, numberFrom, readInput, type V } from './values';

// Spreadsheet tools (Stage 5 · Office suite): filling a series by dragging, sorting rows, and
// conditional colours. Import-free; tested in tools.test.ts.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function inList(s: string, list: string[]) {
  const t = s.trim().toLowerCase();
  let i = list.findIndex((x) => x.toLowerCase() === t);
  if (i >= 0) return { i, short: false, upper: s === s.toUpperCase() && s !== s.toLowerCase() };
  i = list.findIndex((x) => x.slice(0, 3).toLowerCase() === t);
  return i >= 0 && t.length === 3 ? { i, short: true, upper: s === s.toUpperCase() } : null;
}

/**
 * What dragging the fill handle makes: `src` are the cells being dragged (as typed, in order), and
 * `n` cells follow. Like Excel: one number is copied, two or more continue their steps; dates go on
 * by a day (or their step), "Item 1" becomes "Item 2", months and weekdays go round, and formulas
 * move their references by `dr` / `dc` per cell.
 */
export function fillSeries(src: string[], n: number, dr: number, dc: number): string[] {
  const out: string[] = [];
  if (!src.length) return out;
  const vals = src.map((s) => readInput(s));
  const allNum = vals.every((x) => typeof x.v === 'number') && !src.some(isFormula);
  if (allNum && src.length >= 2) {
    const xs = vals.map((x) => x.v as number);
    // A straight line through them (equal steps continue exactly).
    const k = xs.length, mx = (k - 1) / 2, my = xs.reduce((t, x) => t + x, 0) / k;
    let sxy = 0, sxx = 0;
    xs.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) ** 2; });
    const slope = sxy / sxx, b = my - slope * mx;
    const isDate = vals.some((x) => x.fmt === 'date');
    for (let j = 0; j < n; j++) {
      const v = Number((b + slope * (k + j)).toPrecision(12));
      out.push(isDate ? formatCode(v, 'yyyy-mm-dd') : String(v));
    }
    return out;
  }
  if (src.length === 1 && vals[0].fmt === 'date') {
    for (let j = 1; j <= n; j++) out.push(formatCode((vals[0].v as number) + j, 'yyyy-mm-dd'));
    return out;
  }
  // Months, weekdays or numbered text all of one kind continue the step between them (Mon, Wed → Fri).
  if (src.length >= 2 && !src.some(isFormula)) {
    for (const list of [MONTHS, DAYS]) {
      const found = src.map((x) => inList(x, list));
      if (found.every(Boolean)) {
        const idx = found.map((f) => f!.i), step = (((idx[1] - idx[0]) % list.length) + list.length) % list.length;
        const last = found[found.length - 1]!;
        for (let j = 1; j <= n; j++) { const w = list[(idx[idx.length - 1] + step * j) % list.length]; const t = last.short ? w.slice(0, 3) : w; out.push(last.upper ? t.toUpperCase() : t); }
        return out;
      }
    }
    const parts = src.map((x) => /^(.*?)(\d+)(\D*)$/.exec(x));
    if (parts.every((m) => m && m[1] === parts[0]![1] && m[3] === parts[0]![3]) && vals.every((x) => typeof x.v === 'string')) {
      const nums = parts.map((m) => Number(m![2])), step = nums[1] - nums[0], width = parts[parts.length - 1]![2].length;
      for (let j = 1; j <= n; j++) out.push(`${parts[0]![1]}${String(nums[nums.length - 1] + step * j).padStart(width, '0')}${parts[0]![3]}`);
      return out;
    }
  }
  for (let j = 0; j < n; j++) {
    const i = j % src.length, round = Math.floor(j / src.length) + 1;
    const s = src[i];
    // How far this new cell is from the one it copies.
    const d = src.length + j - i;
    if (isFormula(s)) { out.push(`=${shiftFormula(s.slice(1), dr * d, dc * d)}`); continue; }
    const month = inList(s, MONTHS), day = inList(s, DAYS);
    const named = month ? { list: MONTHS, ...month } : day ? { list: DAYS, ...day } : null;
    if (named) {
      const step = src.length;
      const w = named.list[(named.i + step * round) % named.list.length];
      const t = named.short ? w.slice(0, 3) : w;
      out.push(named.upper ? t.toUpperCase() : t);
      continue;
    }
    const m = /^(.*?)(\d+)(\D*)$/.exec(s);
    if (m && typeof vals[i].v === 'string') {
      const next = String(Number(m[2]) + round * src.length).padStart(m[2].length, '0');
      out.push(`${m[1]}${next}${m[3]}`);
      continue;
    }
    out.push(s);
  }
  return out;
}

/** Rows of an area sorted by one column (empty cells last, like Excel), as the cells to write:
 *  every cell of the area, moved to its new row (formulas follow, as if each row was copied). */
export function sortArea(cells: (key: string) => CellJSON | undefined, values: (r: number, c: number) => V, a: Area, col: number, asc: boolean, header: boolean): Record<string, CellJSON | null> {
  const first = a.r1 + (header ? 1 : 0);
  const rows: number[] = [];
  for (let r = first; r <= a.r2; r++) rows.push(r);
  rows.sort((x, y) => {
    const p = values(x, col), q = values(y, col);
    const pe = p === null || p === '', qe = q === null || q === '';
    if (pe || qe) return pe && qe ? x - y : pe ? 1 : -1;
    if (isErr(p) || isErr(q)) return isErr(p) && isErr(q) ? x - y : isErr(p) ? 1 : -1;
    return (asc ? 1 : -1) * compare(p, q) || x - y;
  });
  const out: Record<string, CellJSON | null> = {};
  rows.forEach((from, i) => {
    const to = first + i;
    for (let c = a.c1; c <= a.c2; c++) {
      const cell = cells(keyOf(from, c));
      out[keyOf(to, c)] = cell ? (isFormula(cell.v) && from !== to ? { ...cell, v: `=${shiftFormula(cell.v.slice(1), to - from, 0)}` } : cell) : null;
    }
  });
  return out;
}

/** What a rule needs to know about its area once (average, top 10…, smallest and largest). */
export interface RuleStats { avg: number; min: number; max: number; cut: number; seen: Map<string, number> }
export function ruleStats(rule: RuleJSON, vals: V[]): RuleStats {
  const nums = vals.filter((v): v is number => typeof v === 'number');
  const avg = nums.length ? nums.reduce((t, x) => t + x, 0) / nums.length : 0;
  const n = Math.max(1, Math.round(numberFrom(rule.a ?? '10') ?? 10));
  const sorted = [...nums].sort((x, y) => (rule.kind === 'bottom' ? x - y : y - x));
  const seen = new Map<string, number>();
  if (rule.kind === 'dupe') for (const v of vals) if (v !== null && v !== '') { const k = String(v).toLowerCase(); seen.set(k, (seen.get(k) ?? 0) + 1); }
  return { avg, min: nums.length ? Math.min(...nums) : 0, max: nums.length ? Math.max(...nums) : 0, cut: sorted[Math.min(n, sorted.length) - 1] ?? 0, seen };
}

/** The colours a rule gives a value (null: none). Scales blend from red through yellow to green;
 *  bars give how full the bar is (0–1). */
export function ruleLook(rule: RuleJSON, v: V, st: RuleStats): { color?: string; bg?: string; bar?: number } | null {
  const look = { ...(rule.color ? { color: rule.color } : {}), ...(rule.bg ? { bg: rule.bg } : {}) };
  const num = typeof v === 'number' ? v : null;
  const x = numberFrom(rule.a ?? ''), y = numberFrom(rule.b ?? '');
  const empty = v === null || v === '';
  const textOf = (u: V) => (u === null ? '' : isErr(u) ? u.e : String(u)).toLowerCase();
  let hit = false;
  switch (rule.kind) {
    case 'gt': hit = num != null && x != null && num > x; break;
    case 'lt': hit = num != null && x != null && num < x; break;
    case 'between': hit = num != null && x != null && y != null && num >= Math.min(x, y) && num <= Math.max(x, y); break;
    case 'eq': hit = x != null ? num === x : !empty && textOf(v) === (rule.a ?? '').toLowerCase(); break;
    case 'ne': hit = x != null ? num !== x : textOf(v) !== (rule.a ?? '').toLowerCase(); break;
    case 'contains': hit = !!rule.a && textOf(v).includes(rule.a.toLowerCase()); break;
    case 'empty': hit = empty; break;
    case 'notEmpty': hit = !empty; break;
    case 'top': hit = num != null && num >= st.cut; break;
    case 'bottom': hit = num != null && num <= st.cut; break;
    case 'aboveAvg': hit = num != null && num > st.avg; break;
    case 'belowAvg': hit = num != null && num < st.avg; break;
    case 'dupe': hit = !empty && (st.seen.get(String(v).toLowerCase()) ?? 0) > 1; break;
    case 'scale': {
      if (num == null || st.max === st.min) return num == null ? null : { bg: '#ffeb84' };
      const t = (num - st.min) / (st.max - st.min);
      return { bg: blend(t) };
    }
    case 'bars': {
      if (num == null || st.max <= 0) return null;
      return { bar: Math.max(0, Math.min(1, num / st.max)) };
    }
  }
  return hit ? (Object.keys(look).length ? look : { bg: '#fde68a' }) : null;
}

/** Red (0) → yellow (0.5) → green (1), as Excel's three-colour scale. */
function blend(t: number): string {
  const lerp = (a: number[], b: number[], k: number) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
  const red = [248, 105, 107], yellow = [255, 235, 132], green = [99, 190, 123];
  const c = t < 0.5 ? lerp(red, yellow, t * 2) : lerp(yellow, green, (t - 0.5) * 2);
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Plain-words labels for the rule picker. */
export const RULE_LABELS: Record<RuleJSON['kind'], string> = {
  gt: 'Greater than', lt: 'Less than', between: 'Between', eq: 'Equal to', ne: 'Not equal to', contains: 'Text contains',
  empty: 'Is empty', notEmpty: 'Isn’t empty', top: 'Top values', bottom: 'Bottom values', aboveAvg: 'Above average',
  belowAvg: 'Below average', dupe: 'Duplicates', scale: 'Colour scale (red → green)', bars: 'Data bars',
};
