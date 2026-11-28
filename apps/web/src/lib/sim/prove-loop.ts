import { chartStart, type Chart, type Expr } from './chart';
import { closure, type LinearNet } from './prove-linear';
import { inName, ivOf, join, partsOf, refine, runIv, type Iv } from './prove';

// Hyperion Simulate → Blocks → Verify → Prove, a chart and the system it drives proved together (M575, M574's left-out:
// "relating signals to each other: an integrator in a loop is bounded by the run's length, not by the loop holding
// it"). A chart steps every dt; between its steps its outputs hold and the linear blocks move exactly as
// x ← Φ x + Γ y + (the other inputs' part), Φ = e^{A·dt}. So the loop is one discrete system, and M573's boxes extend to
// it: every chart state keeps a box over its own variables AND the plant's states, a transition's condition narrows the
// plant too (`level >= 2` narrows the tank's level), and the boxes hold at every step, forever. Two things make it sharp:
//
//   • states with `after` are split by how many steps they've been active (so a timed state can't drift for longer than
//     its timer lets it), up to a few thousand pieces;
//   • boxes may grow many times before a widening (a guard like `level >= 2` usually stops the growth first), and then
//     only to the next number in the conditions or power of two; after that, rounds of narrowing: each box replaced by
//     what can really reach it from the others, which gives back what the widening threw away.
//
// The result: ranges for the chart's outputs, its inputs and the plant's states, sound at every step of any run.

const TOP: Iv = [-Infinity, Infinity];
const num = (v: number): Expr => ({ k: 'num', v });
const v = (name: string): Expr => ({ k: 'var', name });
const lin = (terms: [number, Expr][]): Expr => terms.filter(([c]) => c).reduce<Expr>((acc, [c, e]) => {
  const t: Expr = c === 1 ? e : { k: 'bin', op: '*', a: num(c), b: e };
  return acc.k === 'num' && acc.v === 0 ? t : { k: 'bin', op: '+', a: acc, b: t };
}, num(0));
type Box = Record<string, Iv>;
const meet = (a: Box, b: Box): Box | null => {
  const out: Box = {};
  for (const k of Object.keys(a)) { const lo = Math.max(a[k][0], b[k]?.[0] ?? -Infinity), hi = Math.min(a[k][1], b[k]?.[1] ?? Infinity); if (lo > hi) return null; out[k] = [lo, hi]; }
  return out;
};
const joinBox = (a: Box, b: Box): Box => Object.fromEntries(Object.keys(a).map((k) => [k, join(a[k], b[k] ?? TOP)]));

/** Where a chart input comes from: a linear signal (its row over [x, u]), a cut's range, or nothing (0). */
export type InputSource = { row: Float64Array } | { range: Iv } | null;

export interface LoopResult { vars: Record<string, Iv>; states: Record<number, Iv>; nodes: number }

/** e^{A dt} and, per cut, ∫₀^dt e^{As} b ds (whole, positive and negative parts), on the states S. */
function discretise(net: LinearNet, S: number[], dt: number) {
  const m = S.length, nu = net.cuts.length, A = S.map((k) => S.map((l) => net.A[k][l]));
  const rho = 1 + Math.max(...A.map((r) => r.reduce((s, a) => s + Math.abs(a), 0)));
  const sub = Math.max(20, Math.ceil((dt * rho) / 0.05)), h = dt / sub;
  // Columns: the identity (for Φ), then each cut's b.
  let X = S.map((k, i) => [...S.map((_, j) => (i === j ? 1 : 0)), ...net.B[k]]);
  const cols = m + nu, f = (Y: number[][]) => A.map((r) => Array.from({ length: cols }, (_, j) => r.reduce((s, a, l) => s + a * Y[l][j], 0)));
  const add = (Y: number[][], K: number[][], c: number) => Y.map((r, i) => r.map((x, j) => x + c * K[i][j]));
  const G = S.map(() => new Array<number>(nu).fill(0)), P = S.map(() => new Array<number>(nu).fill(0)), N = S.map(() => new Array<number>(nu).fill(0));
  for (let s = 0; s < sub; s++) {
    const k1 = f(X), k2 = f(add(X, k1, h / 2)), k3 = f(add(X, k2, h / 2)), k4 = f(add(X, k3, h));
    const next = X.map((r, i) => r.map((x, j) => x + (h / 6) * (k1[i][j] + 2 * k2[i][j] + 2 * k3[i][j] + k4[i][j])));
    for (let i = 0; i < m; i++) for (let j = 0; j < nu; j++) {
      const a = X[i][m + j], b = next[i][m + j];
      G[i][j] += (h * (a + b)) / 2;
      if ((a >= 0) === (b >= 0)) { if (a >= 0) P[i][j] += (h * (a + b)) / 2; else N[i][j] += (h * (a + b)) / 2; }
      else { const z = (h * Math.abs(a)) / (Math.abs(a) + Math.abs(b)); if (a >= 0) { P[i][j] += (z * a) / 2; N[i][j] += ((h - z) * b) / 2; } else { N[i][j] += (z * a) / 2; P[i][j] += ((h - z) * b) / 2; } }
    }
    X = next;
  }
  const pad = (x: number, s: number) => x + s * (1e-6 * Math.abs(x) + 1e-12);
  return { Phi: X.map((r) => r.slice(0, m)), G, P: P.map((r) => r.map((x) => pad(x, 1))), N: N.map((r) => r.map((x) => pad(x, -1))) };
}

/**
 * The chart `ch` (block `chartId`) with the plant it drives: `sources[i]` says where its input i comes from, `cuts[j]`
 * each cut's range (the chart's own outputs among them are replaced by its variables). Null: no loop through the plant.
 */
export function loopRanges(ch: Chart, chartId: string, net: LinearNet, sources: InputSource[], cuts: Iv[], dt: number): LoopResult | null {
  const ns = net.ns, nu = net.cuts.length;
  const fed = sources.flatMap((s) => (s && 'row' in s ? [s.row] : []));
  const S = closure(net, fed.flatMap((r) => Array.from(r.subarray(0, ns)).flatMap((c, k) => (c ? [k] : []))));
  if (!S.length || S.length > 30 || !(dt > 0)) return null;
  const own = net.cuts.map((c) => (c.startsWith(`${chartId}#`) ? ch.outputs[Number(c.split('#')[1])] : undefined));
  if (!S.some((k) => net.B[k].some((b, j) => b && own[j]))) return null; // the chart doesn't move this plant
  const { Phi, G, P, N } = discretise(net, S, dt);
  // Names: a plant state read straight by a chart input takes the input's name (so the input's conditions narrow it).
  const xn = new Map<number, string>(S.map((k) => [k, `__x${k}`]));
  sources.forEach((s, i) => {
    if (!s || !('row' in s)) return;
    const nz = [...s.row.keys()].filter((q) => s.row[q]);
    if (nz.length === 1 && nz[0] < ns && s.row[nz[0]] === 1 && xn.get(nz[0])!.startsWith('__x')) xn.set(nz[0], ch.inputs[i]);
  });
  const uExpr = (j: number): Expr => (own[j] ? v(own[j]!) : v(`__u${j}`));
  const sigExpr = (row: Float64Array) => lin([...S.map((k) => [row[k], v(xn.get(k)!)] as [number, Expr]), ...Array.from({ length: nu }, (_, j) => [row[ns + j], uExpr(j)] as [number, Expr])]);
  // Non-aliased chart inputs fed by the plant: chart locals kept equal to their signal.
  const derived = sources.flatMap((s, i) => (s && 'row' in s && ![...xn.values()].includes(ch.inputs[i]) ? [{ name: ch.inputs[i], e: sigExpr(s.row) }] : []));
  const step = S.map((k, i) => lin([
    ...S.map((l, q) => [Phi[i][q], v(xn.get(l)!)] as [number, Expr]),
    ...Array.from({ length: nu }, (_, j) => (own[j] ? [[G[i][j], uExpr(j)]] : [[P[i][j], uExpr(j)], [N[i][j], uExpr(j)]]) as [number, Expr][]).flat(),
  ]));
  const plain: Box = {};
  cuts.forEach((r, j) => { if (!own[j]) plain[`__u${j}`] = r; });
  sources.forEach((s, i) => { if (!s) plain[ch.inputs[i]] = [0, 0]; else if ('range' in s) plain[ch.inputs[i]] = s.range; });
  /** After the chart's turn: the plant moves one step and the derived inputs follow. */
  const tick = (env: Box): Box => {
    const next = step.map((e) => ivOf(e, env)), out = { ...env };
    S.forEach((k, i) => { out[xn.get(k)!] = next[i]; });
    const withU = { ...out, ...plain };
    for (const d of derived) out[d.name] = ivOf(d.e, withU);
    return out;
  };
  const vars = [...new Set([...ch.outputs, ...ch.locals, ...S.map((k) => xn.get(k)!), ...derived.map((d) => d.name)])];
  const keep = (b: Box): Box => Object.fromEntries(vars.map((x) => [x, b[x] ?? TOP]));

  // Nodes: (state, steps active), the last of a state's pieces "long enough for every timer" (or unknown when capped).
  const maxAfter = ch.states.map((_, s) => Math.max(0, ...ch.trans.filter((t) => t.from === s).map((t) => t.after)));
  let K = maxAfter.map((a) => (a > 0 ? Math.ceil(a / dt + 1e-9) + 2 : 0));
  const capped = K.reduce((s, k) => s + k + 1, 0) > 4000;
  if (capped) K = K.map(() => 0);
  const base: number[] = [];
  let total = 0;
  K.forEach((k) => { base.push(total); total += k + 1; });
  const node = (s: number, k: number) => base[s] + Math.min(k, K[s]);
  const elapsed = (s: number, k: number): Iv => (K[s] === 0 ? [0, Infinity] : k === 0 ? [0, dt] : k >= K[s] ? [K[s] * dt, Infinity] : [k * dt, k * dt]);
  const tol = (a: number) => 1e-6 * Math.max(1, a);

  // The start: the chart's own start, the plant at rest at its initial values, the inputs as they are then.
  const r0 = chartStart(ch, 0), start: Box = {};
  for (const x of [...ch.outputs, ...ch.locals]) start[x] = [r0.vars[x], r0.vars[x]];
  for (const k of S) start[xn.get(k)!] = [net.x0[k], net.x0[k]];
  for (const d of derived) start[d.name] = ivOf(d.e, { ...start, ...plain });

  /** Everything one step from node (s, k) with box b reaches: [node, box][]. */
  const post = (s: number, k: number, b: Box): [number, Box][] => {
    const out: [number, Box][] = [];
    const el = elapsed(s, k);
    let env: Box | null = { ...b, ...plain, t: el, time: [0, Infinity] };
    for (const p of partsOf(ch.states[s].name)) env[inName(p)] = [1, 1];
    for (let q = 0; q < ch.trans.length && env; q++) {
      const tr = ch.trans[q];
      if (tr.from !== s) continue;
      const a = tr.after, when = a <= 0 ? 'yes' : capped ? 'maybe' : el[0] > a + tol(a) ? 'yes' : el[1] < a - tol(a) ? 'no' : 'maybe';
      if (when === 'no') continue;
      const yes = refine(tr.cond, env, true);
      if (yes) out.push([node(tr.to, 1), keep(tick(runIv([...ch.states[s].exit, ...tr.action, ...ch.states[tr.to].entry], { ...yes, t: [0, 0] })))]);
      if (when === 'yes') env = refine(tr.cond, env, false);
    }
    if (env) out.push([node(s, k + 1), keep(tick(runIv(ch.states[s].during, env)))]);
    return out;
  };
  const sk = (i: number): [number, number] => { let s = 0; while (s + 1 < base.length && base[s + 1] <= i) s++; return [s, i - base[s]]; };

  // Up: join until nothing grows. A box that has grown 2000 times (a guard usually stops the growth long before) is
  // widened to the next "threshold": a number from the conditions or a power of two, then ±∞.
  const lits = new Set<number>([0]);
  const walk = (e: Expr) => { if (e.k === 'num') lits.add(e.v); else if (e.k === 'un') walk(e.a); else if (e.k === 'bin') { walk(e.a); walk(e.b); } else if (e.k === 'call') e.args.forEach(walk); };
  for (const tr of ch.trans) walk(tr.cond);
  for (let p = -10; p <= 30; p++) { lits.add(2 ** p); lits.add(-(2 ** p)); }
  const marks = [...lits].sort((a, b) => a - b);
  const up = (x: number) => marks.find((m) => m >= x) ?? Infinity, down = (x: number) => [...marks].reverse().find((m) => m <= x) ?? -Infinity;
  const box: (Box | null)[] = new Array(total).fill(null), grew = new Array<number>(total).fill(0);
  box[node(0, 0)] = keep(start);
  const work = [node(0, 0)];
  let guard = 0;
  while (work.length && guard++ < 1_000_000) {
    const i = work.shift()!, [s, k] = sk(i);
    for (const [j, b] of post(s, k, box[i]!)) {
      const old = box[j];
      if (old && vars.every((x) => b[x][0] >= old[x][0] && b[x][1] <= old[x][1])) continue;
      let next = old ? joinBox(old, b) : b;
      if (old && ++grew[j] > 2000) next = Object.fromEntries(vars.map((x) => [x, [next[x][0] < old[x][0] ? down(next[x][0]) : old[x][0], next[x][1] > old[x][1] ? up(next[x][1]) : old[x][1]] as Iv]));
      box[j] = next;
      if (!work.includes(j)) work.push(j);
    }
  }
  if (work.length) return null;
  // Down: narrowing, each box cut to what really reaches it (sound: the boxes already cover every step).
  for (let round = 0; round < 60; round++) {
    const got: (Box | null)[] = new Array(total).fill(null);
    got[node(0, 0)] = keep(start);
    box.forEach((b, i) => { if (!b) return; const [s, k] = sk(i); for (const [j, nb] of post(s, k, b)) got[j] = got[j] ? joinBox(got[j]!, nb) : nb; });
    let changed = false;
    for (let i = 0; i < total; i++) {
      const old = box[i];
      if (!old) continue;
      const nb = got[i] ? meet(old, got[i]!) : null;
      if (!nb || vars.some((x) => nb[x][0] !== old[x][0] || nb[x][1] !== old[x][1])) changed = true;
      box[i] = nb;
    }
    if (!changed) break;
  }
  const all = box.reduce<Box | null>((acc, b) => (b ? (acc ? joinBox(acc, b) : b) : acc), null);
  if (!all) return null;
  const states: Record<number, Iv> = {};
  for (const k of S) states[k] = all[xn.get(k)!];
  return { vars: Object.fromEntries(vars.filter((x) => !x.startsWith('__x')).map((x) => [x, all[x]])), states, nodes: box.filter(Boolean).length };
}
