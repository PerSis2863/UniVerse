import { FATIGUE_START, MATERIALS, type Load, type SupportKind } from './structure';
import { partOf, startModel, type Model } from './model';
import { TEMPLATES } from './part';

// Hyperion's sim set-up (M549b): what Ghidra is told it may choose from, and its answer made into a Structures study.
// Shared by the route (src/server/ghidra-apps.ts) and Ghidra's exam (its sim-setup paper).

/** The shapes, their sizes and edges, and the materials, as Ghidra is told them. */
export function simChoices() {
  const shapes = TEMPLATES.map((t) => {
    const values = Object.fromEntries(t.params.map((p) => [p.key, p.value]));
    const edges = [...new Set(partOf({ template: t.id, values }).edges.map((e) => e.label))];
    return `${t.id} (${t.name}): sizes ${t.params.map((p) => `${p.key} = ${p.label} (${p.min}–${p.max} mm, usually ${p.value})`).join(', ')}; edges: ${edges.join(', ')}`;
  }).filter((l) => !l.startsWith('custom'));
  return `Shapes:\n${shapes.join('\n')}\nMaterials: ${MATERIALS.map((m) => `${m.id} (${m.name})`).join(', ')}\nSupport kinds: fixed, slideX (slides along x), slideY (slides along y)\nLoad kinds: force (N), pressure (MPa), bearing (a bolt in a hole, N)\nDirections: down, up, left, right\nAnalyses: static, modal, buckling, topology`;
}

const ANGLE: Record<string, number> = { down: -90, up: 90, left: 180, right: 0 };
/** Ghidra's answer made into a study the bench can open, keeping only what exists (unknown edges and kinds dropped). */
export function studyFrom(out: Record<string, unknown>): { model: Model; analysis: 'static' | 'modal' | 'buckling' | 'topology'; note: string } {
  const tpl = TEMPLATES.find((t) => t.id === out.template && t.id !== 'custom') ?? TEMPLATES[0];
  const base = startModel(tpl.id);
  const sizes = Array.isArray(out.sizes) ? out.sizes as { key?: unknown; value?: unknown }[] : [];
  const values = Object.fromEntries(tpl.params.map((p) => {
    const v = Number(sizes.find((x) => x.key === p.key)?.value);
    return [p.key, Number.isFinite(v) ? Math.max(p.min, Math.min(p.max, v)) : p.value];
  }));
  const { edges } = partOf({ template: tpl.id, values });
  const ids = (label: unknown) => edges.filter((e) => typeof label === 'string' && e.label.toLowerCase() === label.toLowerCase()).map((e) => e.id);
  let k = 0;
  const supports = (Array.isArray(out.supports) ? out.supports as { kind?: unknown; edge?: unknown }[] : []).slice(0, 6)
    .filter((s) => ['fixed', 'slideX', 'slideY'].includes(String(s.kind)) && ids(s.edge).length)
    .map((s) => ({ id: `s${k++}`, kind: s.kind as SupportKind, edges: ids(s.edge) }));
  const loads = (Array.isArray(out.loads) ? out.loads as { kind?: unknown; edge?: unknown; amount?: unknown; direction?: unknown }[] : []).slice(0, 6)
    .filter((l) => ['force', 'pressure', 'bearing'].includes(String(l.kind)) && ids(l.edge).length && Number.isFinite(Number(l.amount)))
    .map((l): Load => (l.kind === 'pressure' ? { id: `l${k++}`, kind: 'pressure', edges: ids(l.edge), p: Math.max(-1e4, Math.min(1e4, Number(l.amount))) }
      : { id: `l${k++}`, kind: l.kind as 'force' | 'bearing', edges: ids(l.edge), F: Math.max(-1e8, Math.min(1e8, Number(l.amount))), angle: ANGLE[String(l.direction)] ?? -90 }));
  const thickness = Number(out.thickness);
  const analysis = (['static', 'modal', 'buckling', 'topology'] as const).find((a) => a === out.analysis) ?? 'static';
  return {
    model: { ...base, values, material: MATERIALS.some((m) => m.id === out.material) ? String(out.material) : base.material, thickness: thickness > 0 && thickness <= 1000 ? thickness : base.thickness,
      supports: supports.length ? supports : base.supports, loads: loads.length ? loads : base.loads, fatigue: FATIGUE_START },
    analysis, note: typeof out.note === 'string' ? out.note.slice(0, 400) : '',
  };
}

