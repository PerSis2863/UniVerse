import { canon, chartOf, coeffs, compile, KINDS, n, type Block, type Diagram } from './blocks';
import { evalExpr, FUNCS, type Assign, type Chart, type Expr } from './chart';

// Hyperion Simulate → Blocks → Code (M565): a diagram turned into one step of plain arithmetic, the form every code
// generator prints (blockcode.ts) and `emulate` runs, so a test can hold the generated C against it. Embedded code
// steps at a fixed rate, so continuous states move by forward Euler (x += dt · dx), as Simulink's generated code does
// with its fixed-step solver; with a small step it follows the Runge–Kutta run closely.
//
// One step at time t: every block's output from the states (in the order the wires allow), the outputs written, the
// states moved, the charts take their turn with this step's values, then t += dt.

/** An expression: the chart's (M563) plus a choice (c ? a : b). */
export type E = Expr | { k: 'sel'; c: E; a: E; b: E };
export interface Ir {
  dt: number;
  inputs: { name: string; test: number }[];
  signals: { name: string; e: E; block: string }[];
  outputs: { name: string; e: E }[];
  states: { name: string; init: number; d: E; block: string }[];
  charts: IrChart[];
}
export interface IrChart { name: string; ch: Chart; ins: E[]; vars: string[]; block: string }

const num = (v: number): E => ({ k: 'num', v }), v = (name: string): E => ({ k: 'var', name });
const bin = (op: string, a: E, b: E): E => ({ k: 'bin', op, a, b });
const plus = (a: E, b: E): E => (a.k === 'num' && a.v === 0 ? b : b.k === 'num' && b.v === 0 ? a : bin('+', a, b));
const times = (k: number, a: E): E => (k === 1 ? a : k === 0 ? num(0) : bin('*', num(k), a));

/** Names that are safe in every language printed (letters, digits, underscores; not a keyword). */
export function safeNames(dg: Diagram) {
  const count = new Map<string, number>(), out = new Map<string, string>();
  for (const b of dg.blocks) { const k = (count.get(b.kind) ?? 0) + 1; count.set(b.kind, k); out.set(b.id, `${b.kind.toLowerCase()}${k}`); }
  return out;
}

/** The diagram as one step of arithmetic; refuses what has no meaning in generated code. */
export function buildIr(dg: Diagram): Ir {
  const m = compile(dg), names = safeNames(dg), into = m.into;
  const sig = (id: string, out = 0) => { const b = m.byId.get(id)!, nm = names.get(id)!; return b.kind === 'chart' ? `${nm}_${chartOf(b).outputs[out] ?? 'y'}` : nm; };
  const input = (b: Block, i: number): E => { const w = into.get(`${b.id}:${i}`); return w ? v(sig(w.from, w.out)) : num(0); };
  const ir: Ir = { dt: dg.dt, inputs: [], signals: [], outputs: [], states: [], charts: [] };
  for (const b of m.order) {
    const p = b.p, nm = names.get(b.id)!, u = () => input(b, 0);
    let e: E | null = null;
    switch (b.kind) {
      case 'step': e = { k: 'sel', c: bin('>=', v('t'), num(n(p.time, 1))), a: num(n(p.after, 1)), b: num(n(p.before)) }; break;
      case 'sine': e = times(n(p.amplitude, 1), { k: 'call', fn: 'sin', args: [plus(times(2 * Math.PI * n(p.frequency, 1), v('t')), num((n(p.phase) * Math.PI) / 180))] }); break;
      case 'constant': e = num(n(p.value, 1)); break;
      case 'pulse': { const per = Math.max(1e-9, n(p.period, 2)); e = { k: 'sel', c: bin('<', bin('*', { k: 'call', fn: 'fmod', args: [v('t'), num(per)] }, num(100)), num(n(p.width, 50) * per)), a: num(n(p.amplitude, 1)), b: num(0) }; break; }
      case 'ramp': e = { k: 'sel', c: bin('>=', v('t'), num(n(p.start))), a: times(n(p.slope, 1), bin('-', v('t'), num(n(p.start)))), b: num(0) }; break;
      case 'gain': e = times(n(p.k, 1), u()); break;
      case 'sum': e = [...String(p.signs ?? '+-')].reduce<E>((acc, c, i) => (c === '-' ? bin('-', acc, input(b, i)) : plus(acc, input(b, i))), num(0)); break;
      case 'product': e = bin('*', input(b, 0), input(b, 1)); break;
      case 'saturation': e = { k: 'call', fn: 'min', args: [num(n(p.upper, 1)), { k: 'call', fn: 'max', args: [num(n(p.lower, -1)), u()] }] }; break;
      case 'integrator': ir.states.push({ name: `${nm}_x`, init: n(p.initial), d: u(), block: b.id }); e = v(`${nm}_x`); break;
      case 'tf': {
        const c = canon(coeffs(p.num), coeffs(p.den)), xs = Array.from({ length: c.order }, (_, k) => `${nm}_x${k + 1}`);
        xs.forEach((x, k) => ir.states.push({ name: x, init: 0, block: b.id, d: k === 0 ? c.a.reduce<E>((acc, a, j) => bin('-', acc, times(a, v(xs[j]))), u()) : v(xs[k - 1]) }));
        e = c.C.reduce<E>((acc, ck, k) => plus(acc, times(ck, v(xs[k]))), times(c.D, u()));
        break;
      }
      case 'pid': {
        const N = n(p.N, 100), err = u();
        ir.states.push({ name: `${nm}_i`, init: 0, d: err, block: b.id }, { name: `${nm}_f`, init: 0, d: times(N, bin('-', err, v(`${nm}_f`))), block: b.id });
        e = plus(plus(times(n(p.Kp, 1), err), times(n(p.Ki), v(`${nm}_i`))), times(n(p.Kd) * N, bin('-', err, v(`${nm}_f`))));
        break;
      }
      case 'boardIn': ir.inputs.push({ name: nm, test: n(p.test) }); break;
      case 'chart': {
        const ch = chartOf(b);
        ir.charts.push({ name: nm, ch, ins: ch.inputs.map((_, i) => input(b, i)), vars: [...ch.outputs, ...ch.locals], block: b.id });
        break;
      }
      case 'boardOut': ir.outputs.push({ name: nm, e: u() }); break;
      case 'scope': for (let i = 0; i < KINDS.scope.ins(p); i++) if (into.has(`${b.id}:${i}`)) ir.outputs.push({ name: `${nm}_${i + 1}`, e: input(b, i) }); break;
    }
    if (e) ir.signals.push({ name: nm, e, block: b.id });
  }
  if (!ir.outputs.length) throw new Error('Nothing comes out of this diagram: wire what the code should give into a Scope or a Board output.');
  return ir;
}

/** A chart's own expression with its names made the generated code's (inputs, its variables, t as time in state). */
export function chartExpr(c: IrChart, e: Expr): E {
  switch (e.k) {
    case 'num': return e;
    case 'var': return e.name === 't' ? bin('-', v('t'), v(`${c.name}_since`)) : v(`${c.name}_${e.name}`);
    case 'un': return { k: 'un', op: e.op, a: chartExpr(c, e.a) as Expr };
    case 'bin': return bin(e.op, chartExpr(c, e.a), chartExpr(c, e.b));
    case 'call': return { k: 'call', fn: e.fn, args: e.args.map((a) => chartExpr(c, a) as Expr) };
  }
}
export const chartAssigns = (c: IrChart, list: Assign[]) => list.map((a) => ({ name: `${c.name}_${a.name}`, e: chartExpr(c, a.e) }));

/** The value of an expression (the generated code's arithmetic, in doubles). */
export function evalE(e: E, env: Record<string, number>): number {
  if (e.k === 'sel') return evalE(e.c, env) ? evalE(e.a, env) : evalE(e.b, env);
  if (e.k === 'call' && e.fn === 'fmod') return evalE(e.args[0], env) % evalE(e.args[1], env);
  if (e.k === 'un') { const a = evalE(e.a, env); return e.op === '-' ? -a : a ? 0 : 1; }
  if (e.k === 'bin') return evalExpr({ k: 'bin', op: e.op, a: { k: 'num', v: evalE(e.a, env) }, b: { k: 'num', v: evalE(e.b, env) } }, {});
  if (e.k === 'call') return FUNCS[e.fn].f(...e.args.map((a) => evalE(a, env)));
  return evalExpr(e, env);
}

/** The generated code's steps, run here: what every output was at each step (inputs at their test values). */
export function emulate(ir: Ir, steps: number, inputs: (t: number) => Record<string, number> = () => Object.fromEntries(ir.inputs.map((i) => [i.name, i.test]))) {
  const env: Record<string, number> = { t: 0 };
  for (const s of ir.states) env[s.name] = s.init;
  for (const c of ir.charts) { for (const x of c.vars) env[`${c.name}_${x}`] = 0; env[`${c.name}_state`] = 0; env[`${c.name}_since`] = 0; runAssigns(chartAssigns(c, c.ch.states[0].entry), env); }
  const out: Record<string, number[]> = Object.fromEntries(ir.outputs.map((o) => [o.name, []]));
  for (let k = 0; k < steps; k++) {
    Object.assign(env, inputs(env.t));
    for (const s of ir.signals) env[s.name] = evalE(s.e, env);
    for (const o of ir.outputs) out[o.name].push(evalE(o.e, env));
    const d = ir.states.map((s) => evalE(s.d, env));
    ir.states.forEach((s, i) => { env[s.name] += ir.dt * d[i]; });
    for (const c of ir.charts) chartTurn(c, env);
    env.t += ir.dt;
  }
  return out;
}
const runAssigns = (list: { name: string; e: E }[], env: Record<string, number>) => { for (const a of list) env[a.name] = evalE(a.e, env); };
function chartTurn(c: IrChart, env: Record<string, number>) {
  c.ch.inputs.forEach((x, i) => { env[`${c.name}_${x}`] = evalE(c.ins[i], env); });
  const st = env[`${c.name}_state`];
  for (const tr of c.ch.trans) {
    if (tr.from !== st || env.t - env[`${c.name}_since`] < tr.after - 1e-9 || !evalE(chartExpr(c, tr.cond), env)) continue;
    runAssigns(chartAssigns(c, c.ch.states[st].exit), env);
    runAssigns(chartAssigns(c, tr.action), env);
    env[`${c.name}_state`] = tr.to; env[`${c.name}_since`] = env.t;
    runAssigns(chartAssigns(c, c.ch.states[tr.to].entry), env);
    return;
  }
  runAssigns(chartAssigns(c, c.ch.states[st].during), env);
}
