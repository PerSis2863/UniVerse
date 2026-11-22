// Hyperion Simulate → Blocks (M415, the owner's MATLAB list: "Model-Based Design: systematically use models throughout
// your development process"): a block-diagram simulator. Blocks (sources, maths, continuous dynamics, scopes) joined by
// wires from an output to an input; the diagram runs with a fixed-step 4th-order Runge–Kutta solver over every block's
// states. Blocks whose output follows their input at once (a gain, a sum) are worked out in the order the wires allow;
// a loop of them with no state inside is an "algebraic loop" and is refused in plain words.

export type BlockKind = 'step' | 'sine' | 'constant' | 'pulse' | 'ramp' | 'gain' | 'sum' | 'product' | 'saturation' | 'integrator' | 'tf' | 'pid' | 'scope';
export interface Block { id: string; kind: BlockKind; x: number; y: number; p: Record<string, number | string> }
export interface Wire { id: string; from: string; out: number; to: string; in: number }
export interface Diagram { blocks: Block[]; wires: Wire[]; stop: number; dt: number }

/** Each kind: its name, inputs, outputs and settings (with their starting values). */
export const KINDS: Record<BlockKind, { name: string; group: string; ins: (p: Block['p']) => number; outs: number; p: Record<string, number | string> }> = {
  step: { name: 'Step', group: 'Sources', ins: () => 0, outs: 1, p: { time: 1, before: 0, after: 1 } },
  sine: { name: 'Sine wave', group: 'Sources', ins: () => 0, outs: 1, p: { amplitude: 1, frequency: 1, phase: 0 } },
  constant: { name: 'Constant', group: 'Sources', ins: () => 0, outs: 1, p: { value: 1 } },
  pulse: { name: 'Pulse', group: 'Sources', ins: () => 0, outs: 1, p: { amplitude: 1, period: 2, width: 50 } },
  ramp: { name: 'Ramp', group: 'Sources', ins: () => 0, outs: 1, p: { slope: 1, start: 0 } },
  gain: { name: 'Gain', group: 'Maths', ins: () => 1, outs: 1, p: { k: 2 } },
  sum: { name: 'Sum', group: 'Maths', ins: (p) => String(p.signs ?? '+-').length, outs: 1, p: { signs: '+-' } },
  product: { name: 'Product', group: 'Maths', ins: () => 2, outs: 1, p: {} },
  saturation: { name: 'Saturation', group: 'Maths', ins: () => 1, outs: 1, p: { lower: -1, upper: 1 } },
  integrator: { name: 'Integrator', group: 'Continuous', ins: () => 1, outs: 1, p: { initial: 0 } },
  tf: { name: 'Transfer function', group: 'Continuous', ins: () => 1, outs: 1, p: { num: '1', den: '1 1' } },
  pid: { name: 'PID controller', group: 'Continuous', ins: () => 1, outs: 1, p: { Kp: 1, Ki: 0, Kd: 0, N: 100 } },
  scope: { name: 'Scope', group: 'Sinks', ins: (p) => Math.max(1, Math.min(4, Number(p.inputs ?? 1))), outs: 0, p: { inputs: 1 } },
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

export interface RunResult { t: number[]; scopes: Map<string, number[][]>; error?: string; capped?: boolean }

/** Runs the diagram from 0 to its stop time. */
export function simulate(dg: Diagram): RunResult {
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
  const through = (b: Block) => !['step', 'sine', 'constant', 'pulse', 'ramp', 'integrator', 'scope'].includes(b.kind) && !(b.kind === 'tf' && info.get(b.id)!.D === 0 && info.get(b.id)!.order > 0);
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
  const y = new Map<string, number>();
  const input = (b: Block, i: number) => { const w = into.get(`${b.id}:${i}`); return w ? (y.get(w.from) ?? 0) : 0; };
  /** Every block's output at time t from the states x. */
  const outputs = (t: number, x: Float64Array) => {
    for (const b of order) {
      const p = b.p;
      let v = 0;
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
      }
      y.set(b.id, v);
    }
  };
  const deriv = (t: number, x: Float64Array) => {
    outputs(t, x);
    const dx = new Float64Array(ns);
    for (const b of blocks) {
      const o = off.get(b.id);
      if (o === undefined) continue;
      if (b.kind === 'integrator') dx[o] = input(b, 0);
      else if (b.kind === 'pid') { const e = input(b, 0); dx[o] = e; dx[o + 1] = n(b.p.N, 100) * (e - x[o + 1]); }
      else if (b.kind === 'tf') {
        const c = info.get(b.id)!, u = input(b, 0);
        if (c.order) { dx[o] = u - c.a.reduce((s, a, k) => s + a * x[o + k], 0); for (let k = 1; k < c.order; k++) dx[o + k] = x[o + k - 1]; }
      }
    }
    return dx;
  };
  const x = new Float64Array(ns);
  for (const b of blocks) if (b.kind === 'integrator') x[off.get(b.id)!] = n(b.p.initial);
  const h = Math.max(1e-6, dg.dt), want = Math.ceil(dg.stop / h - 1e-9), steps = Math.min(MAX_STEPS, want);
  const every = Math.max(1, Math.floor(steps / 2000)), t: number[] = [], scopes = new Map<string, number[][]>();
  for (const b of blocks) if (b.kind === 'scope') scopes.set(b.id, Array.from({ length: KINDS.scope.ins(b.p) }, () => []));
  const record = (tt: number) => { outputs(tt, x); t.push(tt); for (const b of blocks) if (b.kind === 'scope') scopes.get(b.id)!.forEach((arr, i) => arr.push(into.has(`${b.id}:${i}`) ? input(b, i) : NaN)); };
  for (let k = 0; k < steps; k++) {
    const tk = k * h;
    if (k % every === 0) record(tk);
    const k1 = deriv(tk, x), x2 = x.map((v, i) => v + (h / 2) * k1[i]);
    const k2 = deriv(tk + h / 2, x2), x3 = x.map((v, i) => v + (h / 2) * k2[i]);
    const k3 = deriv(tk + h / 2, x3), x4 = x.map((v, i) => v + h * k3[i]);
    const k4 = deriv(tk + h, x4);
    for (let i = 0; i < ns; i++) x[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    if (!x.every(Number.isFinite)) return { t, scopes, error: `The model blew up at t = ${+tk.toPrecision(3)} s (a value became infinite): the loop is unstable or the step is too big.` };
  }
  record(steps * h);
  return { t, scopes, capped: want > steps };
}

let seq = 0;
export const blockId = (k: string) => `${k}${Date.now().toString(36)}${(seq++).toString(36)}`;
export const newBlock = (kind: BlockKind, x: number, y: number): Block => ({ id: blockId(kind), kind, x, y, p: { ...KINDS[kind].p } });

const B = (kind: BlockKind, x: number, y: number, p: Block['p'] = {}): Block => ({ ...newBlock(kind, x, y), p: { ...KINDS[kind].p, ...p } });
const W = (from: Block, to: Block, inPort = 0): Wire => ({ id: blockId('w'), from: from.id, out: 0, to: to.id, in: inPort });

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
    p: Object.fromEntries(Object.entries(KINDS[b.kind].p).map(([k, v]) => [k, typeof b.p?.[k] === typeof v && (k !== 'signs' || /^[+-]{1,6}$/.test(String(b.p[k]))) ? (typeof v === 'string' ? String(b.p[k]).slice(0, 80) : b.p[k]) : v])),
  }));
  const ids = new Set(blocks.map((b) => b.id));
  const wires = d.wires.filter((w) => w && ids.has(String(w.from)) && ids.has(String(w.to))).slice(0, 400).map((w) => ({ id: String(w.id), from: String(w.from), out: n(w.out), to: String(w.to), in: n(w.in) }));
  return { blocks, wires, stop: Math.max(1e-3, Math.min(1e5, n(d.stop, 10))), dt: Math.max(1e-5, Math.min(10, n(d.dt, 0.01))) };
}
