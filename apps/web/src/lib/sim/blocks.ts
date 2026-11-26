// Hyperion Simulate → Blocks (M415, the owner's MATLAB list: "Model-Based Design: systematically use models throughout
// your development process"): a block-diagram simulator. Blocks (sources, maths, continuous dynamics, scopes) joined by
// wires from an output to an input; the diagram runs with a fixed-step 4th-order Runge–Kutta solver over every block's
// states. Blocks whose output follows their input at once (a gain, a sum) are worked out in the order the wires allow;
// a loop of them with no state inside is an "algebraic loop" and is refused in plain words.

import { chartStart, chartStep, parseChart, type Chart, type ChartRun } from './chart';

export type BlockKind = 'step' | 'sine' | 'constant' | 'pulse' | 'ramp' | 'gain' | 'sum' | 'product' | 'saturation' | 'integrator' | 'tf' | 'pid' | 'chart' | 'boardIn' | 'boardOut' | 'scope';
export interface Block { id: string; kind: BlockKind; x: number; y: number; p: Record<string, number | string> }
export interface Wire { id: string; from: string; out: number; to: string; in: number }
export interface Diagram { blocks: Block[]; wires: Wire[]; stop: number; dt: number }

/** A new chart's text (M563). */
export const CHART = `inputs: u
outputs: y
state Low
  entry: y = 0
state High
  entry: y = 1
Low -> High: u >= 0.5
High -> Low: u < 0.5`;
/** A chart's inputs and outputs counted from its lines (even while the rest of it has a mistake). */
export function chartPorts(text: number | string | undefined) {
  const count = (k: string) => { const m = new RegExp(`^\\s*${k}\\s*:(.*)$`, 'im').exec(String(text ?? '')); return m ? Math.min(6, m[1].split(',').filter((x) => x.trim()).length) : 0; };
  return { ins: count('inputs'), outs: count('outputs') };
}
const parsed = new Map<string, Chart>();
/** A chart block's chart (read once per text). */
export function chartOf(b: Block): Chart {
  const text = String(b.p.chart ?? '');
  let c = parsed.get(text);
  if (!c) { c = parseChart(text); if (parsed.size > 50) parsed.clear(); parsed.set(text, c); }
  return c;
}

/** Each kind: its name, inputs, outputs and settings (with their starting values). */
export const KINDS: Record<BlockKind, { name: string; group: string; ins: (p: Block['p']) => number; outs: (p: Block['p']) => number; p: Record<string, number | string> }> = {
  step: { name: 'Step', group: 'Sources', ins: () => 0, outs: () => 1, p: { time: 1, before: 0, after: 1 } },
  sine: { name: 'Sine wave', group: 'Sources', ins: () => 0, outs: () => 1, p: { amplitude: 1, frequency: 1, phase: 0 } },
  constant: { name: 'Constant', group: 'Sources', ins: () => 0, outs: () => 1, p: { value: 1 } },
  pulse: { name: 'Pulse', group: 'Sources', ins: () => 0, outs: () => 1, p: { amplitude: 1, period: 2, width: 50 } },
  ramp: { name: 'Ramp', group: 'Sources', ins: () => 0, outs: () => 1, p: { slope: 1, start: 0 } },
  gain: { name: 'Gain', group: 'Maths', ins: () => 1, outs: () => 1, p: { k: 2 } },
  sum: { name: 'Sum', group: 'Maths', ins: (p) => String(p.signs ?? '+-').length, outs: () => 1, p: { signs: '+-' } },
  product: { name: 'Product', group: 'Maths', ins: () => 2, outs: () => 1, p: {} },
  saturation: { name: 'Saturation', group: 'Maths', ins: () => 1, outs: () => 1, p: { lower: -1, upper: 1 } },
  integrator: { name: 'Integrator', group: 'Continuous', ins: () => 1, outs: () => 1, p: { initial: 0 } },
  tf: { name: 'Transfer function', group: 'Continuous', ins: () => 1, outs: () => 1, p: { num: '1', den: '1 1' } },
  pid: { name: 'PID controller', group: 'Continuous', ins: () => 1, outs: () => 1, p: { Kp: 1, Ki: 0, Kd: 0, N: 100 } },
  chart: { name: 'Chart', group: 'Logic', ins: (p) => chartPorts(p.chart).ins, outs: (p) => chartPorts(p.chart).outs, p: { chart: CHART } },
  boardIn: { name: 'Board input', group: 'Hardware', ins: () => 0, outs: () => 1, p: { pin: 'A0', scale: 1, test: 0 } },
  boardOut: { name: 'Board output', group: 'Hardware', ins: () => 1, outs: () => 0, p: { pin: 9, mode: 'pwm', lo: 0, hi: 1 } },
  scope: { name: 'Scope', group: 'Sinks', ins: (p) => Math.max(1, Math.min(4, Number(p.inputs ?? 1))), outs: () => 0, p: { inputs: 1 } },
};

export const coeffs = (v: number | string | undefined) => String(v ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
const n = (v: number | string | undefined, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };

/** A transfer function's controllable canonical form (numerator and denominator highest power first). */
function canon(numer: number[], denom: number[]) {
  let d = [...denom];
  while (d.length > 1 && d[0] === 0) d.shift();
  if (!d.length || d[0] === 0) throw new Error('A transfer function block needs a denominator that isn’t 0.');
  const lead = d[0];
  d = d.map((x) => x / lead);
  const nn = numer.map((x) => x / lead), order = d.length - 1;
  if (order > 12) throw new Error('A transfer function block can have at most 12 poles.');
  if (nn.length > d.length) throw new Error('A transfer function block can’t have more zeros than poles.');
  const b = [...new Array(order + 1 - nn.length).fill(0), ...nn], D = b[0];
  return { order, a: d.slice(1), C: Array.from({ length: order }, (_, k) => b[k + 1] - d[k + 1] * D), D };
}

/** At most this many steps a run (a longer run stops there and says so). */
export const MAX_STEPS = 200_000;

/** A chart's run: its active state at each recorded time, and how often each transition fired and state was entered. */
export interface ChartTrace { active: number[]; fired: number[]; visits: number[] }
export interface RunResult { t: number[]; scopes: Map<string, number[][]>; charts: Record<string, ChartTrace>; error?: string; capped?: boolean }

/** M564: what a real-time run reads from a board (a Board input's value, already scaled). Offline runs use each
 * Board input's test value. */
export interface BoardIo { read: (b: Block) => number }
/** A Board output's input (lo … hi) as the board's 0–255 PWM, or 0 / 1 for a digital pin. */
export function boardLevel(b: Block, v: number) {
  const lo = n(b.p.lo), hi = n(b.p.hi, 1), f = hi === lo ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return b.p.mode === 'digital' ? (f >= 0.5 ? 1 : 0) : Math.round(f * 255);
}

/** A diagram made ready to run: its states, the order its blocks are worked out in, and the functions a solver (or a
 * linearisation, a real-time run, a test) steps. `hold` fixes some blocks' outputs (a loop opened there). */
export function compile(dg: Diagram, hold?: Map<string, number>, io?: BoardIo) {
  const blocks = dg.blocks, byId = new Map(blocks.map((b) => [b.id, b]));
  const into = new Map<string, Wire>();
  for (const w of dg.wires) if (byId.has(w.from) && byId.has(w.to)) into.set(`${w.to}:${w.in}`, w);
  // States per block.
  const off = new Map<string, number>(), info = new Map<string, ReturnType<typeof canon>>();
  let ns = 0;
  for (const b of blocks) {
    if (b.kind === 'integrator') { off.set(b.id, ns); ns += 1; }
    else if (b.kind === 'pid') { off.set(b.id, ns); ns += 2; }
    else if (b.kind === 'tf') { const c = canon(coeffs(b.p.num), coeffs(b.p.den)); info.set(b.id, c); off.set(b.id, ns); ns += c.order; }
  }
  // Direct feedthrough: whether a block's output this instant needs its inputs.
  const through = (b: Block) => !hold?.has(b.id) && !['step', 'sine', 'constant', 'pulse', 'ramp', 'integrator', 'chart', 'boardIn', 'boardOut', 'scope'].includes(b.kind) && !(b.kind === 'tf' && info.get(b.id)!.D === 0 && info.get(b.id)!.order > 0);
  // Order: a block after the blocks feeding it directly.
  const order: Block[] = [], mark = new Map<string, 0 | 1 | 2>();
  const visit = (b: Block, path: string[]) => {
    if (mark.get(b.id) === 2) return;
    if (mark.get(b.id) === 1) throw new Error(`An algebraic loop: ${[...path, b.id].map((id) => KINDS[byId.get(id)!.kind].name).join(' → ')} feed each other with no integrator or delay between. Put a state (an integrator, a transfer function with more poles than zeros) in the loop.`);
    mark.set(b.id, 1);
    if (through(b)) for (let i = 0; i < KINDS[b.kind].ins(b.p); i++) { const w = into.get(`${b.id}:${i}`); if (w) visit(byId.get(w.from)!, [...path, b.id]); }
    mark.set(b.id, 2);
    order.push(b);
  };
  for (const b of blocks) visit(b, []);
  // Charts (M563): each runs at every time step; its outputs hold between steps (so it never makes an algebraic loop).
  const charts = new Map<string, { ch: Chart; run: ChartRun }>();
  for (const b of blocks) if (b.kind === 'chart') { const ch = chartOf(b); charts.set(b.id, { ch, run: chartStart(ch) }); }
  const y = new Map<string, number>(), yo = new Map<string, number[]>();
  const input = (b: Block, i: number) => { const w = into.get(`${b.id}:${i}`); return !w ? 0 : w.out ? (yo.get(w.from)?.[w.out] ?? 0) : (y.get(w.from) ?? 0); };
  /** Every block's output at time t from the states x. */
  const outputs = (t: number, x: Float64Array) => {
    for (const b of order) {
      const p = b.p;
      let v = 0;
      if (hold?.has(b.id)) { y.set(b.id, hold.get(b.id)!); continue; }
      switch (b.kind) {
        case 'step': v = t >= n(p.time, 1) ? n(p.after, 1) : n(p.before); break;
        case 'sine': v = n(p.amplitude, 1) * Math.sin(2 * Math.PI * n(p.frequency, 1) * t + (n(p.phase) * Math.PI) / 180); break;
        case 'constant': v = n(p.value, 1); break;
        case 'pulse': { const per = Math.max(1e-9, n(p.period, 2)); v = ((t % per) / per) * 100 < n(p.width, 50) ? n(p.amplitude, 1) : 0; break; }
        case 'ramp': v = t >= n(p.start) ? n(p.slope, 1) * (t - n(p.start)) : 0; break;
        case 'gain': v = n(p.k, 1) * input(b, 0); break;
        case 'sum': v = [...String(p.signs ?? '+-')].reduce((s, c, i) => s + (c === '-' ? -1 : 1) * input(b, i), 0); break;
        case 'product': v = input(b, 0) * input(b, 1); break;
        case 'saturation': v = Math.min(n(p.upper, 1), Math.max(n(p.lower, -1), input(b, 0))); break;
        case 'integrator': v = x[off.get(b.id)!]; break;
        case 'tf': { const c = info.get(b.id)!, o = off.get(b.id)!; v = c.D * input(b, 0); for (let k = 0; k < c.order; k++) v += c.C[k] * x[o + k]; break; }
        case 'pid': { const o = off.get(b.id)!, e = input(b, 0), N = n(p.N, 100); v = n(p.Kp, 1) * e + n(p.Ki) * x[o] + n(p.Kd) * N * (e - x[o + 1]); break; }
        case 'boardIn': v = io ? io.read(b) : n(p.test); break;
        case 'chart': { const c = charts.get(b.id)!, outs = c.ch.outputs.map((name) => c.run.vars[name] ?? 0); yo.set(b.id, outs); v = outs[0] ?? 0; break; }
      }
      y.set(b.id, v);
    }
  };
  const deriv = (t: number, x: Float64Array) => {
    outputs(t, x);
    const dx = new Float64Array(ns);
    for (const b of blocks) {
      const o = off.get(b.id);
      if (o === undefined || hold?.has(b.id)) continue;
      if (b.kind === 'integrator') dx[o] = input(b, 0);
      else if (b.kind === 'pid') { const e = input(b, 0); dx[o] = e; dx[o + 1] = n(b.p.N, 100) * (e - x[o + 1]); }
      else if (b.kind === 'tf') {
        const c = info.get(b.id)!, u = input(b, 0);
        if (c.order) { dx[o] = u - c.a.reduce((s, a, k) => s + a * x[o + k], 0); for (let k = 1; k < c.order; k++) dx[o + k] = x[o + k - 1]; }
      }
    }
    return dx;
  };
  const x0 = new Float64Array(ns);
  for (const b of blocks) if (b.kind === 'integrator') x0[off.get(b.id)!] = n(b.p.initial);
  /** One 4th-order Runge–Kutta step of h from t (x changed in place). */
  const step = (t: number, x: Float64Array, h: number) => {
    const k1 = deriv(t, x), x2 = x.map((v, i) => v + (h / 2) * k1[i]);
    const k2 = deriv(t + h / 2, x2), x3 = x.map((v, i) => v + (h / 2) * k2[i]);
    const k3 = deriv(t + h / 2, x3), x4 = x.map((v, i) => v + h * k3[i]);
    const k4 = deriv(t + h, x4);
    for (let i = 0; i < ns; i++) x[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  };
  /** The charts take their turn at time t (after the states have moved there); which transition fired, per chart. */
  const update = (t: number, x: Float64Array) => {
    if (!charts.size) return;
    outputs(t, x);
    for (const [id, c] of charts) { const b = byId.get(id)!; chartStep(c.ch, c.run, Object.fromEntries(c.ch.inputs.map((name, i) => [name, input(b, i)])), t); }
  };
  return { blocks, byId, into, off, info, order, ns, x0, y, yo, input, outputs, deriv, step, update, charts };
}
export type Model = ReturnType<typeof compile>;

/** Runs the diagram from 0 to its stop time. */
export function simulate(dg: Diagram): RunResult {
  const m = compile(dg), { blocks, into, input, x0: x } = m;
  const h = Math.max(1e-6, dg.dt), want = Math.ceil(dg.stop / h - 1e-9), steps = Math.min(MAX_STEPS, want);
  const every = Math.max(1, Math.floor(steps / 2000)), t: number[] = [], scopes = new Map<string, number[][]>();
  for (const b of blocks) if (b.kind === 'scope') scopes.set(b.id, Array.from({ length: KINDS.scope.ins(b.p) }, () => []));
  const charts: Record<string, ChartTrace> = {};
  for (const [id, c] of m.charts) charts[id] = { active: [], fired: c.run.fired, visits: c.run.visits };
  const record = (tt: number) => {
    m.outputs(tt, x); t.push(tt);
    for (const b of blocks) if (b.kind === 'scope') scopes.get(b.id)!.forEach((arr, i) => arr.push(into.has(`${b.id}:${i}`) ? input(b, i) : NaN));
    for (const [id, c] of m.charts) charts[id].active.push(c.run.active);
  };
  m.update(0, x);
  for (let k = 0; k < steps; k++) {
    const tk = k * h;
    if (k % every === 0) record(tk);
    m.step(tk, x, h);
    m.update(tk + h, x);
    if (!x.every(Number.isFinite)) return { t, scopes, charts, error: `The model blew up at t = ${+tk.toPrecision(3)} s (a value became infinite): the loop is unstable or the step is too big.` };
  }
  record(steps * h);
  return { t, scopes, charts, capped: want > steps };
}

let seq = 0;
export const blockId = (k: string) => `${k}${Date.now().toString(36)}${(seq++).toString(36)}`;
export const newBlock = (kind: BlockKind, x: number, y: number): Block => ({ id: blockId(kind), kind, x, y, p: { ...KINDS[kind].p } });

const B = (kind: BlockKind, x: number, y: number, p: Block['p'] = {}): Block => ({ ...newBlock(kind, x, y), p: { ...KINDS[kind].p, ...p } });
const W = (from: Block, to: Block, inPort = 0, out = 0): Wire => ({ id: blockId('w'), from: from.id, out, to: to.id, in: inPort });

/** Ready-made diagrams. */
export const EXAMPLES: { id: string; name: string; make: () => Diagram }[] = [
  {
    id: 'cruise', name: 'Cruise control (PI)', make: () => {
      const set = B('step', 20, 80, { time: 1, before: 0, after: 25 }), sum = B('sum', 148, 80, { signs: '+-' }), pid = B('pid', 276, 80, { Kp: 800, Ki: 40, Kd: 0, N: 100 }), sat = B('saturation', 404, 80, { lower: -5000, upper: 5000 }), car = B('tf', 532, 80, { num: '1', den: '1000 50' }), sc = B('scope', 660, 80, { inputs: 2 });
      return { stop: 100, dt: 0.01, blocks: [set, sum, pid, sat, car, sc], wires: [W(set, sum), W(sum, pid), W(pid, sat), W(sat, car), W(car, sc), W(car, sum, 1), W(set, sc, 1)] };
    },
  },
  {
    id: 'spring', name: 'A mass on a spring', make: () => {
      const g = B('gain', 40, 40, { k: -4 }), damp = B('gain', 40, 130, { k: -0.4 }), sum = B('sum', 180, 80, { signs: '++' }), v = B('integrator', 310, 80), xx = B('integrator', 450, 80, { initial: 1 }), sc = B('scope', 620, 80);
      return { stop: 20, dt: 0.005, blocks: [g, damp, sum, v, xx, sc], wires: [W(g, sum), W(damp, sum, 1), W(sum, v), W(v, xx), W(xx, sc), W(xx, g), W(v, damp)] };
    },
  },
  {
    // M563: supervisory logic. A pump keeps a tank's level between 1 and 2; a rush of water in (the pulse) can push it
    // past 2.5 while the pump is off, so the chart raises the alarm and opens the dump valve until it's back under 2.
    id: 'tank', name: 'A tank with a supervisor (state chart)', make: () => {
      const chart = B('chart', 20, 120, { chart: `inputs: level
outputs: pump, alarm
state Filling
  entry: pump = 1; alarm = 0
state Draining
  entry: pump = 0; alarm = 0
state Alarm
  entry: pump = 0; alarm = 1
Draining -> Alarm: level > 2.5
Filling -> Draining: level >= 2
Draining -> Filling: level <= 1
Alarm -> Draining: level < 2 after 1` });
      const pump = B('gain', 170, 40, { k: 0.8 }), dump = B('gain', 170, 200, { k: 0.9 }), rush = B('pulse', 170, 120, { amplitude: 0.6, period: 20, width: 25 }), out = B('constant', 170, 270, { value: 0.3 });
      const sum = B('sum', 320, 120, { signs: '++--' }), lvl = B('integrator', 460, 120, { initial: 1.5 }), sc = B('scope', 620, 120, { inputs: 3 });
      return { stop: 80, dt: 0.01, blocks: [chart, pump, dump, rush, out, sum, lvl, sc], wires: [W(chart, pump), W(chart, dump, 0, 1), W(pump, sum), W(rush, sum, 1), W(out, sum, 2), W(dump, sum, 3), W(sum, lvl), W(lvl, chart), W(lvl, sc), W(chart, sc, 1), W(chart, sc, 2, 1)] };
    },
  },
  {
    // M564: a PI controller here, the board's pin 9 driven and its A5 read back (the simulated Arduino wires them,
    // a real one needs pin 9 through a resistor–capacitor filter into A5). Run it in Real time.
    id: 'hil', name: 'Hardware in the loop (an Arduino’s PWM read back)', make: () => {
      const set = B('step', 20, 80, { time: 1, before: 0.2, after: 0.6 }), sum = B('sum', 150, 80, { signs: '+-' }), pid = B('pid', 280, 80, { Kp: 0.2, Ki: 4, Kd: 0, N: 100 }), sat = B('saturation', 410, 80, { lower: 0, upper: 1 });
      const out = B('boardOut', 560, 40, { pin: 9, mode: 'pwm', lo: 0, hi: 1 }), inp = B('boardIn', 410, 210, { pin: 'A5', scale: 1, test: 0 }), sc = B('scope', 620, 170, { inputs: 2 });
      return { stop: 20, dt: 0.005, blocks: [set, sum, pid, sat, out, inp, sc], wires: [W(set, sum), W(sum, pid), W(pid, sat), W(sat, out), W(inp, sum, 1), W(inp, sc), W(set, sc, 1)] };
    },
  },
  {
    id: 'loop', name: 'A first-order loop', make: () => {
      const s = B('step', 20, 80, { time: 0 }), sum = B('sum', 160, 80, { signs: '+-' }), k = B('gain', 300, 80, { k: 2 }), it = B('integrator', 440, 80), sc = B('scope', 610, 80);
      return { stop: 5, dt: 0.001, blocks: [s, sum, k, it, sc], wires: [W(s, sum), W(sum, k), W(k, it), W(it, sc), W(it, sum, 1)] };
    },
  },
];

/** A kept diagram read back safely (the first example when odd). */
export function readDiagram(raw: unknown): Diagram {
  const d = raw as Partial<Diagram> | null;
  if (!d || !Array.isArray(d.blocks) || !Array.isArray(d.wires)) return EXAMPLES[0].make();
  const blocks = d.blocks.filter((b) => b && typeof b.kind === 'string' && b.kind in KINDS).slice(0, 120).map((b) => ({
    id: String(b.id), kind: b.kind, x: n(b.x), y: n(b.y),
    p: Object.fromEntries(Object.entries(KINDS[b.kind].p).map(([k, v]) => [k, typeof b.p?.[k] === typeof v && (k !== 'signs' || /^[+-]{1,6}$/.test(String(b.p[k]))) && (k !== 'mode' || /^(pwm|digital)$/.test(String(b.p[k]))) && (k !== 'pin' || b.kind !== 'boardIn' || /^A[0-5]$/.test(String(b.p[k]))) ? (typeof v === 'string' ? String(b.p[k]).slice(0, k === 'chart' ? 4000 : 80) : b.p[k]) : v])),
  }));
  const ids = new Set(blocks.map((b) => b.id));
  const wires = d.wires.filter((w) => w && ids.has(String(w.from)) && ids.has(String(w.to))).slice(0, 400).map((w) => ({ id: String(w.id), from: String(w.from), out: n(w.out), to: String(w.to), in: n(w.in) }));
  return { blocks, wires, stop: Math.max(1e-3, Math.min(1e5, n(d.stop, 10))), dt: Math.max(1e-5, Math.min(10, n(d.dt, 0.01))) };
}
