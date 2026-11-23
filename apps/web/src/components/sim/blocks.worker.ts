/// <reference lib="webworker" />
import { simulate, type Diagram } from '@/lib/sim/blocks';

// Hyperion Simulate → Blocks (M415): a diagram runs here, off the page's thread, so dragging blocks stays smooth.

export interface ToBlocks { id: number; diagram: Diagram }
export interface FromBlocks { id: number; t: number[]; scopes: Record<string, number[][]>; error?: string; capped?: boolean; ms: number }

self.onmessage = (e: MessageEvent<ToBlocks>) => {
  const { id, diagram } = e.data, t0 = performance.now();
  let out: Omit<FromBlocks, 'id' | 'ms'>;
  try { const r = simulate(diagram); out = { t: r.t, scopes: Object.fromEntries(r.scopes), error: r.error, capped: r.capped }; }
  catch (err) { out = { t: [], scopes: {}, error: err instanceof Error ? err.message : String(err) }; }
  postMessage({ id, ...out, ms: performance.now() - t0 } satisfies FromBlocks);
};
