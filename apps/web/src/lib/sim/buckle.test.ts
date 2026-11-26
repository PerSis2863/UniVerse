import { describe, expect, it } from 'vitest';
import { elementSize, meshPart } from './mesh';
import { edgesOf, TEMPLATES } from './part';
import { MATERIALS, type Study } from './structure';
import { solveBuckling } from './buckle';

const steel = MATERIALS[0];
const beam = (L: number, H: number, size?: number) => {
  const tpl = TEMPLATES.find((t) => t.id === 'beam')!, { part, names } = tpl.make({ L, H }), edges = edgesOf(part, names);
  const byName = (n: string) => edges.filter((e) => e.label === n).map((e) => e.id);
  return { byName, mesh: meshPart(part, edges, size ?? elementSize(part, 'fine')) };
};

describe('Hyperion Simulate: buckling (M545)', () => {
  it('a slender column fixed at the foot and pushed at the top buckles at Euler’s load π²EI/(4L²)', () => {
    const L = 300, H = 10, t = 10, { mesh, byName } = beam(L, H, 2.5);
    const study: Study = { thickness: t, material: steel, gravity: false,
      supports: [{ id: 'f', kind: 'fixed', edges: byName('Left end') }],
      loads: [{ id: 'p', kind: 'force', edges: byName('Right end'), F: 1000, angle: 180 }] };
    const r = solveBuckling(mesh, study, 2), I = (t * H ** 3) / 12, euler = (Math.PI ** 2 * steel.E * I) / (4 * L ** 2);
    expect(r.none).toBe(false);
    expect(r.modes[0].factor * 1000 / euler).toBeGreaterThan(0.97);
    expect(r.modes[0].factor * 1000 / euler).toBeLessThan(1.03);
    // The second mode of a cantilever column: nine times the first.
    expect(r.modes[1].factor / r.modes[0].factor).toBeGreaterThan(8);
    expect(r.modes[1].factor / r.modes[0].factor).toBeLessThan(9.5);
    expect(Math.max(...r.modes[0].u)).toBeCloseTo(1, 9);
  });
  it('a column pulled instead never buckles', () => {
    const { mesh, byName } = beam(300, 10, 4);
    const r = solveBuckling(mesh, { thickness: 10, material: steel, gravity: false,
      supports: [{ id: 'f', kind: 'fixed', edges: byName('Left end') }],
      loads: [{ id: 'p', kind: 'force', edges: byName('Right end'), F: 1000, angle: 0 }] }, 2);
    expect(r.none).toBe(true);
  });
  it('a bar held at both ends buckles when warmed enough (thermal buckling)', () => {
    const L = 300, H = 10, { mesh, byName } = beam(L, H, 3);
    const r = solveBuckling(mesh, { thickness: 10, material: steel, gravity: false, warming: 1,
      supports: [{ id: 'a', kind: 'fixed', edges: byName('Left end') }, { id: 'b', kind: 'fixed', edges: byName('Right end') }], loads: [] }, 1);
    // Fixed–fixed: P = 4π²EI/L² against E·α·ΔT·A (plane stress adds 1/(1−ν) to the held squeeze; roughly).
    const dT = (4 * Math.PI ** 2 * (H ** 2 / 12)) / (L ** 2 * steel.alpha);
    expect(r.modes[0].factor / dT).toBeGreaterThan(0.6);
    expect(r.modes[0].factor / dT).toBeLessThan(1.1);
  });
});
