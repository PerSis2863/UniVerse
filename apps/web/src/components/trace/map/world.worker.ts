/// <reference lib="webworker" />
// The country outlines projected on a background thread (M86): the page asks for one map file
// (/geo/world-110m.json or the sharper 50m) and gets back plain numbers to replay into Path2D
// (engine.ts loadWorld), so opening or zooming a map never freezes the page.
import type { Topology } from 'topojson-specification';
import { projectWorld } from './world-shapes';

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<{ url: string }>) => {
  try {
    const res = await fetch(e.data.url);
    if (!res.ok) throw new Error(`map file: ${res.status}`);
    const w = projectWorld((await res.json()) as Topology);
    scope.postMessage(w, [w.boxes.buffer, w.labels.buffer, w.areas.buffer, w.steps.buffer, w.points.buffer, w.ends.buffer]);
  } catch (err) {
    scope.postMessage({ error: String(err) });
  }
};
