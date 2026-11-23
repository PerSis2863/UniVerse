/// <reference lib="webworker" />
import { envspectrum } from '@/lib/lab/maint';
import { faultFleet, featuresFor, featureTable, fileFleet, lifeFleet, lifeTest, rank, spectrum, type Fleet, type LifeTest, type Rank } from '@/lib/lab/health';

// Hyperion Learn → Machine health (M443): the fleet is made (or read) and its features computed here, off the page's
// thread; the page asks for one recording's picture or a remaining-life test as the person points at them.

export type Source = { kind: 'life' | 'faults'; seed: number } | { kind: 'files'; files: { name: string; text: string }[]; fs: number; fr: number };
export type ToHealth =
  | { job: number; build: Source }
  | { job: number; view: { rec: number; show: 'signal' | 'spectrum' | 'envelope' } }
  | { job: number; life: { feature: number; test: number } };
export interface FleetInfo { name: string; kind: Fleet['kind']; fs: number; fr: number; classes: string[]; machines: string[]; recs: { machine: number; t: number; label: number; name: string; n: number }[] }
export type FromHealth =
  | { job: number; built: { fleet: FleetInfo; ids: string[]; table: number[][]; ranks: Rank[] } }
  | { job: number; viewed: { x: number[]; y: number[]; xLabel: string } }
  | { job: number; tested: LifeTest }
  | { job: number; error: string };

let fleet: Fleet | null = null, table: number[][] = [];

/** At most ~1,500 points for a picture: each slice's highest and lowest (so peaks stay). */
function thin(x: ArrayLike<number>, y: ArrayLike<number>) {
  if (y.length <= 1500) return { x: Array.from(x), y: Array.from(y) };
  const step = Math.ceil(y.length / 750), ox: number[] = [], oy: number[] = [];
  for (let s = 0; s < y.length; s += step) {
    let lo = s, hi = s;
    for (let k = s; k < Math.min(y.length, s + step); k++) { if (y[k] < y[lo]) lo = k; if (y[k] > y[hi]) hi = k; }
    for (const k of lo < hi ? [lo, hi] : [hi, lo]) { ox.push(x[k]); oy.push(y[k]); }
  }
  return { x: ox, y: oy };
}

self.onmessage = (e: MessageEvent<ToHealth>) => {
  const m = e.data, post = (msg: FromHealth) => postMessage(msg);
  try {
    if ('build' in m) {
      const b = m.build;
      fleet = b.kind === 'files' ? fileFleet(b.files, b.fs, b.fr) : b.kind === 'life' ? lifeFleet(b.seed) : faultFleet(b.seed);
      const ids = featuresFor(fleet).map((f) => f.id);
      table = featureTable(fleet, ids);
      const f = fleet;
      post({ job: m.job, built: { fleet: { name: f.name, kind: f.kind, fs: f.fs, fr: f.fr, classes: f.classes, machines: f.machines, recs: f.recs.map((r) => ({ machine: r.machine, t: r.t, label: r.label, name: r.name, n: r.x.length })) }, ids, table, ranks: rank(f, table, ids) } });
    } else if ('view' in m) {
      const r = fleet?.recs[m.view.rec];
      if (!fleet || !r) throw new Error('No recording there.');
      if (m.view.show === 'signal') post({ job: m.job, viewed: { ...thin(Float64Array.from(r.x, (_, k) => k / fleet!.fs), r.x), xLabel: 'Time (s)' } });
      else if (m.view.show === 'spectrum') { const s = spectrum(r.x, fleet.fs); post({ job: m.job, viewed: { ...thin(s.f, s.a), xLabel: 'Frequency (Hz)' } }); }
      else { const s = envspectrum([...r.x], fleet.fs), keep = s.f.findIndex((f) => f > 500); post({ job: m.job, viewed: { ...thin(s.f.slice(0, keep > 0 ? keep : undefined), s.p.slice(0, keep > 0 ? keep : undefined)), xLabel: 'Frequency (Hz), the envelope’s' } }); }
    } else {
      if (!fleet) throw new Error('Make the data first.');
      post({ job: m.job, tested: lifeTest(fleet, table, m.life.feature, m.life.test) });
    }
  } catch (err) { post({ job: m.job, error: err instanceof Error ? err.message : String(err) }); }
};
