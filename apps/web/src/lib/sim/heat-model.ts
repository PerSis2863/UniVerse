import type { Fineness } from './mesh';
import { partOf, newId } from './model';
import { partProblem, TEMPLATES } from './part';
import type { HeatBc, HeatStudy } from './heat';
import { MATERIALS } from './structure';

// Hyperion Simulate → Heat (M407): what the Heat workbench keeps on this device (`uv-sim-heat`): the part, its
// material, the mesh, the edge conditions (held temperatures, heat flowing in, air), heat made inside, air on the
// faces, and whether it runs over time.

export interface HeatModel {
  template: string; values: Record<string, number>; thickness: number; material: string; fineness: Fineness;
  bcs: HeatBc[]; generation: number; faces: { h: number; Tinf: number };
  transient: { on: boolean; seconds: number; steps: number; T0: number };
}

/** Each shape starts warmed somewhere and cooled by air (edges by their names). */
const STARTS: Record<string, { temp: [string, number][]; air: string[]; faces: number }> = {
  beam: { temp: [['Left end', 100]], air: [], faces: 25 },
  plate: { temp: [['Hole', 120]], air: ['Bottom', 'Right end', 'Top', 'Left end'], faces: 10 },
  bracket: { temp: [['Top bolt hole', 80]], air: [], faces: 15 },
  hook: { temp: [['Base', 60]], air: [], faces: 15 },
};

export function startHeat(template = 'plate'): HeatModel {
  const tpl = TEMPLATES.find((t) => t.id === template) ?? TEMPLATES[1];
  const values = Object.fromEntries(tpl.params.map((p) => [p.key, p.value]));
  const { edges } = partOf({ template: tpl.id, values });
  const ids = (label: string) => edges.filter((e) => e.label === label).map((e) => e.id);
  const s = STARTS[tpl.id];
  const air = s.air.flatMap(ids);
  return {
    template: tpl.id, values, thickness: 3, material: 'steel', fineness: 'medium', generation: 0, faces: { h: s.faces, Tinf: 20 },
    transient: { on: false, seconds: 600, steps: 60, T0: 20 },
    bcs: [
      ...s.temp.map(([at, T]): HeatBc => ({ id: newId('t'), kind: 'temp', edges: ids(at), T })),
      ...(air.length ? [{ id: newId('t'), kind: 'convection', edges: air, h: 25, Tinf: 20 } as HeatBc] : []),
    ],
  };
}

export function readHeat(raw: unknown): HeatModel {
  const m = raw as Partial<HeatModel> | null;
  if (!m || typeof m !== 'object' || !TEMPLATES.some((t) => t.id === m.template)) return startHeat();
  const base = startHeat(m.template);
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    ...base,
    values: Object.fromEntries(Object.entries(base.values).map(([k, v]) => [k, num(m.values?.[k], v)])),
    thickness: num(m.thickness, base.thickness),
    material: MATERIALS.some((x) => x.id === m.material) ? m.material! : base.material,
    fineness: (['coarse', 'medium', 'fine', 'finest'] as const).find((f) => f === m.fineness) ?? base.fineness,
    generation: num(m.generation, 0),
    faces: { h: Math.max(0, num(m.faces?.h, base.faces.h)), Tinf: num(m.faces?.Tinf, 20) },
    transient: { on: m.transient?.on === true, seconds: Math.max(1, num(m.transient?.seconds, 600)), steps: Math.max(1, Math.min(200, Math.round(num(m.transient?.steps, 60)))), T0: num(m.transient?.T0, 20) },
    bcs: Array.isArray(m.bcs) ? m.bcs.filter((b) => b && ['temp', 'flux', 'convection'].includes(b.kind)).map((b): HeatBc => (
      b.kind === 'temp' ? { id: String(b.id), kind: 'temp', edges: strs(b.edges), T: num(b.T, 100) }
        : b.kind === 'flux' ? { id: String(b.id), kind: 'flux', edges: strs(b.edges), q: num(b.q, 1000) }
          : { id: String(b.id), kind: 'convection', edges: strs(b.edges), h: Math.max(0, num(b.h, 25)), Tinf: num(b.Tinf, 20) })) : base.bcs,
  };
}

export function heatStudyOf(m: HeatModel): HeatStudy {
  return {
    thickness: m.thickness, material: MATERIALS.find((x) => x.id === m.material) ?? MATERIALS[0], bcs: m.bcs, generation: m.generation, faces: m.faces,
    transient: m.transient.on ? { seconds: m.transient.seconds, steps: m.transient.steps, T0: m.transient.T0 } : null,
  };
}

export function heatProblem(m: HeatModel): string | null {
  const p = partProblem(partOf(m).part);
  if (p) return p;
  if (!(m.thickness > 0)) return 'The thickness must be more than 0.';
  const cools = m.bcs.some((b) => (b.kind === 'temp' || (b.kind === 'convection' && b.h > 0)) && b.edges.length) || m.faces.h > 0;
  if (!cools && !m.transient.on) return 'Nothing takes heat away: hold an edge at a temperature, or put air on an edge or the faces.';
  return null;
}

export const HEAT_NAMES: Record<HeatBc['kind'], string> = { temp: 'Held temperature', flux: 'Heat flowing in', convection: 'Air (convection)' };
