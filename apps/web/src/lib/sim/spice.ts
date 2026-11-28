import { itemId, newItem, gatePoint, STEPS, WINDOWS, type Board, type Item, type Mark } from './schematic';

// Opening a SPICE netlist on Simulate → Circuits (M567; MathWorks' circuit-design page imports SPICE subcircuits). Written
// fresh: the netlist's lines (R, C, L, V with DC / SIN / PULSE, I, D, M with its .model's VTO; .tran for the time step
// and window; * comments and + continuations) become parts on the board. The board joins wires only where their ends
// meet, so the layout is a ladder: each net is a horizontal rail at its own row (ground at the bottom), each part
// stands upright in its own column between its two nets' rails, and each rail is cut into segments that end exactly at
// its parts' ends. A MOSFET's gate (the point beside it) is wired straight down or up to its net's rail.

export interface SpiceResult { board: Board; warnings: string[]; parts: number }
const COLS = 34, ROWS = 15;

/** A SPICE number: 4.7k, 10u, 2.2MEG, 1e-3, 5m (milli), with any unit letters after (10uF, 5V). */
export function spiceValue(raw: string): number | null {
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(meg|mil|[tgkmunpf])?[a-z]*$/i.exec(raw.trim());
  if (!m) return null;
  const k: Record<string, number> = { t: 1e12, g: 1e9, meg: 1e6, k: 1e3, m: 1e-3, mil: 25.4e-6, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
  return Number(m[1]) * (m[2] ? k[m[2].toLowerCase()] : 1);
}

interface Elem { kind: Item['kind']; name: string; a: string; b: string; g?: string; value: number; wave: Item['wave']; freq: number }

export function readSpice(text: string): SpiceResult {
  const warnings: string[] = [];
  // Join + continuation lines; the first line is the title.
  const raw = text.replace(/\r/g, '').split('\n');
  const lines: string[] = [];
  raw.slice(1).forEach((l) => { const t = l.trim(); if (/^\+/.test(t) && lines.length) lines[lines.length - 1] += ` ${t.slice(1)}`; else lines.push(t); });
  const models = new Map<string, number>();
  for (const l of lines) {
    const m = /^\.model\s+(\S+)\s+(nmos|pmos)\b(.*)$/i.exec(l);
    if (m) { const vto = /vto\s*=\s*([^\s)]+)/i.exec(m[3]); models.set(m[1].toLowerCase(), vto ? spiceValue(vto[1]) ?? 2 : 2); if (/pmos/i.test(m[2])) warnings.push(`${m[1]} is a p-channel model: drawn as n-channel (Hyperion's MOSFET is n-channel).`); }
  }
  const elems: Elem[] = [];
  let dt = 1e-5, window = 0.03;
  for (const l of lines) {
    if (!l || l.startsWith('*') || /^\.(end|model|options|option|param|include|lib|ends|subckt|op|ac|dc|print|plot|probe|control|endc|save)\b/i.test(l)) {
      if (/^\.(subckt|include|lib|param)\b/i.test(l)) warnings.push(`“${l.split(/\s+/)[0]}” isn't read: write the parts out flat.`);
      continue;
    }
    const t = l.replace(/;.*$/, '').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').split(/\s+/);
    if (/^\.tran$/i.test(t[0])) {
      const step = spiceValue(t[1] ?? ''), stop = spiceValue(t[2] ?? '');
      // Onto the board's own choices: the largest step no longer than asked, the shortest screen that shows it all.
      if (step && step > 0) dt = [...STEPS].reverse().find((x) => x <= step * 1.0001) ?? STEPS[0];
      if (stop && stop > 0) window = WINDOWS.find((x) => x >= stop * 0.9999) ?? WINDOWS[WINDOWS.length - 1];
      continue;
    }
    const kind = t[0][0].toUpperCase(), name = t[0];
    const val = (s: string | undefined, what: string) => { const v = s === undefined ? null : spiceValue(s); if (v === null) warnings.push(`${name}: its ${what} “${s ?? ''}” isn't a number; left out.`); return v; };
    if ('RCL'.includes(kind)) {
      const v = val(t[3], 'value');
      if (v !== null) elems.push({ kind: kind as 'R' | 'C' | 'L', name, a: t[1], b: t[2], value: v, wave: 'dc', freq: 50 });
    } else if (kind === 'V' || kind === 'I') {
      const rest = t.slice(3).join(' ');
      let value: number | null = null, wave: Item['wave'] = 'dc', freq = 50;
      const sin = /sin\(([^)]*)\)/i.exec(rest), pulse = /pulse\(([^)]*)\)/i.exec(rest);
      if (sin) {
        const [vo, va, f] = sin[1].split(/[\s,]+/).map((x) => spiceValue(x) ?? 0);
        value = va; wave = 'sine'; freq = f || 50;
        if (vo) warnings.push(`${name}: its sine's offset (${vo} V) is left out.`);
      } else if (pulse) {
        const p = pulse[1].split(/[\s,]+/).map((x) => spiceValue(x) ?? 0), per = p[6];
        value = p[1]; wave = 'square'; freq = per > 0 ? 1 / per : 50;
        if (p[0]) warnings.push(`${name}: the pulse's low level (${p[0]}) is taken as 0.`);
      } else value = val(t[3]?.toLowerCase() === 'dc' ? t[4] : t[3], 'value');
      if (value === null) continue;
      if (kind === 'I' && wave !== 'dc') { warnings.push(`${name}: a changing current source is drawn steady at ${value} A.`); wave = 'dc'; }
      // SPICE's current source drives its current out at n−; Hyperion's pushes it out at its first end.
      elems.push(kind === 'V' ? { kind: 'V', name, a: t[1], b: t[2], value, wave, freq } : { kind: 'I', name, a: t[2], b: t[1], value, wave: 'dc', freq });
    } else if (kind === 'D') elems.push({ kind: 'D', name, a: t[1], b: t[2], value: 0, wave: 'dc', freq: 50 });
    else if (kind === 'M') {
      const vth = models.get((t[5] ?? '').toLowerCase()) ?? 2;
      if (t[4] && t[4] !== t[3]) warnings.push(`${name}: its body is tied to its source (Hyperion's MOSFET has three leads).`);
      elems.push({ kind: 'M', name, a: t[1], g: t[2], b: t[3], value: vth, wave: 'dc', freq: 50 });
    } else warnings.push(`${name}: “${kind}” parts aren't on the board; left out.`);
  }
  // Nets: ground ('0' or 'gnd') at the bottom, the others in the order they appear.
  const isGround = (n: string) => n === '0' || n.toLowerCase() === 'gnd';
  const nets: string[] = [];
  for (const e of elems) for (const n of [e.a, e.b, e.g].filter((x): x is string => !!x)) if (!isGround(n) && !nets.includes(n)) nets.push(n);
  const step = 2, rowsNeeded = (nets.length + 1) * step;
  if (rowsNeeded > ROWS) throw new Error(`That netlist has ${nets.length + 1} nets: the board has room for ${Math.floor(ROWS / step)}. Split it into smaller circuits.`);
  const rowOf = (n: string) => (isGround(n) ? 1 + nets.length * step : 1 + nets.indexOf(n) * step);
  // Columns: a part takes 3, a MOSFET 5 (its gate sits 2 to its side).
  const items: Item[] = [], marks: Mark[] = [], taps = new Map<number, Set<number>>(); // row → columns where its net is tapped
  const tap = (row: number, x: number) => { if (!taps.has(row)) taps.set(row, new Set()); taps.get(row)!.add(x); };
  let x = 2;
  for (const e of elems) {
    const ya = rowOf(e.a), yb = rowOf(e.b);
    if (ya === yb) { warnings.push(`${e.name}: both its ends are on net ${e.a}, so it does nothing; left out.`); continue; }
    if (e.kind === 'M') x += 2;
    if (x >= COLS) { warnings.push(`${e.name} and the parts after it don't fit across the board; left out.`); break; }
    items.push({ ...newItem(e.kind, x, ya, x, yb), value: e.value, wave: e.wave, freq: e.freq });
    tap(ya, x); tap(yb, x);
    if (e.kind === 'M' && e.g) {
      const gp = gatePoint({ x1: x, y1: ya, x2: x, y2: yb }), yg = rowOf(e.g);
      if (gp.y !== yg) items.push({ ...newItem('wire', gp.x, gp.y, gp.x, yg), value: 0, wave: 'dc', freq: 50 });
      tap(yg, gp.x);
      x += 2;
    }
    x += 3;
  }
  // Each rail, cut at its taps.
  for (const [row, xs] of taps) {
    const cols = [...xs].sort((p, q) => p - q);
    for (let i = 1; i < cols.length; i++) items.push({ ...newItem('wire', cols[i - 1], row, cols[i], row), value: 0, wave: 'dc', freq: 50 });
  }
  const groundRow = 1 + nets.length * step;
  const gx = taps.get(groundRow) ? Math.min(...taps.get(groundRow)!) : null;
  if (gx !== null) marks.push({ id: itemId('ground'), kind: 'ground', x: gx, y: groundRow });
  else warnings.push('The netlist has no ground (node 0): add one on the board.');
  // A probe on each net, up to six.
  nets.slice(0, 6).forEach((n) => { const row = rowOf(n), xs = taps.get(row); if (xs) marks.push({ id: itemId('probe'), kind: 'probe', x: Math.min(...xs), y: row }); });
  if (nets.length > 6) warnings.push('Probes were put on the first six nets only.');
  return { board: { items, marks, dt, window }, warnings, parts: items.filter((i) => i.kind !== 'wire').length };
}
