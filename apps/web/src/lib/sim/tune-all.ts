import { minreal, rootsOf, type Tf } from '../lab/control';
import { pidReport, tunePid, type Gains, type PidType } from '../lab/pidtune';
import { compile, n, type Diagram } from './blocks';
import { linearize, ssToTf } from './linearize';

// Hyperion Simulate → Blocks → Tune → "Tune all loops together" (M568, M562's left-out: tuning several inputs at once).
// A diagram with several PID blocks is a plant with several inputs and outputs whose loops pull on each other. Each
// loop is tuned as it sees the plant with every other loop closed at its current gains (sequential loop closing), the
// fastest loop first, and the round repeated until no gain moves by more than 1 % (or twenty rounds). Each loop's
// crossover is chosen once, from what it sees with the others open, and kept: the closed loops' own fast poles would otherwise let the
// next round choose a faster one, and so on without end. Then each loop's
// margins are measured with all the others closed, and the whole closed loop is checked stable from its own states.

export interface LoopResult { id: string; gains: Gains; wc: number; Pm: number; Gm: number; plant: Tf }
/** `settled`: the last round moved no gain by 1 % or more. */
export interface AllResult { loops: LoopResult[]; rounds: number; settled: boolean; stable: boolean; slowestPole: number }

const pidGains = (p: Record<string, number | string>): Gains => { const Kd = n(p.Kd); return { Kp: n(p.Kp, 1), Ki: n(p.Ki), Kd, Tf: Kd ? 1 / n(p.N, 100) : 0 }; };
const withGains = (dg: Diagram, id: string, g: Gains): Diagram => ({ ...dg, blocks: dg.blocks.map((b) => (b.id === id ? { ...b, p: { ...b.p, Kp: g.Kp, Ki: g.Ki, Kd: g.Kd, N: g.Tf ? 1 / g.Tf : 100 } } : b)) });

/** The plant one PID block sees with the rest of the diagram as it is (its push to the error it acts on, sign taken off). */
export function plantSeenBy(dg: Diagram, pid: string, at = 0): Tf {
  const into = dg.wires.find((w) => w.to === pid && w.in === 0);
  if (!into) throw new Error('Every PID block needs something wired into it: the error it acts on.');
  const l = linearize(dg, pid, into.from, at);
  return minreal({ n: l.num.map((v) => -v), d: l.den }, 1e-5);
}

/** Whether the whole diagram's own states die away (around where it is at time `at`), and how slowly. */
export function closedLoopStable(dg: Diagram, at = 0) {
  const m = compile(dg, undefined, undefined, true), x = Float64Array.from(m.x0), h = Math.max(1e-6, dg.dt);
  for (let k = 0; k < Math.round(at / h); k++) m.step(k * h, x, h);
  const t = Math.round(at / h) * h, A = Array.from({ length: m.ns }, () => new Array<number>(m.ns).fill(0));
  for (let j = 0; j < m.ns; j++) {
    const d = 1e-6 * Math.max(1, Math.abs(x[j])), xp = Float64Array.from(x), xm = Float64Array.from(x);
    xp[j] += d; xm[j] -= d;
    const a = m.deriv(t, xp), b = m.deriv(t, xm);
    for (let i = 0; i < m.ns; i++) A[i][j] = (a[i] - b[i]) / (2 * d);
  }
  const poles = rootsOf(ssToTf(A, A.map(() => 0), A.map(() => 0), 0).den);
  const slowest = poles.length ? Math.max(...poles.map((p) => p.re)) : -Infinity;
  return { stable: slowest < -1e-9, slowestPole: slowest };
}

export function tuneAll(dg: Diagram, opts: { type?: PidType; pm?: number; N?: number; at?: number } = {}): AllResult {
  const pids = dg.blocks.filter((b) => b.kind === 'pid');
  if (pids.length < 2) throw new Error('Tuning loops together needs two or more PID blocks.');
  const type = opts.type ?? 'PIDF', pm = opts.pm ?? 60, at = opts.at ?? 0;
  let d = dg, rounds = 0, settled = false;
  const order = pids.map((b) => b.id);
  const wc = new Map<string, number>();
  // Each loop's crossover from the plant it sees with every other loop open (their gains 0).
  const open = { ...dg, blocks: dg.blocks.map((b) => (b.kind === 'pid' ? { ...b, p: { ...b.p, Kp: 0, Ki: 0, Kd: 0 } } : b)) };
  for (const id of order) wc.set(id, tunePid(plantSeenBy(open, id, at), type, { pm, N: opts.N }).wc);
  order.sort((a, b) => (wc.get(b) ?? 0) - (wc.get(a) ?? 0));
  /** Tuned at the loop's crossover, or as near below it as the coupling allows (the lower one is kept). Coupled loops
   * can cross 0 dB more than once; a design whose worst crossing hasn't the margin asked for goes lower too. */
  const tuneNear = (G: Tf, id: string) => {
    let w = wc.get(id)!, err: unknown, best: { r: ReturnType<typeof tunePid>; pm: number; w: number } | null = null;
    for (let k = 0; k < 14; k++, w *= 0.7) {
      try {
        const r = tunePid(G, type, { pm, N: opts.N, wc: w }), rep = pidReport(G, r.gains), got = rep.stable ? rep.Pm : -Infinity;
        if (got >= pm - 3) { wc.set(id, w); return r; }
        if (!best || got > best.pm) best = { r, pm: got, w };
      } catch (e) { err = e; }
    }
    if (best) { wc.set(id, best.w); return best.r; }
    throw err;
  };
  for (; rounds < 20; rounds++) {
    let moved = 0;
    for (const id of order) {
      const G = plantSeenBy(d, id, at), r = tuneNear(G, id), old = pidGains(d.blocks.find((b) => b.id === id)!.p);
      for (const k of ['Kp', 'Ki', 'Kd'] as const) moved = Math.max(moved, Math.abs(r.gains[k] - old[k]) / Math.max(1e-9, Math.abs(r.gains[k]), Math.abs(old[k])));
      // From the second round on, half way to the new gains: strongly coupled loops otherwise chase each other.
      const k = rounds ? 0.5 : 1, next = { Kp: old.Kp + k * (r.gains.Kp - old.Kp), Ki: old.Ki + k * (r.gains.Ki - old.Ki), Kd: old.Kd + k * (r.gains.Kd - old.Kd), Tf: r.gains.Tf };
      d = withGains(d, id, next);
    }
    if (moved < 0.01) { rounds++; settled = true; break; }
  }
  const loops = pids.map((b) => {
    const g = pidGains(d.blocks.find((x) => x.id === b.id)!.p), G = plantSeenBy(d, b.id, at), rep = pidReport(G, g);
    return { id: b.id, gains: g, wc: wc.get(b.id) ?? NaN, Pm: rep.Pm, Gm: rep.Gm, plant: G };
  });
  return { loops, rounds, settled, ...closedLoopStable(d, at) };
}
