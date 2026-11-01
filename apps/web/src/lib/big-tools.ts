// Logic for Collaborate → Create's bigger tools (M72): the graph plotter's maths, statistics, the
// flowchart and mind-map layouts, word searches, Code 128 barcodes, study plans, flashcard boxes,
// decision scores, word clouds, invoices and streaks. Pure functions, tested in big-tools.test.ts.

/** Turns "2x^2 + sin(x)" into a fast function of x (no eval). Implicit times: 2x, 3(x+1), x sin(x). */
export function compile(src: string): (x: number) => number {
  const s = src.toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '').replace(/^y=/, '');
  if (!s) throw new Error('Type a formula, like x^2.');
  let i = 0;
  type F = (x: number) => number;
  const FN: Record<string, (v: number) => number> = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sqrt: Math.sqrt,
    abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  };
  const starts = () => i < s.length && /[a-z\d.(]/.test(s[i]);
  const atom = (): F => {
    const c = s[i];
    if (c === '(') { i++; const f = expr(); if (s[i++] !== ')') throw new Error('A bracket is missing.'); return f; }
    if (c === '-') { i++; const f = power(); return (x) => -f(x); }
    if (c === '+') { i++; return power(); }
    const word = /^[a-z]+/.exec(s.slice(i))?.[0];
    if (word) {
      const fn = Object.keys(FN).sort((a, b) => b.length - a.length).find((k) => word.startsWith(k));
      if (fn) { i += fn.length; const g = FN[fn], f = power(); return (x) => g(f(x)); }
      if (word.startsWith('pi')) { i += 2; return () => Math.PI; }
      if (word[0] === 'x') { i += 1; return (x) => x; }
      if (word[0] === 'e') { i += 1; return () => Math.E; }
      throw new Error(`Unknown: ${word}`);
    }
    const n = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i))?.[0];
    if (!n) throw new Error(i >= s.length ? 'Something is missing at the end.' : `Not understood at “${s.slice(i)}”.`);
    i += n.length; const v = Number(n); return () => v;
  };
  const power = (): F => { const b = atom(); if (s[i] === '^') { i++; const e = power(); return (x) => b(x) ** e(x); } return b; };
  const term = (): F => {
    let f = power();
    for (;;) {
      if (s[i] === '*' || s[i] === '/') { const op = s[i++], a = f, b = power(); f = op === '*' ? (x) => a(x) * b(x) : (x) => a(x) / b(x); }
      else if (starts()) { const a = f, b = power(); f = (x) => a(x) * b(x); }
      else return f;
    }
  };
  const expr = (): F => {
    let f = term();
    while (s[i] === '+' || s[i] === '-') { const op = s[i++], a = f, b = term(); f = op === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x); }
    return f;
  };
  const f = expr();
  if (i < s.length) throw new Error(`Not understood at “${s.slice(i)}”.`);
  return f;
}

/** Numbers out of any text (commas, spaces, new lines). */
export const numbers = (t: string) => (t.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []).map(Number).filter(Number.isFinite);

const quantile = (sorted: number[], q: number) => {
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
};
/** Everything a statistics lesson asks for. */
export function stats(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), n = s.length, sum = s.reduce((a, b) => a + b, 0), mean = sum / n;
  const counts = new Map<number, number>();
  for (const v of s) counts.set(v, (counts.get(v) ?? 0) + 1);
  const top = Math.max(...counts.values());
  const mode = top > 1 ? [...counts].filter(([, c]) => c === top).map(([v]) => v) : [];
  const ss = s.reduce((a, v) => a + (v - mean) ** 2, 0);
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75);
  return { n, sum, mean, median: quantile(s, 0.5), mode, min: s[0], max: s[n - 1], range: s[n - 1] - s[0], q1, q3, iqr: q3 - q1, sd: Math.sqrt(ss / n), sampleSd: n > 1 ? Math.sqrt(ss / (n - 1)) : 0 };
}
/** Counts in equal-width bins. */
export function histogram(xs: number[], bins: number): number[] {
  if (!xs.length) return [];
  const lo = Math.min(...xs), hi = Math.max(...xs), w = (hi - lo) / bins || 1, out = new Array<number>(bins).fill(0);
  for (const v of xs) out[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  return out;
}

export interface FlowNode { id: string; layer: number; order: number }
/** "Start -> Plan -> Build: if ok" lines into nodes in layers (left to right) and labelled edges. */
export function flow(text: string) {
  const edges: { from: string; to: string; label: string }[] = [], names: string[] = [];
  const add = (n: string) => { if (n && !names.includes(n)) names.push(n); };
  for (const line of text.split('\n')) {
    const [chain, ...rest] = line.split(':');
    const parts = chain.split(/->|→/).map((p) => p.trim()).filter(Boolean);
    const label = rest.join(':').trim();
    parts.forEach(add);
    for (let k = 1; k < parts.length; k++) edges.push({ from: parts[k - 1], to: parts[k], label: k === parts.length - 1 ? label : '' });
  }
  // Layer = longest path from a start, ignoring edges that loop back.
  const layer = new Map<string, number>(), state = new Map<string, 1 | 2>(), back = new Set<number>();
  const visit = (n: string) => {
    state.set(n, 1);
    edges.forEach((e, k) => { if (e.from !== n) return; if (state.get(e.to) === 1) back.add(k); else if (!state.has(e.to)) visit(e.to); });
    state.set(n, 2);
  };
  names.forEach((n) => { if (!state.has(n)) visit(n); });
  const fwd = edges.filter((_, k) => !back.has(k));
  for (let pass = 0; pass < names.length; pass++) {
    let moved = false;
    for (const e of fwd) { const want = (layer.get(e.from) ?? 0) + 1; if ((layer.get(e.to) ?? 0) < want) { layer.set(e.to, want); moved = true; } }
    if (!moved) break;
  }
  const seen = new Map<number, number>();
  const nodes: FlowNode[] = names.map((id) => { const l = layer.get(id) ?? 0, o = seen.get(l) ?? 0; seen.set(l, o + 1); return { id, layer: l, order: o }; });
  return { nodes, edges, layers: Math.max(0, ...nodes.map((n) => n.layer)) + 1, rows: Math.max(0, ...seen.values()) };
}

export interface MindNode { id: string; parent: string | null; text: string }
/** A tidy tree, root at the left: x = depth, y = the middle of its leaves (in rows). */
export function treeLayout(nodes: MindNode[]): Map<string, { depth: number; row: number }> {
  const kids = new Map<string | null, MindNode[]>();
  for (const n of nodes) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  const out = new Map<string, { depth: number; row: number }>();
  let next = 0;
  const place = (n: MindNode, depth: number): number => {
    const ch = kids.get(n.id) ?? [];
    const row = ch.length ? (() => { const rows = ch.map((c) => place(c, depth + 1)); return (rows[0] + rows[rows.length - 1]) / 2; })() : next++;
    out.set(n.id, { depth, row });
    return row;
  };
  for (const r of kids.get(null) ?? []) place(r, 0);
  return out;
}

/** A repeatable random number source (the same seed, the same puzzle). */
export function seeded(seed: number) { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]] as const;
/** A word search: words hidden across, down and (if hard) diagonally and backwards. */
export function wordSearch(words: string[], size: number, hard: boolean, rand: () => number = Math.random) {
  const grid: string[][] = Array.from({ length: size }, () => new Array<string>(size).fill(''));
  const placed: { word: string; r: number; c: number; dr: number; dc: number }[] = [], skipped: string[] = [];
  const dirs = hard ? DIRS : DIRS.slice(0, 3);
  const clean = [...new Set(words.map((w) => w.toUpperCase().replace(/[^A-Z]/g, '')).filter((w) => w.length > 1))].sort((a, b) => b.length - a.length);
  for (const word of clean) {
    let ok = false;
    for (let t = 0; t < 400 && !ok; t++) {
      const [dr, dc] = dirs[Math.floor(rand() * dirs.length)], r = Math.floor(rand() * size), c = Math.floor(rand() * size);
      const er = r + dr * (word.length - 1), ec = c + dc * (word.length - 1);
      if (er < 0 || ec < 0 || er >= size || ec >= size) continue;
      if ([...word].every((ch, k) => { const g = grid[r + dr * k][c + dc * k]; return !g || g === ch; })) {
        [...word].forEach((ch, k) => { grid[r + dr * k][c + dc * k] = ch; });
        placed.push({ word, r, c, dr, dc }); ok = true;
      }
    }
    if (!ok) skipped.push(word);
  }
  const answer = grid.map((row) => row.map((ch) => ch));
  for (const row of grid) for (let c = 0; c < size; c++) if (!row[c]) row[c] = String.fromCharCode(65 + Math.floor(rand() * 26));
  return { grid, answer, placed, skipped };
}

/** Code 128 bar and space widths (values 0–105, then stop). */
export const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
/** Text (printable ASCII) as Code 128 set B: the widths of bars and spaces, starting with a bar. */
export function code128(text: string): number[] {
  if (!text || /[^\x20-\x7e]/.test(text)) throw new Error('Use letters, numbers and common symbols only.');
  const vals = [...text].map((ch) => ch.charCodeAt(0) - 32);
  const check = (104 + vals.reduce((a, v, k) => a + v * (k + 1), 0)) % 103;
  return [104, ...vals, check, 106].flatMap((v) => [...C128[v]].map(Number));
}

export interface Exam { name: string; date: string; hours: number }
/** Revision hours spread over the days before each exam, most urgent first. */
export function studyPlan(exams: Exam[], from: string, perDay: number) {
  const left = new Map(exams.filter((e) => e.name && e.date > from && e.hours > 0).map((e) => [e.name, e.hours]));
  const by = new Map(exams.map((e) => [e.name, e.date]));
  const last = exams.reduce((m, e) => (e.date > m ? e.date : m), from);
  const days: { date: string; items: { name: string; hours: number }[] }[] = [];
  for (let d = from; d < last; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
    const items = new Map<string, number>();
    for (let h = 0; h < perDay; h++) {
      const open = [...left].filter(([n, v]) => v > 0 && by.get(n)! > d);
      if (!open.length) break;
      // Urgency: hours still needed per day left.
      const daysLeft = (n: string) => Math.max(1, (Date.parse(by.get(n)!) - Date.parse(d)) / 86_400_000);
      const [name] = open.sort((a, b) => b[1] / daysLeft(b[0]) - a[1] / daysLeft(a[0]))[0];
      left.set(name, left.get(name)! - 1);
      items.set(name, (items.get(name) ?? 0) + 1);
    }
    days.push({ date: d, items: [...items].map(([name, hours]) => ({ name, hours })) });
  }
  return { days, short: [...left].filter(([, v]) => v > 0).map(([name, hours]) => ({ name, hours })) };
}

/** A weighted average of scores (weights need not add up to 100). */
export function weighted(rows: { score: number; weight: number }[]) {
  const w = rows.reduce((a, r) => a + r.weight, 0);
  return w ? rows.reduce((a, r) => a + r.score * r.weight, 0) / w : null;
}
/** The score needed on what's left (worth `restWeight` %) to end at `target`, having `now` on `doneWeight` %. */
export const needed = (now: number, doneWeight: number, target: number, restWeight: number) =>
  restWeight > 0 ? (target * (doneWeight + restWeight) - now * doneWeight) / restWeight : null;

/** Flashcards in five boxes: right moves a card up, wrong sends it back to box 1. */
export const nextBox = (box: number, right: boolean) => (right ? Math.min(5, box + 1) : 1);
/** Box 1 every round, box 2 every 2nd, box 3 every 4th… */
export const isDue = (box: number, round: number) => round % 2 ** (box - 1) === 0;

/** Options scored 1–5 on weighted criteria: the best first. */
export function decide(options: string[], weights: number[], scores: number[][]) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return options.map((name, o) => ({ name, score: weights.reduce((a, w, c) => a + w * (scores[o]?.[c] ?? 0), 0) / total }))
    .sort((a, b) => b.score - a.score);
}

const STOP = new Set('the a an and or but of to in on at for with by from is are was were be been it its this that these those as i you he she we they them his her our your their not no so if then than there here what which who will would can could should do does did have has had just also into about over more most very'.split(' '));
/** The most used words (common little words left out). */
export function wordFreq(t: string, max = 60): [string, number][] {
  const m = new Map<string, number>();
  for (const w of t.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? []) { const k = w.replace(/^['’-]+|['’-]+$/g, ''); if (k.length > 1 && !STOP.has(k)) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
}
/** Boxes placed on a spiral from the middle without overlapping; null where one didn't fit. */
export function spiral(boxes: { w: number; h: number }[], W: number, H: number) {
  const done: { x: number; y: number; w: number; h: number }[] = [];
  return boxes.map((b) => {
    for (let t = 0; t < 2400; t++) {
      const a = t * 0.18, r = 2.2 * a;
      const x = W / 2 + r * Math.cos(a) * 1.4 - b.w / 2, y = H / 2 + r * Math.sin(a) - b.h / 2;
      if (x < 4 || y < 4 || x + b.w > W - 4 || y + b.h > H - 4) continue;
      if (done.every((d) => x + b.w < d.x || d.x + d.w < x || y + b.h < d.y || d.y + d.h < y)) { const p = { x, y, w: b.w, h: b.h }; done.push(p); return p; }
    }
    return null;
  });
}

export interface Line { what: string; qty: number; price: number }
/** Invoice totals: subtotal, discount (%), tax (%) on what's left, total. */
export function invoice(lines: Line[], discountPct: number, taxPct: number) {
  const sub = lines.reduce((a, l) => a + (l.qty || 0) * (l.price || 0), 0);
  const discount = sub * (discountPct || 0) / 100, tax = (sub - discount) * (taxPct || 0) / 100;
  return { sub, discount, tax, total: sub - discount + tax };
}

/** The current streak (ending today or yesterday) and the best one, from YYYY-MM-DD days. */
export function streaks(days: string[], today: string) {
  const set = new Set(days), step = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  let cur = 0, d = set.has(today) ? today : step(today, -1);
  while (set.has(d)) { cur++; d = step(d, -1); }
  let best = 0;
  for (const x of set) { if (set.has(step(x, -1))) continue; let n = 0, y = x; while (set.has(y)) { n++; y = step(y, 1); } best = Math.max(best, n); }
  return { cur, best };
}
