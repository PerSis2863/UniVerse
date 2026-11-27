/// <reference lib="webworker" />
import { chartOf, type Diagram } from '@/lib/sim/blocks';
import { chartInputRanges, diagramRanges } from '@/lib/sim/prove-diagram';
import { prove, type Iv, type ProveResult } from '@/lib/sim/prove';

// Hyperion Simulate → Blocks → Verify → Prove (M573; the diagram's ranges, M574): the proof and the counterexample search, off the page's thread.

/** `fromDiagram`: the inputs' ranges worked out from the rest of the diagram (M574) in place of `ranges`. */
export interface ToProve { id: number; dg: Diagram; chart: string; ranges: Record<string, Iv>; props: string[]; fromDiagram: boolean }
export type FromProve = { id: number; ms: number } & ({ ok: ProveResult; ranges: Record<string, Iv>; widened: boolean } | { error: string });

self.onmessage = (e: MessageEvent<ToProve>) => {
  const t0 = performance.now(), q = e.data;
  try {
    const block = q.dg.blocks.find((b) => b.id === q.chart);
    if (!block) throw new Error('That chart is no longer in the diagram.');
    const d = q.fromDiagram ? diagramRanges(q.dg) : null, ranges = d ? chartInputRanges(q.dg, q.chart, d) : q.ranges;
    const ok = prove(chartOf(block), { ranges, props: q.props, dt: q.dg.dt });
    postMessage({ id: q.id, ms: performance.now() - t0, ok, ranges, widened: !!d?.widened } satisfies FromProve);
  }
  catch (err) { postMessage({ id: q.id, ms: performance.now() - t0, error: err instanceof Error ? err.message : String(err) } satisfies FromProve); }
};
