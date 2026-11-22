/// <reference lib="webworker" />
import { elementSize, meshPart, type Mesh } from '@/lib/sim/mesh';
import { partOf, studyOf, type Model } from '@/lib/sim/model';
import { solveStatic, type StaticResult } from '@/lib/sim/structure';
import { solveModes, type ModalResult } from '@/lib/sim/modal';

// Hyperion Simulate (M404): meshing and solving run here, off the page's thread, so the window stays smooth. The mesh is
// kept while only supports, loads or the material change (no new mesh needed).

export type ToSim = { id: number; model: Model; solve: boolean; analysis: 'static' | 'modal' };
export interface MeshOut { x: Float64Array; y: Float64Array; tri: Uint32Array; corners: number; segs: Record<string, [number, number, number][]>; minAngle: number }
export type FromSim = { id: number; mesh: MeshOut | null; result: StaticResult | null; modal: ModalResult | null; error?: string; ms: { mesh: number; solve: number }; meshed: boolean };

let kept: { key: string; mesh: Mesh } | null = null;

self.onmessage = (e: MessageEvent<ToSim>) => {
  const { id, model, solve, analysis } = e.data;
  let mesh: Mesh | null = null, result: StaticResult | null = null, modal: ModalResult | null = null, error: string | undefined;
  const t0 = performance.now();
  let t1 = t0, meshed = false;
  try {
    const { part, edges } = partOf(model);
    const key = JSON.stringify([model.template, model.values, model.fineness]);
    if (kept?.key === key) mesh = kept.mesh;
    else { mesh = meshPart(part, edges, elementSize(part, model.fineness, model.values.T ?? Infinity)); kept = { key, mesh }; meshed = true; }
    t1 = performance.now();
    if (solve && analysis === 'modal') { const st = studyOf(model); modal = solveModes(mesh, st.material, st.thickness, st.supports, 6); }
    else if (solve) result = solveStatic(mesh, studyOf(model));
  } catch (err) { error = err instanceof Error ? err.message : String(err); }
  const t2 = performance.now();
  const out: MeshOut | null = mesh ? { x: mesh.x, y: mesh.y, tri: mesh.tri, corners: mesh.corners, segs: Object.fromEntries(mesh.segs), minAngle: mesh.minAngle } : null;
  postMessage({ id, mesh: out, result, modal, error, ms: { mesh: t1 - t0, solve: t2 - t1 }, meshed } satisfies FromSim);
};
