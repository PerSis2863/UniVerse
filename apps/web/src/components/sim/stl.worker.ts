/// <reference lib="webworker" />
import { stlSolid } from '@/lib/sim/stl';
import { solveSolid, type SolidMesh, type SolidResult } from '@/lib/sim/solid';
import type { Study } from '@/lib/sim/structure';
import type { SolidOut } from './sim.worker';

// Hyperion Simulate → 3D file (M552): the part filled with cubes and solved off the page's thread. The solid is kept
// while only the supports, loads or material change.
export type ToStl = { id: number; tris: Float32Array; key: string; study: Study };
export type FromStl = { id: number; solid: SolidOut | null; result: SolidResult | null; cube: number; size: number[]; error?: string; ms: number };

let kept: { key: string; solid: SolidMesh & { cube: number; size: number[] } } | null = null;
self.onmessage = (e: MessageEvent<ToStl>) => {
  const { id, tris, key, study } = e.data, t0 = performance.now();
  try {
    if (kept?.key !== key) kept = { key, solid: stlSolid(tris) };
    const s = kept.solid, out: SolidOut = { x: s.x, y: s.y, z: s.z, surface: s.surface, tets: s.tet.length / 10, dofs: s.x.length * 3 };
    const result = study.supports.some((x) => x.edges.length) ? solveSolid(s, study) : null;
    postMessage({ id, solid: out, result, cube: s.cube, size: s.size, ms: performance.now() - t0 } satisfies FromStl);
  } catch (err) {
    postMessage({ id, solid: null, result: null, cube: 0, size: [], error: err instanceof Error ? err.message : String(err), ms: performance.now() - t0 } satisfies FromStl);
  }
};
