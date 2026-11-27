/// <reference lib="webworker" />
import { chartOf, type Block } from '@/lib/sim/blocks';
import { prove, type Iv, type ProveResult } from '@/lib/sim/prove';

// Hyperion Simulate → Blocks → Verify → Prove (M573): the proof and the counterexample search, off the page's thread.

export interface ToProve { id: number; block: Block; ranges: Record<string, Iv>; props: string[]; dt: number }
export type FromProve = { id: number; ms: number } & ({ ok: ProveResult } | { error: string });

self.onmessage = (e: MessageEvent<ToProve>) => {
  const t0 = performance.now(), q = e.data;
  try { postMessage({ id: q.id, ms: performance.now() - t0, ok: prove(chartOf(q.block), { ranges: q.ranges, props: q.props, dt: q.dt }) } satisfies FromProve); }
  catch (err) { postMessage({ id: q.id, ms: performance.now() - t0, error: err instanceof Error ? err.message : String(err) } satisfies FromProve); }
};
