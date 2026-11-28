/// <reference lib="webworker" />
import { verifyAll, type Verified } from '@/lib/sim/verify';
import type { Diagram } from '@/lib/sim/blocks';

// Hyperion Simulate → Blocks → Verify (M566): requirements, generated tests, coverage and model checks run here (tens
// of runs of the model), off the page's thread.

export interface ToVerify { id: number; diagram: Diagram; budget: number }
export type FromVerify = { id: number; ms: number } & ({ ok: Verified } | { error: string });

self.onmessage = (e: MessageEvent<ToVerify>) => {
  const t0 = performance.now();
  try { const ok = verifyAll(e.data.diagram, e.data.budget); postMessage({ id: e.data.id, ms: performance.now() - t0, ok } satisfies FromVerify); }
  catch (err) { postMessage({ id: e.data.id, ms: performance.now() - t0, error: err instanceof Error ? err.message : String(err) } satisfies FromVerify); }
};
