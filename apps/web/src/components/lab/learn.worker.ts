/// <reference lib="webworker" />
import { crossValidate, LEARNERS, regionGrid, type DataSet, type LearnerId } from '@/lib/lab/learn';

// Hyperion Learn (M421): training happens here, off the page's thread, so the window stays smooth. Each model's
// cross-validated result is sent as soon as it is ready; then the chosen model's decision regions. A newer job
// replaces an older one (the page starts a fresh worker), so nothing queues up.

export interface ToLearn { id: number; data: DataSet; models: LearnerId[]; k: number; view: { model: LearnerId; xi: number; yi: number } | null }
export type FromLearn =
  | { id: number; model: LearnerId; accuracy: number; ms: number; pred: number[]; confusion: number[][] }
  | { id: number; model: LearnerId; error: string }
  | { id: number; region: { model: LearnerId; xi: number; yi: number; cls: Uint8Array; sure: Uint8Array; w: number; h: number; xr: [number, number]; yr: [number, number] } }
  | { id: number; done: true };

self.onmessage = (e: MessageEvent<ToLearn>) => {
  const { id, data, models, k, view } = e.data;
  for (const model of models) {
    if (LEARNERS[model].twoOnly && data.classes.length !== 2) { postMessage({ id, model, error: 'Only for two classes' } satisfies FromLearn); continue; }
    const t0 = performance.now();
    try { const r = crossValidate(model, data, k); postMessage({ id, model, accuracy: r.accuracy, ms: performance.now() - t0, pred: r.pred, confusion: r.confusion } satisfies FromLearn); }
    catch (err) { postMessage({ id, model, error: err instanceof Error ? err.message : String(err) } satisfies FromLearn); }
  }
  if (view && !(LEARNERS[view.model].twoOnly && data.classes.length !== 2)) {
    try { const g = regionGrid(view.model, data, view.xi, view.yi); postMessage({ id, region: { model: view.model, xi: view.xi, yi: view.yi, ...g } } satisfies FromLearn, [g.cls.buffer, g.sure.buffer]); }
    catch { /* the regions are a picture: without them the points still show */ }
  }
  postMessage({ id, done: true } satisfies FromLearn);
};
