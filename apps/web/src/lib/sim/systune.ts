import type { Tf } from '../lab/control';
import { nelderMead } from '../lab/optim';
import { freq, pidTf, type Gains, type PidType } from '../lab/pidtune';
import type { Diagram } from './blocks';
import { linearize } from './linearize';
import { closedLoopStable, tuneAll } from './tune-all';

// Hyperion Simulate → Blocks → Tune → "Tune all at once" (M572, M568's left-out: "MATLAB's more advanced all-at-once
// tuning method", systune). Every PID gain in the diagram is chosen together by optimisation, against goals on the
// whole closed loop at once, as structured H∞ synthesis does:
//
//   • tracking (soft, made as small as it can be): each loop's sensitivity S_ii (with every other loop closed) under
//     the weight W_i(s) = (s/2 + ω_i)/(s + 0.001·ω_i), so |S_ii| < 0.001 at low frequency (0.1 % error left), crossing 1
//     near ω_i and peaking under 2; the goal is max_i ‖W_i S_ii‖∞ ≤ 1;
//   • margins (hard, must hold): each loop's disk margin α_i = 1/‖S_ii − ½‖∞ at least 2·tan(PM/2), the disk that gives
//     the phase margin asked for (and the gain margin with it) against gain and phase changes at once;
//   • roll-off (hard): each loop's complementary sensitivity T_ii = 1 − S_ii under 2, and falling at least as 10·ω_i/ω
//     past ten times its bandwidth (‖W_T T_ii‖∞ ≤ 1, W_T(s) = (s + 5ω_i)/(10ω_i)): without it the gains would grow
//     without end (more gain always tracks better on paper) and amplify noise;
//   • stability: the whole closed loop's own poles (from its states, `closedLoopStable`) in the left half plane.
//
// The plant is linearised once with every loop open: G_ij from PID j's output to the error PID i acts on (M568's
// `plantSeenBy` for every pair). Then S = (I + G·C)⁻¹ on a grid of frequencies, C = diag(C_i). The gains move in
// log-space (signs kept; a PIDF's filter time too, as systune tunes it) by Nelder–Mead from M568's sequential design and from a few spread starts (systune's random
// starts), minimising soft + 100 · how far the hard goal is missed; the best stable result wins.

export interface SysLoop { id: string; gains: Gains; peak: number; disk: number; Pm: number; Gm: number }
export interface SysResult { loops: SysLoop[]; soft: number; hard: number; stable: boolean; startSoft: number; startHard: number; evals: number; starts: number; met: boolean }

type C = [number, number];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => { const q = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / q, (a[1] * b[0] - a[0] * b[1]) / q]; };
const abs = (a: C) => Math.hypot(a[0], a[1]);

/** The diagonal of (I + L)⁻¹ for a small complex matrix (Gauss–Jordan with partial pivoting). */
function sensDiag(L: C[][]): C[] {
  const m = L.length, A = L.map((row, i) => [...row.map((v, j): C => (i === j ? [v[0] + 1, v[1]] : [v[0], v[1]])), ...row.map((_, j): C => (i === j ? [1, 0] : [0, 0]))]);
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (abs(A[r][c]) > abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const piv = A[c][c];
    for (let j = 0; j < 2 * m; j++) A[c][j] = div(A[c][j], piv);
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = A[r][c];
      for (let j = 0; j < 2 * m; j++) { const x = mul(f, A[c][j]); A[r][j] = [A[r][j][0] - x[0], A[r][j][1] - x[1]]; }
    }
  }
  return A.map((row, i) => row[m + i]);
}

const keysOf = (type: PidType): (keyof Gains)[] => ({ P: ['Kp'], I: ['Ki'], PI: ['Kp', 'Ki'], PD: ['Kp', 'Kd'], PID: ['Kp', 'Ki', 'Kd'], PIDF: ['Kp', 'Ki', 'Kd', 'Tf'] } as Record<PidType, (keyof Gains)[]>)[type];

/** The goals for these gains: the tracking peak and disk margin per loop. */
export function goals(G: Tf[][], gains: Gains[], wb: number[], pm: number, grid: number[]) {
  const m = gains.length, Cs = gains.map(pidTf), alpha = 2 * Math.tan((pm * Math.PI) / 360);
  const peak = new Array<number>(m).fill(0), worst = new Array<number>(m).fill(0), roll = new Array<number>(m).fill(0);
  for (const w of grid) {
    const c = Cs.map((t) => freq(t, w)), L = G.map((row) => row.map((g, j) => mul(freq(g, w), c[j]))), s = sensDiag(L);
    s.forEach((v, i) => {
      if (!Number.isFinite(v[0]) || !Number.isFinite(v[1])) { peak[i] = worst[i] = roll[i] = Infinity; return; }
      const W = div([wb[i], w / 2], [wb[i] * 1e-3, w]);
      peak[i] = Math.max(peak[i], abs(mul(W, v)));
      worst[i] = Math.max(worst[i], abs([v[0] - 0.5, v[1]]));
      roll[i] = Math.max(roll[i], abs(mul([0.5, w / (10 * wb[i])], [1 - v[0], -v[1]])));
    });
  }
  const disk = worst.map((x) => 1 / x);
  return { peak, disk, roll, soft: Math.max(...peak), hard: Math.max(...disk.map((d) => alpha / d), ...roll) };
}

/** Disk margin α as the phase margin and gain margin (dB) it guarantees (balanced disk). */
const diskPm = (a: number) => (2 * Math.atan(a / 2) * 180) / Math.PI;
const diskGm = (a: number) => (a >= 2 ? Infinity : 20 * Math.log10((2 + a) / (2 - a)));

export function systune(dg: Diagram, opts: { type?: PidType; pm?: number; N?: number; at?: number; starts?: number; seed?: number } = {}): SysResult {
  const type = opts.type ?? 'PIDF', pm = opts.pm ?? 60, at = opts.at ?? 0, N = opts.N ?? 10;
  // M568's sequential design: the first start, and each loop's crossover as its tracking bandwidth.
  const seq = tuneAll(dg, { type, pm, N: opts.N, at }), ids = seq.loops.map((l) => l.id);
  const open: Diagram = { ...dg, blocks: dg.blocks.map((b) => (b.kind === 'pid' ? { ...b, p: { ...b.p, Kp: 0, Ki: 0, Kd: 0 } } : b)) };
  const src = ids.map((id) => { const w = dg.wires.find((x) => x.to === id && x.in === 0); if (!w) throw new Error('Every PID block needs something wired into it: the error it acts on.'); return w.from; });
  const G: Tf[][] = ids.map((_, i) => ids.map((pj) => { const l = linearize(open, pj, src[i], at); return { n: l.num.map((v) => -v), d: l.den }; }));
  const wb = seq.loops.map((l) => (Number.isFinite(l.wc) && l.wc > 0 ? l.wc : 1));
  const lo = Math.min(...wb) / 1000, hi = Math.max(...wb) * 1000;
  const grid = Array.from({ length: 140 }, (_, k) => lo * (hi / lo) ** (k / 139));
  const keys = keysOf(type);
  const sign = seq.loops.map((l) => keys.map((k) => (l.gains[k] < 0 ? -1 : 1)));
  const toGains = (x: number[]): Gains[] => ids.map((_, i) => {
    const g: Gains = { Kp: 0, Ki: 0, Kd: 0, Tf: 0 };
    keys.forEach((k, j) => { g[k] = sign[i][j] * Math.exp(x[i * keys.length + j]); });
    return g;
  });
  const withAll = (gs: Gains[]): Diagram => ({ ...dg, blocks: dg.blocks.map((b) => { const i = ids.indexOf(b.id); return i < 0 ? b : { ...b, p: { ...b.p, Kp: gs[i].Kp, Ki: gs[i].Ki, Kd: gs[i].Kd, N: gs[i].Tf ? 1 / gs[i].Tf : b.p.N } }; }) });
  const x0 = seq.loops.flatMap((l) => keys.map((k) => Math.log(Math.max(1e-6, Math.abs(k === 'Tf' && !l.gains.Tf ? Math.abs(l.gains.Kd / (l.gains.Kp || 1) / N) : l.gains[k]) || 1e-3))));
  let evals = 0;
  const score = (x: number[]) => {
    evals++;
    if (x.some((v, i) => !Number.isFinite(v) || Math.abs(v - x0[i]) > 9)) return 1e9;
    const g = goals(G, toGains(x), wb, pm, grid);
    const f = g.soft + 100 * Math.max(0, g.hard - 1);
    if (!Number.isFinite(f)) return 1e9;
    return f;
  };
  // Stability is checked on the diagram itself for the candidates kept (it needs a fresh model each time).
  const stable = (x: number[]) => { try { return closedLoopStable(withAll(toGains(x)), at).stable; } catch { return false; } };
  let rand = (opts.seed ?? 1) >>> 0;
  const rnd = () => { rand = (rand * 1664525 + 1013904223) >>> 0; return rand / 2 ** 32; };
  const starts = [x0, ...Array.from({ length: Math.max(0, (opts.starts ?? 4) - 1) }, () => x0.map((v) => v + (rnd() - 0.5) * 3))];
  let best: { x: number[]; f: number } | null = null;
  for (const s of starts) {
    let x = s;
    // Restarted twice from where it stopped: Nelder–Mead's simplex collapses on nonsmooth (max) goals.
    for (let r = 0; r < 3; r++) x = nelderMead(score, x, { maxEvals: 400 * x.length, tolX: 1e-5, tolFun: 1e-6 }).x;
    const f = score(x);
    if ((!best || f < best.f) && stable(x)) best = { x, f };
  }
  const start = goals(G, seq.loops.map((l) => l.gains), wb, pm, grid);
  const xs = best?.x ?? x0, gs = best ? toGains(xs) : seq.loops.map((l) => l.gains), fin = goals(G, gs, wb, pm, grid);
  return {
    loops: ids.map((id, i) => ({ id, gains: gs[i], peak: fin.peak[i], disk: fin.disk[i], Pm: diskPm(fin.disk[i]), Gm: diskGm(fin.disk[i]) })),
    soft: fin.soft, hard: fin.hard, stable: best ? true : seq.stable, startSoft: start.soft, startHard: start.hard, evals, starts: starts.length, met: fin.hard <= 1 + 1e-6 && fin.soft <= 1,
  };
}
