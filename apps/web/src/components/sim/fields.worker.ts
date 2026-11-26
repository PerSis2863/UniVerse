/// <reference lib="webworker" />
import { contours, solveFields, type FieldModel, type FieldResult } from '@/lib/sim/fields';

// Hyperion Simulate → Fields (M548): the solve and the field lines off the page's thread.
export type ToFields = { id: number; model: FieldModel };
export type FromFields = { id: number; result: FieldResult | null; lines: [number, number, number, number][]; error?: string; ms: number };

self.onmessage = (e: MessageEvent<ToFields>) => {
  const { id, model } = e.data, t0 = performance.now();
  try {
    const result = solveFields(model);
    postMessage({ id, result, lines: contours(result, 28), ms: performance.now() - t0 } satisfies FromFields);
  } catch (err) {
    postMessage({ id, result: null, lines: [], error: err instanceof Error ? err.message : String(err), ms: performance.now() - t0 } satisfies FromFields);
  }
};
