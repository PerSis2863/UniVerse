/// <reference lib="webworker" />
import { chartOf, type Diagram } from '@/lib/sim/blocks';
import { chartInputRanges, diagramRanges } from '@/lib/sim/prove-diagram';
import { prove, type Iv, type ProveResult } from '@/lib/sim/prove';

// Hyperion Simulate → Blocks → Verify → Prove (M573; the diagram's ranges, M574): the proof and the counterexample search, off the page's thread.

/** `fromDiagram`: the inputs' ranges worked out from the rest of the diagram (M574) in place of `ranges`. */
export interface ToProve { id: number; dg: Diagram; chart: string; ranges: Record<string, Iv>; props: string[]; fromDiagram: boolean }
/** `forever` (M575): the diagram's ranges hold after its run too, so the proof does. */
export type FromProve = { id: number; ms: number } & ({ ok: ProveResult; ranges: Record<string, Iv>; widened: boolean; forever: boolean } | { error: string });

self.onmessage = (e: MessageEvent<ToProve>) => {
  const t0 = performance.now(), q = e.data;
  try {
    const block = q.dg.blocks.find((b) => b.id === q.chart);
    if (!block) throw new Error('That chart is no longer in the diagram.');
    const d = q.fromDiagram ? diagramRanges(q.dg) : null, run = d ? chartInputRanges(q.dg, q.chart, d) : q.ranges;
    // The forever ranges when they are as tight as the run's (then the proof holds past the run's end too).
    const ever = d ? chartInputRanges(q.dg, q.chart, d, 'forever') : null;
    const forever = !d || Object.keys(run).every((x) => ever![x][0] === run[x][0] && ever![x][1] === run[x][1]);
    const ok = prove(chartOf(block), { ranges: run, props: q.props, dt: q.dg.dt });
    postMessage({ id: q.id, ms: performance.now() - t0, ok, ranges: run, widened: !!d?.widened, forever } satisfies FromProve);
  }
  catch (err) { postMessage({ id: q.id, ms: performance.now() - t0, error: err instanceof Error ? err.message : String(err) } satisfies FromProve); }
};
