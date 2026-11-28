import { canon, coeffs, n, type Block, type Diagram } from './blocks';
import { eigvals } from '../lab/complex';
import { mat } from '../lab/values';
import { mulIv, type Iv } from './prove';

// Hyperion Simulate → Blocks → Verify → Prove, the diagram's linear part as one system (M575, M574's left-outs: "an
// integrator in a loop is bounded only by the run's length" and "proofs past the run's end"). Gains, sums,
// integrators, transfer functions and PID controllers joined together are one linear system ẋ = A x + B u, s = C x + D u,
// whose inputs u are the other blocks' outputs (sources, saturations, products, delays, charts, board pins: the "cuts").
// Each signal s is then its free response from the starting state plus D·u plus the convolution of its impulse response
// h with u, so over a time span it lies within free + D·[u] + ∫h⁺·[u] + ∫h⁻·[u]. Taken over the whole loop at once, a
// stable loop (every pole of its part of A to the left) holds its signals near where it keeps them, and its bounds hold
// FOREVER (h is followed until it has died away, with a margin for the rest); an unstable part (a bare integrator) is
// bounded over the run only.

const LINEAR = new Set<Block['kind']>(['gain', 'sum', 'integrator', 'tf', 'pid']);
export const isLinear = (b: Block) => LINEAR.has(b.kind);
const TOP: Iv = [-Infinity, Infinity];

export interface LinearNet {
  ns: number; cuts: string[]; sigs: string[]; A: number[][]; B: number[][]; C: number[][]; D: number[][]; x0: number[];
  /** Each signal's row over [x, u] (for reading a signal from the states and cuts). */
  row: Map<string, Float64Array>;
}

/** The diagram's linear blocks as one state-space system (throws on an algebraic loop, as the simulator does). */
export function linearNet(dg: Diagram): LinearNet {
  const byId = new Map(dg.blocks.map((b) => [b.id, b]));
  const into = new Map<string, string>();
  for (const w of dg.wires) if (byId.has(w.from) && byId.has(w.to)) into.set(`${w.to}:${w.in}`, `${w.from}#${w.out}`);
  const lin = dg.blocks.filter(isLinear), off = new Map<string, number>(), tf = new Map<string, ReturnType<typeof canon>>();
  let ns = 0;
  for (const b of lin) {
    off.set(b.id, ns);
    if (b.kind === 'integrator') ns += 1;
    else if (b.kind === 'pid') ns += 2;
    else if (b.kind === 'tf') { const c = canon(coeffs(b.p.num), coeffs(b.p.den)); tf.set(b.id, c); ns += c.order; }
  }
  const ins = (b: Block) => (b.kind === 'sum' ? String(b.p.signs ?? '+-').length : 1);
  const cuts: string[] = [];
  for (const b of lin) for (let i = 0; i < ins(b); i++) { const s = into.get(`${b.id}:${i}`); if (s && !isLinear(byId.get(s.split('#')[0])!) && !cuts.includes(s)) cuts.push(s); }
  const W = ns + cuts.length, row = new Map<string, Float64Array>(), busy = new Set<string>();
  const axpy = (acc: Float64Array, k: number, v: Float64Array) => { if (k) for (let i = 0; i < W; i++) acc[i] += k * v[i]; return acc; };
  const unit = (i: number) => { const v = new Float64Array(W); v[i] = 1; return v; };
  const expr = (ref: string | undefined): Float64Array => {
    if (!ref) return new Float64Array(W);
    const ci = cuts.indexOf(ref);
    if (ci >= 0) return unit(ns + ci);
    const got = row.get(ref);
    if (got) return got;
    if (busy.has(ref)) throw new Error('An algebraic loop: blocks feed each other with no integrator or delay between.');
    busy.add(ref);
    const b = byId.get(ref.split('#')[0])!, p = b.p, o = off.get(b.id)!, inp = (i: number) => expr(into.get(`${b.id}:${i}`));
    const v = new Float64Array(W);
    switch (b.kind) {
      case 'gain': axpy(v, n(p.k, 1), inp(0)); break;
      case 'sum': [...String(p.signs ?? '+-')].forEach((c, i) => axpy(v, c === '-' ? -1 : 1, inp(i))); break;
      case 'integrator': v[o] = 1; break;
      case 'tf': { const c = tf.get(b.id)!; c.C.forEach((ck, k) => { v[o + k] = ck; }); if (c.D) axpy(v, c.D, inp(0)); break; }
      case 'pid': { const N = n(p.N, 100), e = inp(0); axpy(v, n(p.Kp, 1) + n(p.Kd) * N, e); v[o] += n(p.Ki); v[o + 1] -= n(p.Kd) * N; break; }
    }
    busy.delete(ref);
    row.set(ref, v);
    return v;
  };
  const sigs = lin.map((b) => `${b.id}#0`);
  sigs.forEach(expr);
  const dx: Float64Array[] = Array.from({ length: ns }, () => new Float64Array(W));
  for (const b of lin) {
    const o = off.get(b.id)!, e = () => expr(into.get(`${b.id}:0`));
    if (b.kind === 'integrator') axpy(dx[o], 1, e());
    else if (b.kind === 'pid') { const N = n(b.p.N, 100); axpy(dx[o], 1, e()); axpy(dx[o + 1], N, e()); dx[o + 1][o + 1] -= N; }
    else if (b.kind === 'tf') { const c = tf.get(b.id)!; if (c.order) { axpy(dx[o], 1, e()); c.a.forEach((a, k) => { dx[o][o + k] -= a; }); for (let k = 1; k < c.order; k++) dx[o + k][o + k - 1] += 1; } }
  }
  const x0 = new Array<number>(ns).fill(0);
  for (const b of lin) if (b.kind === 'integrator') x0[off.get(b.id)!] = n(b.p.initial);
  const split = (v: Float64Array) => [Array.from(v.subarray(0, ns)), Array.from(v.subarray(ns))];
  return {
    ns, cuts, sigs, x0, row,
    A: dx.map((r) => split(r)[0]), B: dx.map((r) => split(r)[1]),
    C: sigs.map((s) => split(row.get(s)!)[0]), D: sigs.map((s) => split(row.get(s)!)[1]),
  };
}

/** The states a set of states depends on (they and everything feeding them: a closed part of the system). */
export function closure(net: LinearNet, start: number[]): number[] {
  const got = new Set(start), todo = [...start];
  while (todo.length) { const k = todo.pop()!; net.A[k].forEach((a, l) => { if (a && !got.has(l)) { got.add(l); todo.push(l); } }); }
  return [...got].sort((a, b) => a - b);
}

/** The largest real part of the eigenvalues of A restricted to these states (−∞ for none). */
export function abscissa(net: LinearNet, S: number[]): number {
  if (!S.length) return -Infinity;
  const m = S.length, d = new Float64Array(m * m);
  S.forEach((k, i) => S.forEach((l, j) => { d[i + j * m] = net.A[k][l]; }));
  return Math.max(...eigvals(mat(m, m, d)).re);
}

/** One signal's bound: free response's range and, per cut, D and ∫h⁺, ∫h⁻ (null: none found, any value). */
export interface SigCoef { free: Iv; D: number[]; P: number[]; N: number[] }

/** Each signal's coefficients over [0, horizon] (`Infinity`: forever, only for stable parts; unstable ones get null). */
export function coefficients(net: LinearNet, horizon: number): (SigCoef | null)[] {
  const nu = net.cuts.length, out: (SigCoef | null)[] = new Array(net.sigs.length).fill(null), groups = new Map<string, number[]>();
  net.sigs.forEach((_, i) => {
    const S = closure(net, net.C[i].flatMap((c, k) => (c ? [k] : [])));
    const key = S.join(',');
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  for (const [key, list] of groups) {
    const S = key ? key.split(',').map(Number) : [];
    if (!S.length) { for (const i of list) out[i] = { free: [0, 0], D: net.D[i], P: new Array(nu).fill(0), N: new Array(nu).fill(0) }; continue; }
    const alpha = abscissa(net, S);
    if (horizon === Infinity && !(alpha < 0)) continue;
    const got = respond(net, S, list, horizon, alpha);
    if (got) list.forEach((i, q) => { out[i] = got[q]; });
  }
  return out;
}

/** The impulse responses of these signals from every cut, and the free response, followed by Runge–Kutta. */
function respond(net: LinearNet, S: number[], list: number[], horizon: number, alpha: number): SigCoef[] | null {
  const m = S.length, nu = net.cuts.length, cols = nu + 1;
  const A = S.map((k) => S.map((l) => net.A[k][l])), Cs = list.map((i) => S.map((k) => net.C[i][k]));
  const rho = 1 + Math.max(...A.map((r) => r.reduce((s, v) => s + Math.abs(v), 0)));
  let h = 0.2 / rho;
  if (Number.isFinite(horizon)) h = Math.min(h, horizon / 2000);
  const maxSteps = Math.floor(2e8 / Math.max(1, m * m * cols + list.length * m * cols));
  const steps = Number.isFinite(horizon) ? Math.ceil(horizon / h) : maxSteps;
  if (steps > maxSteps || !(h > 0)) return null;
  if (Number.isFinite(horizon)) h = horizon / steps;
  // X = e^{At} [B | x0], one column per cut and the start.
  let X = S.map((k) => [...net.B[k], net.x0[k]]);
  const f = (Y: number[][]) => A.map((r) => Array.from({ length: cols }, (_, j) => r.reduce((s, a, l) => s + a * Y[l][j], 0)));
  const add = (Y: number[][], K: number[][], c: number) => Y.map((r, i) => r.map((v, j) => v + c * K[i][j]));
  const read = () => Cs.map((c) => Array.from({ length: cols }, (_, j) => c.reduce((s, ck, l) => s + ck * X[l][j], 0)));
  const P = list.map(() => new Array<number>(nu).fill(0)), N = list.map(() => new Array<number>(nu).fill(0));
  let prev = read();
  const lo = prev.map((r) => r[nu]), hi = prev.map((r) => r[nu]);
  let peak = Math.max(1e-300, ...X.flat().map(Math.abs));
  for (let s = 0; s < steps; s++) {
    const k1 = f(X), k2 = f(add(X, k1, h / 2)), k3 = f(add(X, k2, h / 2)), k4 = f(add(X, k3, h));
    X = X.map((r, i) => r.map((v, j) => v + (h / 6) * (k1[i][j] + 2 * k2[i][j] + 2 * k3[i][j] + k4[i][j])));
    const cur = read();
    for (let q = 0; q < list.length; q++) {
      for (let j = 0; j < nu; j++) {
        const a = prev[q][j], b = cur[q][j];
        // Trapezoid on each sign's part (split where the line crosses 0).
        if ((a >= 0) === (b >= 0)) { if (a >= 0) P[q][j] += (h * (a + b)) / 2; else N[q][j] += (h * (a + b)) / 2; }
        else { const z = (h * Math.abs(a)) / (Math.abs(a) + Math.abs(b)); if (a >= 0) { P[q][j] += (z * a) / 2; N[q][j] += ((h - z) * b) / 2; } else { N[q][j] += (z * a) / 2; P[q][j] += ((h - z) * b) / 2; } }
      }
      lo[q] = Math.min(lo[q], cur[q][nu]); hi[q] = Math.max(hi[q], cur[q][nu]);
    }
    prev = cur;
    const big = Math.max(...X.flat().map(Math.abs));
    if (!Number.isFinite(big)) return null;
    peak = Math.max(peak, big);
    if (!Number.isFinite(horizon) && s > 100 && big < 1e-13 * peak) break; // died away: the rest adds next to nothing
    if (!Number.isFinite(horizon) && s === steps - 1) return null; // never died away within the budget
  }
  // Margins: the integration's own error, and (forever) the tail after the last step, a decaying exponential at most
  // twice as slow as the slowest pole.
  const tail = (v: number) => (Number.isFinite(horizon) ? 0 : (2 * Math.abs(v)) / Math.max(1e-9, -alpha));
  return list.map((i, q) => ({
    free: [lo[q] - 1e-9 * (1 + Math.abs(lo[q])) - (Number.isFinite(horizon) ? 0 : 2 * Math.abs(prev[q][nu])), hi[q] + 1e-9 * (1 + Math.abs(hi[q])) + (Number.isFinite(horizon) ? 0 : 2 * Math.abs(prev[q][nu]))],
    D: net.D[i],
    P: P[q].map((v, j) => v * (1 + 1e-4) + 1e-12 + tail(prev[q][j])),
    N: N[q].map((v, j) => v * (1 + 1e-4) - 1e-12 - tail(prev[q][j])),
  }));
}

/** A signal's range for these cut ranges (undefined: nothing known yet, taken as 0 for now). */
export function sigRange(c: SigCoef | null, cuts: (Iv | undefined)[]): Iv {
  if (!c) return TOP;
  let r: Iv = [...c.free];
  cuts.forEach((u, j) => {
    if (!u || (!c.D[j] && !c.P[j] && !c.N[j])) return;
    for (const k of [c.D[j], c.P[j], c.N[j]]) { if (!k) continue; const t = mulIv([k, k], u); r = [r[0] + t[0], r[1] + t[1]]; }
  });
  return [Number.isNaN(r[0]) ? -Infinity : r[0], Number.isNaN(r[1]) ? Infinity : r[1]];
}
