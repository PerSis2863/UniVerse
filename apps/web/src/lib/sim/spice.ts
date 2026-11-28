import { itemId, newItem, gatePoint, STEPS, WINDOWS, type Board, type Item, type Mark } from './schematic';

// Opening a SPICE netlist on Simulate → Circuits (M567; MathWorks' circuit-design page imports SPICE subcircuits). Written
// fresh: the netlist's lines (R, C, L, V with DC / SIN / PULSE, I, D, M with its .model's VTO; .tran for the time step
// and window; * comments and + continuations) become parts on the board. The board joins wires only where their ends
// meet, so the layout is a ladder: each net is a horizontal rail at its own row (ground at the bottom), each part
// stands upright in its own column between its two nets' rails, and each rail is cut into segments that end exactly at
// its parts' ends. A MOSFET's gate (the point beside it) is wired straight down or up to its net's rail. M568: vendors'
// part libraries (.subckt, .include / .lib files opened with the netlist, .param and {expressions}) are flattened first.

export interface SpiceResult { board: Board; warnings: string[]; parts: number }
/** A library file opened with the netlist (a vendor's .lib, .inc, .mod or .sub): its subcircuits and models. */
export interface SpiceLib { name: string; text: string }
const COLS = 34, ROWS = 15;

/** A SPICE number: 4.7k, 10u, 2.2MEG, 1e-3, 5m (milli), with any unit letters after (10uF, 5V). */
export function spiceValue(raw: string): number | null {
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(meg|mil|[tgkmunpf])?[a-z]*$/i.exec(raw.trim());
  if (!m) return null;
  const k: Record<string, number> = { t: 1e12, g: 1e9, meg: 1e6, k: 1e3, m: 1e-3, mil: 25.4e-6, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
  return Number(m[1]) * (m[2] ? k[m[2].toLowerCase()] : 1);
}

/** Lines joined across + continuations, comments and trailing ; comments dropped. */
function joinLines(text: string, title: boolean): string[] {
  const out: string[] = [];
  text.replace(/\r/g, '').split('\n').slice(title ? 1 : 0).forEach((l) => {
    const t = l.replace(/;.*$/, '').trim();
    if (!t || t.startsWith('*')) return;
    if (t.startsWith('+') && out.length) out[out.length - 1] += ` ${t.slice(1).trim()}`; else out.push(t);
  });
  return out;
}

/** An expression of .param values ({R*2}, '1k/3'): + − * / ^, brackets, SPICE numbers; null when it can't be worked out. */
export function spiceExpr(src: string, vars: Map<string, number>): number | null {
  const toks = src.match(/(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[a-z]*|[a-z_]\w*|\*\*|[-+*/^()]/gi) ?? [];
  let p = 0;
  const num = (): number | null => {
    const t = toks[p++];
    if (t === undefined) return null;
    if (t === '(') { const v = sum(); if (toks[p++] !== ')') return null; return v; }
    if (t === '-') { const v = num(); return v === null ? null : -v; }
    if (/^[\d.]/.test(t)) return spiceValue(t);
    return vars.get(t.toLowerCase()) ?? null;
  };
  const pow = (): number | null => { const a = num(); if (a !== null && (toks[p] === '^' || toks[p] === '**')) { p++; const b = pow(); return b === null ? null : a ** b; } return a; };
  const prod = (): number | null => { let a = pow(); while (a !== null && (toks[p] === '*' || toks[p] === '/')) { const op = toks[p++], b = pow(); a = b === null ? null : op === '*' ? a * b : a / b; } return a; };
  const sum = (): number | null => { let a = prod(); while (a !== null && (toks[p] === '+' || toks[p] === '-')) { const op = toks[p++], b = prod(); a = b === null ? null : op === '+' ? a + b : a - b; } return a; };
  const v = sum();
  return v !== null && p === toks.length && Number.isFinite(v) ? v : null;
}

interface Sub { name: string; pins: string[]; defaults: [string, string][]; body: string[] }
const MAX_DEPTH = 8, MAX_FLAT = 400;
const isGnd = (n: string) => n === '0' || n.toLowerCase() === 'gnd';
/** k=v pairs (after PARAMS: or bare) from tokens. */
const pairs = (toks: string[]) => toks.join(' ').replace(/params:/i, ' ').replace(/\s*=\s*/g, '=').split(/\s+/).filter((x) => x.includes('=')).map((x) => x.split('=') as [string, string]);

/**
 * Subcircuits, libraries and .param flattened into plain element lines (M568). .include / .lib name a file opened
 * with the netlist (found by its name); a library's own .lib section markers are passed over (every section is read).
 * Each X instance's parts are renamed R1@X1 and its inner nets X1.n, so they never meet another instance's.
 */
function flatten(text: string, libs: SpiceLib[], warnings: string[]): string[] {
  const subs = new Map<string, Sub>(), top: string[] = [], vars = new Map<string, number>(), read = new Set<string>();
  const byName = (f: string) => { const want = f.replace(/^["']|["']$/g, '').split(/[\\/]/).pop()!.toLowerCase(); return libs.find((l) => l.name.split(/[\\/]/).pop()!.toLowerCase() === want); };
  const load = (lines: string[], inLib: boolean) => {
    let sub: Sub | null = null;
    for (const l of lines) {
      const t = l.split(/\s+/), d = t[0].toLowerCase();
      if (d === '.subckt') {
        if (sub) warnings.push(`.subckt ${t[1]} inside ${sub.name}: nested definitions are read as their own.`);
        const k = t.findIndex((x, i) => i > 1 && (x.includes('=') || /^params:/i.test(x)));
        sub = { name: (t[1] ?? '').toLowerCase(), pins: t.slice(2, k < 0 ? undefined : k), defaults: k < 0 ? [] : pairs(t.slice(k)), body: [] };
        continue;
      }
      if (d === '.ends') { if (sub) { subs.set(sub.name, sub); sub = null; } continue; }
      if (sub) { sub.body.push(l); continue; }
      if (d === '.include' || d === '.inc' || (d === '.lib' && (t.length > 2 || !inLib))) {
        if (d === '.lib' && t.length < 2) continue;
        const f = t[1] ?? '', lib = byName(f);
        if (!lib) { warnings.push(`${t[0]} ${f}: open that file together with the netlist to use it.`); continue; }
        if (!read.has(lib.name)) { read.add(lib.name); load(joinLines(lib.text, false), true); }
        continue;
      }
      if (d === '.lib' || d === '.endl') continue; // a library's own section markers
      if (d === '.param') {
        for (const [k, v] of pairs(t.slice(1))) { const x = spiceExpr(v.replace(/^[{']|[}']$/g, ''), vars); if (x === null) warnings.push(`.param ${k}: “${v}” couldn't be worked out.`); else vars.set(k.toLowerCase(), x); }
        continue;
      }
      if (inLib && !/^\.model\b/i.test(l)) continue; // only definitions are taken from a library
      top.push(l);
    }
    if (sub) { subs.set(sub.name, sub); warnings.push(`.subckt ${sub.name} has no .ends.`); }
  };
  // Libraries opened with the netlist are read even without an .include naming them.
  for (const lib of libs) if (!read.has(lib.name)) { read.add(lib.name); load(joinLines(lib.text, false), true); }
  load(joinLines(text, true), false);
  const out: string[] = [];
  /** {expr} and 'expr' values worked out with the parameters in force. */
  const values = (l: string, scope: Map<string, number>) => l.replace(/\{([^}]*)\}|'([^']*)'/g, (all, a: string | undefined, b: string | undefined) => {
    const v = spiceExpr(a ?? b ?? '', scope);
    if (v === null) { warnings.push(`${l.split(/\s+/)[0]}: “${all}” couldn't be worked out.`); return 'x'; }
    return String(v);
  });
  const expand = (lines: string[], scope: Map<string, number>, rename: (n: string) => string, suffix: string, depth: number) => {
    for (const l of lines) {
      if (out.length >= MAX_FLAT) { warnings.push(`Only the first ${MAX_FLAT} parts of the subcircuits were read.`); return; }
      if (l.startsWith('.')) { if (/^\.(model|tran)\b/i.test(l)) out.push(l); continue; }
      const t = values(l, scope).split(/\s+/), kind = t[0][0].toUpperCase(), name = t[0] + suffix;
      if (kind === 'X') {
        const k = t.findIndex((x, i) => i > 1 && (x.includes('=') || /^params:/i.test(x))), head = t.slice(1, k < 0 ? undefined : k);
        const sub = subs.get((head.at(-1) ?? '').toLowerCase()), nodes = head.slice(0, -1);
        if (!sub) { warnings.push(`${name}: no subcircuit called ${head.at(-1)}; open its library with the netlist.`); continue; }
        if (sub.pins.length !== nodes.length) { warnings.push(`${name}: ${sub.name} has ${sub.pins.length} pins, given ${nodes.length}; left out.`); continue; }
        if (depth >= MAX_DEPTH) { warnings.push(`${name}: subcircuits nested more than ${MAX_DEPTH} deep; left out.`); continue; }
        // The subcircuit's own defaults (against the global .params), then what this instance gives (against the caller's).
        const inner = new Map(vars), put = (a: string, v: string, against: Map<string, number>) => {
          const x = spiceExpr(v.replace(/^[{']|[}']$/g, ''), against);
          if (x === null) warnings.push(`${name}: ${a}=${v} couldn't be worked out.`); else inner.set(a.toLowerCase(), x);
        };
        for (const [a, v] of sub.defaults) put(a, v, inner);
        for (const [a, v] of k < 0 ? [] : pairs(t.slice(k))) put(a, v, scope);
        const pin = new Map(sub.pins.map((p, i) => [p.toLowerCase(), rename(nodes[i])])), tag = name.slice(1).replace(/@/g, '.');
        expand(sub.body, inner, (n) => (isGnd(n) ? '0' : pin.get(n.toLowerCase()) ?? `${tag}.${n}`), `@${t[0]}${suffix}`, depth + 1);
        continue;
      }
      // Nets are the tokens after the name: 2 for two-lead parts, 4 for a MOSFET (d g s b), 3 for a BJT.
      const leads = kind === 'M' ? 4 : kind === 'Q' || kind === 'J' ? 3 : kind === 'E' || kind === 'G' ? 4 : 2;
      out.push([name, ...t.slice(1, 1 + leads).map(rename), ...t.slice(1 + leads)].join(' '));
    }
  };
  expand(top, vars, (n) => n, '', 0);
  return out;
}

interface Elem { kind: Item['kind']; name: string; a: string; b: string; g?: string; value: number; wave: Item['wave']; freq: number }

export function readSpice(text: string, libs: SpiceLib[] = []): SpiceResult {
  const warnings: string[] = [];
  // The first line is the title; subcircuits, libraries and parameters are flattened first.
  const lines = flatten(text, libs, warnings);
  const models = new Map<string, number>();
  for (const l of lines) {
    // n- and p-channel models, and power MOSFETs' VDMOS (pchan marks a p-channel one), as vendors write them.
    const m = /^\.model\s+(\S+)\s+(nmos|pmos|vdmos)\b(.*)$/i.exec(l);
    if (m) {
      const vto = /vto\s*=\s*([^\s)]+)/i.exec(m[3]), vt = vto ? spiceValue(vto[1]) : null;
      models.set(m[1].toLowerCase(), vt === null ? 2 : Math.abs(vt));
      if (/pmos/i.test(m[2]) || /\bpchan\b/i.test(m[3])) warnings.push(`${m[1]} is a p-channel model: drawn as n-channel (Hyperion's MOSFET is n-channel).`);
    }
  }
  const elems: Elem[] = [];
  let dt = 1e-5, window = 0.03;
  for (const l of lines) {
    if (!l || l.startsWith('*') || /^\.(end|model|options|option|op|ac|dc|print|plot|probe|control|endc|save|temp|ic|nodeset|meas|measure|step|backanno|func)\b/i.test(l)) continue;
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
