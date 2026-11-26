import { compile, type Diagram } from './blocks';

// Hyperion Simulate → Blocks → Tune (M562, the owner's picture: "linearize nonlinear physical models to develop
// closed-loop control systems with linear techniques"): a diagram's small-signal model from one block's output to
// another's, around where the model is at a chosen time. The loop is opened at the first block (its output held and
// nudged), every other state is nudged too, and the slopes (central differences) give A, B, C, D; the transfer
// function comes from them exactly (Faddeev–LeVerrier). Saturations and products linearise where they sit then.

export interface Linear { A: number[][]; B: number[]; C: number[]; D: number; num: number[]; den: number[]; u0: number; y0: number }

/** The diagram linearised from block `from`'s output (the loop opened there) to block `to`'s output, at time `at`. */
export function linearize(dg: Diagram, from: string, to: string, at = 0): Linear {
  const ids = new Set(dg.blocks.map((b) => b.id));
  if (!ids.has(from) || !ids.has(to)) throw new Error('Choose blocks that are in the diagram.');
  // Where the model is at `at` (run there as it is).
  // Delay blocks as their Padé transfer functions throughout (M567), so the states line up and the delay's phase is in.
  const m = compile(dg, undefined, undefined, true), x = Float64Array.from(m.x0), h = Math.max(1e-6, dg.dt), steps = Math.min(200_000, Math.round(at / h));
  for (let k = 0; k < steps; k++) m.step(k * h, x, h);
  const t = steps * h;
  m.outputs(t, x);
  const u0 = m.y.get(from) ?? 0;
  // The loop opened at `from`: its output held at u, its own states left out.
  const hold = new Map([[from, u0]]), mh = compile(dg, hold, undefined, true);
  const kind = dg.blocks.find((b) => b.id === from)!.kind, own = mh.off.get(from);
  const width = own === undefined ? 0 : kind === 'pid' ? 2 : kind === 'tf' || kind === 'delay' ? mh.info.get(from)!.order : 1;
  const idx = Array.from({ length: mh.ns }, (_, i) => i).filter((i) => own === undefined || i < own || i >= own + width);
  const n = idx.length;
  const f = (xs: Float64Array, u: number) => {
    hold.set(from, u);
    const full = Float64Array.from(x);
    idx.forEach((g, i) => { full[g] = xs[i]; });
    const dx = mh.deriv(t, full);
    return { dx: idx.map((g) => dx[g]), y: mh.y.get(to) ?? 0 };
  };
  const xs0 = Float64Array.from(idx.map((g) => x[g])), base = f(xs0, u0);
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0)), C = new Array<number>(n).fill(0);
  for (let j = 0; j < n; j++) {
    const d = 1e-6 * Math.max(1, Math.abs(xs0[j])), up = Float64Array.from(xs0), dn = Float64Array.from(xs0);
    up[j] += d; dn[j] -= d;
    const a = f(up, u0), b = f(dn, u0);
    for (let i = 0; i < n; i++) A[i][j] = (a.dx[i] - b.dx[i]) / (2 * d);
    C[j] = (a.y - b.y) / (2 * d);
  }
  const du = 1e-6 * Math.max(1, Math.abs(u0)), a = f(xs0, u0 + du), b = f(xs0, u0 - du);
  const B = a.dx.map((v, i) => (v - b.dx[i]) / (2 * du)), D = (a.y - b.y) / (2 * du);
  hold.set(from, u0);
  const { num, den } = ssToTf(A, B, C, D);
  return { A, B, C, D, num, den, u0, y0: base.y };
}

/** C (sI − A)⁻¹ B + D as numerator and denominator (highest power first), by Faddeev–LeVerrier. */
export function ssToTf(A: number[][], B: number[], C: number[], D: number): { num: number[]; den: number[] } {
  const n = A.length;
  if (!n) return { num: [D], den: [1] };
  const den = new Array<number>(n + 1).fill(0), num = new Array<number>(n + 1).fill(0);
  den[0] = 1;
  let M: number[][] = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
  for (let k = 1; k <= n; k++) {
    // Coefficient of s^(n−k) in adj(sI − A) is M; C M B goes into the numerator.
    num[k] = C.reduce((s, c, i) => s + c * M[i].reduce((q, v, j) => q + v * B[j], 0), 0);
    const AM = A.map((r) => M[0].map((_, j) => r.reduce((s, v, q) => s + v * M[q][j], 0)));
    const c = -AM.reduce((s, r, i) => s + r[i], 0) / k;
    den[k] = c;
    M = AM.map((r, i) => r.map((v, j) => v + (i === j ? c : 0)));
  }
  return { num: num.map((v, i) => v + D * den[i]), den };
}
