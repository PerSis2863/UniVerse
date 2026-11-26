/// <reference lib="webworker" />
import { elementSize, meshPart, type Mesh } from '@/lib/sim/mesh';
import { partOf, studyOf, type Model } from '@/lib/sim/model';
import { solveStatic, type StaticResult } from '@/lib/sim/structure';
import { harmonicField, modalBasis, solveHarmonic, solveModes, type Basis, type Harmonic, type HarmonicResult, type ModalResult } from '@/lib/sim/modal';
import { solveHeat, type HeatResult } from '@/lib/sim/heat';
import { heatStudyOf, type HeatModel } from '@/lib/sim/heat-model';
import { solveBuckling, type BuckleResult } from '@/lib/sim/buckle';
import { solveTopology, type TopoResult } from '@/lib/sim/topo';
import { extrude, solveSolid, type SolidMesh, type SolidResult } from '@/lib/sim/solid';

// Hyperion Simulate (M404): meshing and solving run here, off the page's thread, so the window stays smooth. The mesh is
// kept while only supports, loads or the material change (no new mesh needed).

export type Analysis = 'static' | 'modal' | 'harmonic' | 'buckling' | 'topology';
/** M463: for 'harmonic', the sweep's settings and the frequency to show the part at (Hz; the strongest peak when absent). */
export type ToSim = { id: number; model: Model; solve: boolean; analysis: Analysis; harmonic?: Harmonic; at?: number; heatFor?: HeatModel } | { id: number; heat: HeatModel; solve: boolean };
export interface HarmonicOut { sweep: HarmonicResult; hz: number; ux: Float64Array; uy: Float64Array; swing: Float64Array; vm: Float64Array }
export interface MeshOut { x: Float64Array; y: Float64Array; tri: Uint32Array; corners: number; segs: Record<string, [number, number, number][]>; minAngle: number }
export interface SolidOut { x: Float64Array; y: Float64Array; z: Float64Array; surface: Uint32Array; tets: number; dofs: number }
export type FromSim = { id: number; mesh: MeshOut | null; result: StaticResult | null; modal: ModalResult | null; harmonic: HarmonicOut | null; heat: HeatResult | null; buckle: BuckleResult | null; topo: TopoResult | null; solid: SolidOut | null; solidResult: SolidResult | null; error?: string; ms: { mesh: number; solve: number }; meshed: boolean };

/** A 3D part's solid (M413): coarser than the flat mesh (each element is far heavier), at most ~21,000 unknowns. */
let keptSolid: { key: string; solid: SolidMesh } | null = null;
function solidOf(model: Model): SolidMesh {
  const key = JSON.stringify([model.template, model.values, model.fineness, model.custom ?? null, model.thickness]);
  if (keptSolid?.key === key) return keptSolid.solid;
  const { part, edges } = partOf(model);
  let h = elementSize(part, model.fineness === 'finest' ? 'fine' : model.fineness, model.values.T ?? Infinity) * 1.6, solid: SolidMesh | null = null;
  for (let tries = 0; tries < 6; tries++) {
    const layers = Math.max(2, Math.min(4, Math.ceil(model.thickness / h)));
    solid = extrude(meshPart(part, edges, h), model.thickness, layers);
    if (solid.x.length * 3 <= 21_000) break;
    h *= 1.25;
  }
  keptSolid = { key, solid: solid! };
  return solid!;
}

let kept: { key: string; mesh: Mesh } | null = null;

/** M544: the Heat bench's temperatures on this same mesh, less the temperature the part was made at. Heat must be set up on
 * the same shape and sizes (its edges' names then match); its own material and thickness give way to this study's. */
function heatWarming(mesh: Mesh, model: Model, heat: HeatModel | undefined): Float64Array {
  const same = heat && heat.template === model.template && JSON.stringify(heat.values) === JSON.stringify(model.values) && JSON.stringify(heat.custom ?? null) === JSON.stringify(model.custom ?? null);
  if (!heat || !same) throw new Error('Heat is set up on a different part: open Heat, give it the same shape and sizes, or use one even temperature change.');
  const T = solveHeat(mesh, heatStudyOf({ ...heat, material: model.material, thickness: model.thickness })).T, made = model.warming?.made ?? 20;
  return T.map((t) => t - made);
}
/** The modes for a harmonic sweep (M463): kept while only the loads or the sweep's settings change. */
let keptBasis: { key: string; basis: Basis } | null = null;

self.onmessage = (e: MessageEvent<ToSim>) => {
  const msg = e.data, { id, solve } = msg, model = 'heat' in msg ? msg.heat : msg.model;
  let buckle: BuckleResult | null = null, topo: TopoResult | null = null;
  let mesh: Mesh | null = null, result: StaticResult | null = null, modal: ModalResult | null = null, harmonic: HarmonicOut | null = null, heat: HeatResult | null = null, error: string | undefined;
  let solid: SolidMesh | null = null, solidResult: SolidResult | null = null;
  const t0 = performance.now();
  let t1 = t0, meshed = false;
  try {
    const { part, edges } = partOf(model);
    const key = JSON.stringify([model.template, model.values, model.fineness, model.custom ?? null]);
    if (kept?.key === key) mesh = kept.mesh;
    else { mesh = meshPart(part, edges, elementSize(part, model.fineness, model.values.T ?? Infinity)); kept = { key, mesh }; meshed = true; }
    t1 = performance.now();
    if ('model' in msg && msg.model.dim === '3d' && msg.analysis === 'static') { solid = solidOf(msg.model); if (solve) solidResult = solveSolid(solid, studyOf(msg.model)); }
    else if (!solve) { /* the mesh only */ } else if ('heat' in msg) heat = solveHeat(mesh, heatStudyOf(msg.heat));
    else if (msg.analysis === 'modal') { const st = studyOf(msg.model); modal = solveModes(mesh, st.material, st.thickness, st.supports, 6); }
    else if (msg.analysis === 'harmonic' && msg.harmonic) {
      const st = studyOf(msg.model), bkey = JSON.stringify([key, msg.model.material, msg.model.thickness, msg.model.supports]);
      if (keptBasis?.key !== bkey) keptBasis = { key: bkey, basis: modalBasis(mesh, st.material, st.thickness, st.supports, 24) };
      const sweep = solveHarmonic(mesh, st, msg.harmonic, keptBasis.basis);
      const strongest = sweep.peaks.reduce<{ f: number; amp: number } | null>((b, p) => (!b || p.amp > b.amp ? p : b), null);
      const hz = msg.at !== undefined && msg.at >= 0 ? msg.at : strongest?.f ?? 0;
      harmonic = { sweep, hz, ...harmonicField(mesh, st, msg.harmonic, keptBasis.basis, hz, sweep.watch) };
    }
    else {
      const st = { ...studyOf(msg.model), ...(msg.model.warming?.kind === 'heat' ? { warming: heatWarming(mesh, msg.model, msg.heatFor) } : {}) };
      if (msg.analysis === 'buckling') buckle = solveBuckling(mesh, st, 4);
      else if (msg.analysis === 'topology') topo = solveTopology(mesh, st, { keep: msg.model.topo?.keep ?? 0.4 });
      else result = solveStatic(mesh, st);
    }
  } catch (err) { error = err instanceof Error ? err.message : String(err); }
  const t2 = performance.now();
  const out: MeshOut | null = mesh ? { x: mesh.x, y: mesh.y, tri: mesh.tri, corners: mesh.corners, segs: Object.fromEntries(mesh.segs), minAngle: mesh.minAngle } : null;
  const solidOut: SolidOut | null = solid ? { x: solid.x, y: solid.y, z: solid.z, surface: solid.surface, tets: solid.tet.length / 10, dofs: solid.x.length * 3 } : null;
  postMessage({ id, mesh: out, result, modal, harmonic, heat, buckle, topo, solid: solidOut, solidResult, error, ms: { mesh: t1 - t0, solve: t2 - t1 }, meshed } satisfies FromSim);
};
