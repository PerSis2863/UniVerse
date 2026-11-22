import { describe, expect, it } from 'vitest';
import { delaunay, elementSize, meshPart } from './mesh';
import { edgesOf, TEMPLATES } from './part';
import { MATERIALS, peak, solveStatic, type Study } from './structure';
import { MechanismError } from './skyline';

const steel = MATERIALS[0];
const build = (id: string, values: Record<string, number>, size?: number) => {
  const tpl = TEMPLATES.find((t) => t.id === id)!, { part, names } = tpl.make(values), edges = edgesOf(part, names);
  const byName = (n: string) => edges.filter((e) => e.label === n).map((e) => e.id);
  return { part, edges, byName, mesh: meshPart(part, edges, size ?? elementSize(part, 'fine')) };
};

describe('Hyperion Simulate: the mesh (M404)', () => {
  it('Delaunay joins a square and its middle into four triangles', () => {
    expect(delaunay([0, 1, 1, 0, 0.5], [0, 0, 1, 1, 0.5]).length / 3).toBe(4);
  });
  it('meshes each ready-made part with well-shaped, counter-clockwise triangles that follow the outline', () => {
    for (const tpl of TEMPLATES) {
      const values = Object.fromEntries(tpl.params.map((p) => [p.key, p.value]));
      const { mesh, edges, part } = build(tpl.id, values);
      const T = mesh.tri;
      for (let e = 0; e < T.length; e += 6) {
        const [a, b, c] = [T[e], T[e + 1], T[e + 2]];
        expect((mesh.x[b] - mesh.x[a]) * (mesh.y[c] - mesh.y[a]) - (mesh.x[c] - mesh.x[a]) * (mesh.y[b] - mesh.y[a])).toBeGreaterThan(0);
      }
      expect(mesh.minAngle).toBeGreaterThan(18);
      for (const e of edges) expect(mesh.segs.get(e.id)?.length, `${tpl.id} ${e.label}`).toBeGreaterThan(0);
      // The elements' area adds up to the part's.
      let area = 0;
      for (let e = 0; e < T.length; e += 6) { const [a, b, c] = [T[e], T[e + 1], T[e + 2]]; area += ((mesh.x[b] - mesh.x[a]) * (mesh.y[c] - mesh.y[a]) - (mesh.x[c] - mesh.x[a]) * (mesh.y[b] - mesh.y[a])) / 2; }
      const holes = part.holes.reduce((s, h) => s + (h.kind === 'circle' ? Math.PI * h.r * h.r : 0), 0);
      const outer = part.outer.kind === 'poly' ? Math.abs(part.outer.pts.reduce((s, p, i, P) => s + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0) / 2) : 0;
      expect(Math.abs(area - (outer - holes)) / (outer - holes), tpl.id).toBeLessThan(0.01);
    }
  });
});

describe('Hyperion Simulate: stress and bending (M404)', () => {
  it('a bar pulled evenly has the same stress everywhere and stretches by σL/E (patch test)', () => {
    const { mesh, byName } = build('beam', { L: 100, H: 50 }, 12);
    const study: Study = { thickness: 2, material: steel, gravity: false,
      supports: [{ id: 'a', kind: 'slideY', edges: byName('Left end') }, { id: 'b', kind: 'slideX', edges: byName('Bottom') }],
      loads: [{ id: 'f', kind: 'force', edges: byName('Right end'), F: 10_000, angle: 0 }] };
    const r = solveStatic(mesh, study), s = 10_000 / (50 * 2);
    for (let n = 0; n < mesh.x.length; n++) { expect(r.sx[n]).toBeCloseTo(s, 6); expect(Math.abs(r.sy[n])).toBeLessThan(1e-6); }
    expect(peak(r.ux).value).toBeCloseTo((s * 100) / steel.E, 9);
    expect(r.reactions[0].fx + r.reactions[1].fx + r.applied.fx).toBeCloseTo(0, 6);
  });
  it('a cantilever bends as beam theory says (tip PL³/3EI, stress M·c/I)', () => {
    const { mesh, byName } = build('beam', { L: 200, H: 20 });
    const study: Study = { thickness: 10, material: steel, gravity: false,
      supports: [{ id: 'fix', kind: 'fixed', edges: byName('Left end') }],
      loads: [{ id: 'p', kind: 'force', edges: byName('Right end'), F: 1000, angle: -90 }] };
    const r = solveStatic(mesh, study), I = (10 * 20 ** 3) / 12, theory = (1000 * 200 ** 3) / (3 * steel.E * I);
    expect(-peak(r.uy, true).value / theory).toBeGreaterThan(0.98);
    expect(-peak(r.uy, true).value / theory).toBeLessThan(1.04);
    // Halfway along, on top: σx = M c / I = 1000·100·10 / I = 150 MPa.
    let near = 0;
    for (let n = 0; n < mesh.x.length; n++) if (Math.hypot(mesh.x[n] - 100, mesh.y[n] - 20) < Math.hypot(mesh.x[near] - 100, mesh.y[near] - 20)) near = n;
    const expected = (1000 * (200 - mesh.x[near]) * 10) / I;
    expect(r.sx[near] / expected).toBeGreaterThan(0.95);
    expect(r.sx[near] / expected).toBeLessThan(1.05);
    // The support carries the load.
    expect(r.reactions[0].fy).toBeCloseTo(1000, 3);
  });
  it('a hole in a wide plate concentrates the stress about three times (Kirsch)', () => {
    const { mesh, byName } = build('plate', { W: 400, H: 200, R: 10 }, 5);
    const study: Study = { thickness: 1, material: steel, gravity: false,
      supports: [{ id: 'a', kind: 'slideY', edges: byName('Left end') }, { id: 'b', kind: 'fixed', edges: [] }],
      loads: [{ id: 'f', kind: 'force', edges: byName('Right end'), F: 200 * 100, angle: 0 }] };
    // Hold one point of the left end in y too, so the plate can't slide sideways.
    const left = mesh.nodes.get(byName('Left end')[0])!, mid = left.reduce((b, n) => (Math.abs(mesh.y[n] - 100) < Math.abs(mesh.y[b] - 100) ? n : b), left[0]);
    mesh.nodes.set('pin', [mid]);
    study.supports[1].edges = ['pin'];
    study.supports[1].kind = 'slideX';
    const r = solveStatic(mesh, study), top = peak(r.sx).value / 100;
    expect(top).toBeGreaterThan(2.85);
    expect(top).toBeLessThan(3.4);
  });
  it('a part held nowhere, or able to slide, is refused in plain words', () => {
    const { mesh, byName } = build('beam', { L: 100, H: 20 });
    const base = { thickness: 1, material: steel, gravity: false, loads: [] };
    expect(() => solveStatic(mesh, { ...base, supports: [] })).toThrow(/support/);
    expect(() => solveStatic(mesh, { ...base, supports: [{ id: 's', kind: 'slideY', edges: byName('Left end') }] })).toThrow(MechanismError);
  });
  it('its own weight hangs on the support', () => {
    const { mesh, byName } = build('plate', { W: 200, H: 100, R: 15 });
    const r = solveStatic(mesh, { thickness: 10, material: steel, gravity: true, supports: [{ id: 'top', kind: 'fixed', edges: byName('Top') }], loads: [] });
    expect(r.reactions[0].fy / (r.massKg * 9.81)).toBeCloseTo(1, 6);
    expect(r.massKg).toBeCloseTo((200 * 100 - Math.PI * 225) * 10 * 1e-9 * 7850, 3);
  });
});

describe('Hyperion Simulate: colour bands and the kept study (M404)', () => {
  it('cuts a triangle along band limits, the pieces adding up to the whole', async () => {
    const { clipBand, levels } = await import('./contour');
    const x = [0, 10, 0], y = [0, 0, 10], v = [0, 9, 9], lv = levels(0, 9);
    const area = (p: number[]) => { let a = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i] * p[j + 1] - p[j] * p[i + 1]; } return Math.abs(a) / 2; };
    let sum = 0;
    for (let b = 0; b < 9; b++) sum += area(clipBand(x, y, v, lv[b], lv[b + 1]));
    expect(sum).toBeCloseTo(50, 9);
    expect(area(clipBand(x, y, v, 0, 1))).toBeCloseTo(50 / 81, 9); // the corner where values are lowest
  });
  it('reads back a kept study, and anything odd starts afresh', async () => {
    const { readModel, startModel, studyOf, modelProblem } = await import('./model');
    expect(readModel(null).template).toBe('beam');
    expect(readModel({ template: 'nope' }).template).toBe('beam');
    const m = readModel({ ...startModel('plate'), thickness: 'x', material: 'unobtainium', supports: [{ id: 's', kind: 'weird', edges: [] }] });
    expect([m.template, m.thickness, m.material, m.supports.length]).toEqual(['plate', 10, 'steel', 0]);
    expect(modelProblem(m)).toMatch(/Hold the part/);
    expect(studyOf(startModel('hook')).loads[0]).toMatchObject({ kind: 'bearing', F: 20_000, angle: 90 });
  });
});
