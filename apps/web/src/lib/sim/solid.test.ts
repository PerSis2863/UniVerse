import { describe, expect, it } from 'vitest';
import { meshPart } from './mesh';
import { edgesOf, TEMPLATES } from './part';
import { MATERIALS } from './structure';
import { extrude, solveSolid } from './solid';

const steel = MATERIALS[0];
const beam = (L: number, H: number, h: number) => {
  const { part, names } = TEMPLATES[0].make({ L, H }), edges = edgesOf(part, names);
  return { mesh: meshPart(part, edges, h), ids: (n: string) => edges.filter((e) => e.label === n).map((e) => e.id) };
};

describe('Hyperion Simulate: 3D parts (M413)', () => {
  it('stacks a flat mesh into tetrahedra that fill the solid exactly, with an outside of its faces', () => {
    const { mesh } = beam(100, 20, 10), s = extrude(mesh, 8, 2);
    let vol = 0;
    for (let e = 0; e < s.tet.length; e += 10) {
      const [p0, p1, p2, p3] = [s.tet[e], s.tet[e + 1], s.tet[e + 2], s.tet[e + 3]];
      const a = [s.x[p1] - s.x[p0], s.y[p1] - s.y[p0], s.z[p1] - s.z[p0]], b = [s.x[p2] - s.x[p0], s.y[p2] - s.y[p0], s.z[p2] - s.z[p0]], c = [s.x[p3] - s.x[p0], s.y[p3] - s.y[p0], s.z[p3] - s.z[p0]];
      const v = (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      expect(v).toBeGreaterThan(0);
      vol += v;
    }
    expect(vol).toBeCloseTo(100 * 20 * 8, 6);
    // The outside's area: two faces of 100×20 and the sides around.
    let area = 0;
    for (let i = 0; i < s.surface.length; i += 6) {
      const [p, q, r] = [s.surface[i], s.surface[i + 1], s.surface[i + 2]], u = [s.x[q] - s.x[p], s.y[q] - s.y[p], s.z[q] - s.z[p]], w = [s.x[r] - s.x[p], s.y[r] - s.y[p], s.z[r] - s.z[p]];
      area += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    }
    expect(area).toBeCloseTo(2 * 100 * 20 + 2 * (100 + 20) * 8, 6);
  });
  it('a solid cantilever bends as beam theory says, and its support carries the load', () => {
    const { mesh, ids } = beam(200, 20, 6), s = extrude(mesh, 10, 2);
    const r = solveSolid(s, { thickness: 10, material: steel, gravity: false, supports: [{ id: 'a', kind: 'fixed', edges: ids('Left end') }], loads: [{ id: 'p', kind: 'force', edges: ids('Right end'), F: 1000, angle: -90 }] });
    const I = (10 * 20 ** 3) / 12, theory = (1000 * 200 ** 3) / (3 * steel.E * I), tip = -Math.min(...r.uy);
    expect(tip / theory).toBeGreaterThan(0.97);
    expect(tip / theory).toBeLessThan(1.04);
    expect(r.reactions[0].fy).toBeCloseTo(1000, 3);
    expect(Math.max(...r.uz.map(Math.abs))).toBeLessThan(tip * 0.01); // no twisting out of plane
    expect(r.massKg).toBeCloseTo(200 * 20 * 10 * 1e-9 * 7850, 6);
  }, 60_000);
});
