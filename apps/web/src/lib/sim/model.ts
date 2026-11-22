import type { Fineness } from './mesh';
import { CUSTOM_START, customPart, edgesOf, groupedEdges, MAX_CORNERS, MAX_HOLES, partProblem, TEMPLATES, type CustomShape, type Edge, type Part, type Pt, type TemplateParam } from './part';
import { MATERIALS, type Load, type Study, type Support, type SupportKind } from './structure';

// Hyperion Simulate (M404): what the Structures workbench keeps (on this device): the part (a ready-made shape and its
// sizes), its thickness and material, the mesh's fineness, the supports and the loads, each on edges named by place.

export interface Model {
  template: string;
  values: Record<string, number>;
  thickness: number;
  material: string;
  fineness: Fineness;
  supports: Support[];
  loads: Load[];
  gravity: boolean;
  /** The outline and holes when the shape is drawn by hand (template "custom", M411). */
  custom?: CustomShape;
  /** Flat (plane stress, 2D) or a solid of the thickness (3D, M413). */
  dim?: '2d' | '3d';
}

/** A ready-made shape's name and sizes, or the hand-drawn one's (no sizes: its corners are drawn). */
export function templateInfo(id: string): { id: string; name: string; params: TemplateParam[] } {
  if (id === 'custom') return { id, name: 'Your own shape', params: [] };
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
  return { id: t.id, name: t.name, params: t.params };
}
export const isTemplate = (id: unknown) => id === 'custom' || TEMPLATES.some((t) => t.id === id);

/** A kept hand-drawn shape read back safely (corners and holes as numbers, within limits). */
export function readCustom(raw: unknown): CustomShape {
  const c = raw as Partial<CustomShape> | null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e5, Math.min(1e5, v)) : null);
  const pt = (v: unknown): Pt | null => { if (!Array.isArray(v)) return null; const x = num(v[0]), y = num(v[1]); return x === null || y === null ? null : [x, y]; };
  const pts = Array.isArray(c?.pts) ? c.pts.map(pt).filter((p): p is Pt => !!p).slice(0, MAX_CORNERS) : [];
  const holes = Array.isArray(c?.holes) ? c.holes.map((h) => { const cc = pt(h?.c), r = num(h?.r); return cc && r && r > 0 ? { c: cc, r } : null; }).filter((h): h is { c: Pt; r: number } => !!h).slice(0, MAX_HOLES) : [];
  return pts.length >= 3 ? { pts, holes } : CUSTOM_START;
}

/** Each ready-made part starts held and loaded the usual way (edges by their names). */
const STARTS: Record<string, { supports: [SupportKind, string][]; loads: (['force' | 'bearing', string, number, number] | ['pressure', string, number])[] }> = {
  beam: { supports: [['fixed', 'Left end']], loads: [['force', 'Right end', 500, -90]] },
  plate: { supports: [['fixed', 'Left end']], loads: [['force', 'Right end', 20_000, 0]] },
  bracket: { supports: [['fixed', 'Top bolt hole']], loads: [['bearing', 'End bolt hole', 2000, -90]] },
  hook: { supports: [['fixed', 'Base']], loads: [['bearing', 'Pin hole', 20_000, 90]] },
  custom: { supports: [['fixed', 'Side 6']], loads: [['force', 'Side 2', 1000, -90]] },
};

export function partOf(m: Pick<Model, 'template' | 'values' | 'custom'>): { part: Part; edges: Edge[] } {
  if (m.template === 'custom') { const part = customPart(m.custom ?? CUSTOM_START); return { part, edges: edgesOf(part) }; }
  const tpl = TEMPLATES.find((t) => t.id === m.template) ?? TEMPLATES[0];
  const values = Object.fromEntries(tpl.params.map((p) => [p.key, Number.isFinite(m.values[p.key]) ? m.values[p.key] : p.value]));
  const { part, names } = tpl.make(values);
  return { part, edges: edgesOf(part, names) };
}

let seq = 0;
export const newId = (k: string) => `${k}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function startModel(template = 'beam'): Model {
  const tpl = templateInfo(template), custom = tpl.id === 'custom' ? CUSTOM_START : undefined;
  const values = Object.fromEntries(tpl.params.map((p) => [p.key, p.value]));
  const { edges } = partOf({ template: tpl.id, values, custom });
  const ids = (label: string) => edges.filter((e) => e.label === label).map((e) => e.id);
  const s = STARTS[tpl.id];
  return {
    template: tpl.id, values, thickness: 10, material: 'steel', fineness: 'medium', gravity: false, ...(custom ? { custom } : {}),
    supports: s.supports.map(([kind, at]) => ({ id: newId('s'), kind, edges: ids(at) })),
    loads: s.loads.map((l): Load => (l[0] === 'pressure' ? { id: newId('l'), kind: 'pressure', edges: ids(l[1]), p: l[2] } : { id: newId('l'), kind: l[0], edges: ids(l[1]), F: l[2], angle: l[3] })),
  };
}

/** A kept model read back safely (anything odd falls back to the start). */
export function readModel(raw: unknown): Model {
  const m = raw as Partial<Model> | null;
  if (!m || typeof m !== 'object' || !isTemplate(m.template)) return startModel();
  const base = startModel(m.template);
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    ...base,
    values: Object.fromEntries(Object.entries(base.values).map(([k, v]) => [k, num(m.values?.[k], v)])),
    thickness: num(m.thickness, base.thickness),
    material: MATERIALS.some((x) => x.id === m.material) ? m.material! : base.material,
    fineness: (['coarse', 'medium', 'fine', 'finest'] as const).find((f) => f === m.fineness) ?? base.fineness,
    gravity: m.gravity === true,
    dim: m.dim === '3d' ? '3d' : '2d',
    ...(m.template === 'custom' ? { custom: readCustom(m.custom) } : {}),
    supports: Array.isArray(m.supports) ? m.supports.filter((s) => s && ['fixed', 'slideX', 'slideY'].includes(s.kind)).map((s) => ({ id: String(s.id), kind: s.kind, edges: strs(s.edges) })) : base.supports,
    loads: Array.isArray(m.loads) ? m.loads.filter((l) => l && ['force', 'pressure', 'bearing'].includes(l.kind)).map((l): Load => (l.kind === 'pressure' ? { id: String(l.id), kind: 'pressure', edges: strs(l.edges), p: num(l.p, 1) } : { id: String(l.id), kind: l.kind, edges: strs(l.edges), F: num(l.F, 1000), angle: num(l.angle, -90) })) : base.loads,
  };
}

export function studyOf(m: Model): Study {
  return { thickness: m.thickness, material: MATERIALS.find((x) => x.id === m.material) ?? MATERIALS[0], supports: m.supports, loads: m.loads, gravity: m.gravity };
}

/** What stops a solve, in plain words (null when it can run). */
export function modelProblem(m: Model): string | null {
  const { part } = partOf(m);
  const p = partProblem(part);
  if (p) return p;
  if (!(m.thickness > 0)) return 'The thickness must be more than 0.';
  if (!m.supports.some((s) => s.edges.length)) return 'Hold the part somewhere: add a support and pick its edge.';
  return null;
}

export const SUPPORT_NAMES: Record<SupportKind, string> = { fixed: 'Fixed support', slideX: 'Slides along x', slideY: 'Slides along y' };
export const LOAD_NAMES: Record<Load['kind'], string> = { force: 'Force', pressure: 'Pressure', bearing: 'Bolt load' };

export type Field = 'u' | 'ux' | 'uy' | 'vm' | 's1' | 's2' | 'sx' | 'sy' | 'sxy' | 'safety';
export const FIELDS: { id: Field; name: string; unit: string }[] = [
  { id: 'u', name: 'Total deformation', unit: 'mm' },
  { id: 'ux', name: 'Deformation in x', unit: 'mm' },
  { id: 'uy', name: 'Deformation in y', unit: 'mm' },
  { id: 'vm', name: 'Equivalent stress (von Mises)', unit: 'MPa' },
  { id: 's1', name: 'Largest principal stress', unit: 'MPa' },
  { id: 's2', name: 'Smallest principal stress', unit: 'MPa' },
  { id: 'sx', name: 'Normal stress in x', unit: 'MPa' },
  { id: 'sy', name: 'Normal stress in y', unit: 'MPa' },
  { id: 'sxy', name: 'Shear stress', unit: 'MPa' },
  { id: 'safety', name: 'Safety factor', unit: '' },
];

/** The edges as people see them (the lug's rounded top is one). */
export const edgeGroups = (edges: Edge[]) => groupedEdges(edges);

/** The verdict in plain words, from the highest stress and the material. */
export function verdict(maxVm: number, yieldMPa: number, material: string): { text: string; ok: boolean } {
  const sf = maxVm > 0 ? yieldMPa / maxVm : Infinity;
  if (!Number.isFinite(sf)) return { text: 'No stress: nothing pushes on the part.', ok: true };
  const f = sf >= 10 ? Math.round(sf) : +sf.toFixed(2);
  if (sf < 1) return { text: `It fails: the highest stress, ${+maxVm.toPrecision(3)} MPa, is beyond what ${material} can take (${yieldMPa} MPa), so it would bend for good. Make it thicker, use a stronger material, or lower the load.`, ok: false };
  if (sf < 1.5) return { text: `Too close: the highest stress, ${+maxVm.toPrecision(3)} MPa, is near ${material}’s limit (${yieldMPa} MPa): a safety factor of ${f}. Designs usually want 1.5 to 3.`, ok: false };
  return { text: `It holds: the highest stress is ${+maxVm.toPrecision(3)} MPa, ${material} takes ${yieldMPa} MPa, a safety factor of ${f}.`, ok: true };
}

/** The musical note nearest a frequency ("G♯4", and how many cents off), for a vibration mode one can hear. */
export function noteOf(f: number): { name: string; cents: number } | null {
  if (!(f >= 16 && f <= 20_000)) return null;
  const n = 12 * Math.log2(f / 440) + 69, k = Math.round(n);
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  return { name: `${names[((k % 12) + 12) % 12]}${Math.floor(k / 12) - 1}`, cents: Math.round((n - k) * 100) };
}
