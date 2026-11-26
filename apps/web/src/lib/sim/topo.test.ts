import { describe, expect, it } from 'vitest';
import { meshPart } from './mesh';
import { edgesOf, TEMPLATES } from './part';
import { MATERIALS } from './structure';
import { solveTopology } from './topo';

describe('Hyperion Simulate: the lightest shape (M547)', () => {
  const tpl = TEMPLATES.find((t) => t.id === 'beam')!, { part, names } = tpl.make({ L: 160, H: 80 }), edges = edgesOf(part, names);
  const byName = (n: string) => edges.filter((e) => e.label === n).map((e) => e.id);
  const mesh = meshPart(part, edges, 6);
  const study = { thickness: 5, material: MATERIALS[0], gravity: false,
    supports: [{ id: 'f', kind: 'fixed' as const, edges: byName('Left end') }],
    loads: [{ id: 'p', kind: 'force' as const, edges: byName('Right end'), F: 1000, angle: -90 }] };
  it('keeps the share of material asked for, mostly solid or empty, and is far stiffer than the same material spread evenly', () => {
    const r = solveTopology(mesh, study, { keep: 0.4 });
    expect(r.kept).toBeGreaterThan(0.39);
    expect(r.kept).toBeLessThan(0.41);
    expect(r.grey / r.density.length).toBeLessThan(0.35);
    // Spread evenly at 40% density (x³ stiffness) it is 1/0.064 = 16× as bendy as solid; the shape found is near the
    // 2.5× of a solid part made 40% as stiff (the best a shape of 40% can do, give or take, on a coarse mesh).
    const last = r.history[r.history.length - 1];
    expect(r.history[0] / r.solid).toBeCloseTo(1 / 0.064, 0);
    expect(last / r.solid).toBeLessThan(2.8);
    expect(last).toBeLessThan(r.history[0] / 5);
  });
  it('asks for a support and a load', () => {
    expect(() => solveTopology(mesh, { ...study, supports: [] }, { keep: 0.4 })).toThrow(/support/);
    expect(() => solveTopology(mesh, { ...study, loads: [] }, { keep: 0.4 })).toThrow(/load/);
  });
});
