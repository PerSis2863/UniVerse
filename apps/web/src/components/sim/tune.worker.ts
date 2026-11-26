/// <reference lib="webworker" />
// The engine first: its modules import each other, and the interpreter is where that loop starts cleanly.
import '@/lib/lab/interp';
import { autoTime, bodeOf, minreal, stepOf, type Tf } from '@/lib/lab/control';
import { autoWc, pidReport, tunePid, type Gains, type PidType } from '@/lib/lab/pidtune';
import { linearize } from '@/lib/sim/linearize';
import { pade } from '@/lib/lab/pade';

const conv = (a: number[], b: number[]) => { const o = new Array<number>(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { o[i + j] += x * y; })); return o; };
import type { Diagram } from '@/lib/sim/blocks';

// Hyperion Simulate → Blocks → Tune (M562): the PID tuner's work, off the page's thread so the sliders stay smooth.
// The plant is a typed transfer function or the diagram linearised as a PID block sees it (its output to its input,
// with the minus the error carries taken off).

export type Plant = { tf: Tf; delay: number } | { diagram: Diagram; pid: string; at: number };
export interface ToTune { id: number; plant: Plant; type: PidType; speed: number; pm: number; N: number; baseline: Gains }
export interface Report { stable: boolean; rise: number; settle: number; overshoot: number; peak: number; Gm: number; Wcg: number; Pm: number; Wcp: number }
export interface FromTune {
  id: number; error?: string; plant?: Tf; tuned?: Gains; wc?: number; wc0?: number;
  t?: number[]; curves?: Record<'track' | 'disturb' | 'effort', { tuned: number[]; base: number[] }>;
  w?: number[]; bode?: { tuned: { mag: number[]; phase: number[] }; base: { mag: number[]; phase: number[] } };
  tunedRep?: Report; baseRep?: Report;
}

const report = (r: ReturnType<typeof pidReport>): Report => ({ stable: r.stable, rise: r.info?.RiseTime ?? NaN, settle: r.info?.SettlingTime ?? NaN, overshoot: r.info?.Overshoot ?? NaN, peak: r.info?.Peak ?? NaN, Gm: r.Gm, Wcg: r.Wcg, Pm: r.Pm, Wcp: r.Wcp });

function plantOf(p: Plant): Tf {
  if ('tf' in p) { const q = pade(p.delay, 4); return p.delay > 0 ? { n: conv(p.tf.n, q.n), d: conv(p.tf.d, q.d) } : p.tf; }
  const into = p.diagram.wires.find((w) => w.to === p.pid && w.in === 0);
  if (!into) throw new Error('Wire something into the PID block first: the error it acts on.');
  const l = linearize(p.diagram, p.pid, into.from, p.at);
  // The error falls as the controller pushes harder, so the plant the controller drives is minus what comes back.
  const g = minreal({ n: l.num.map((v) => -v), d: l.den }, 1e-5);
  if (g.n.every((v) => Math.abs(v) < 1e-12)) throw new Error('At this moment the PID’s push doesn’t reach what it measures (a saturation at its limit, or nothing wired between). Try another time.');
  return g;
}

self.onmessage = (e: MessageEvent<ToTune>) => {
  const q = e.data;
  try {
    const G = plantOf(q.plant), wc0 = autoWc(G, q.type, q.pm, q.N), want = wc0 * 10 ** q.speed;
    const { gains, wc } = tunePid(G, q.type, { wc: want, pm: q.pm, N: q.N });
    const tr = pidReport(G, gains), br = pidReport(G, q.baseline);
    const span = Math.min(autoTime(tr.track), Number.isFinite(tr.info?.SettlingTime) && tr.info!.SettlingTime > 0 ? tr.info!.SettlingTime * 3 : Infinity);
    const T = Number.isFinite(span) && span > 0 ? span : 10, curves = {} as NonNullable<FromTune['curves']>;
    let t: number[] = [];
    for (const k of ['track', 'disturb', 'effort'] as const) {
      const a = stepOf(tr[k], T, 600), b = br.stable ? stepOf(br[k], T, 600).y : (() => { try { return stepOf(br[k], T, 600).y.map((v) => (Math.abs(v) > 1e6 ? NaN : v)); } catch { return []; } })();
      t = a.t; curves[k] = { tuned: a.y, base: b };
    }
    const lo = Math.log10(Math.min(wc, br.Wcp || wc)) - 2, hi = Math.log10(Math.max(wc, br.Wcp || wc)) + 2;
    const w = Array.from({ length: 300 }, (_, i) => 10 ** (lo + ((hi - lo) * i) / 299));
    postMessage({ id: q.id, plant: G, tuned: gains, wc, wc0, t, curves, w, bode: { tuned: bodeOf(tr.loop, w), base: bodeOf(br.loop, w) }, tunedRep: report(tr), baseRep: report(br) } satisfies FromTune);
  } catch (err) {
    postMessage({ id: q.id, error: err instanceof Error ? err.message : String(err) } satisfies FromTune);
  }
};
