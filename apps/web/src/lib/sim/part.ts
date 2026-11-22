// Hyperion Simulate (M404, the owner, 22 Nov: "where are the ansys software features… we need to make a software not
// just platform"): the part being simulated, a flat (2D) shape in millimetres: an outline with holes. Its boundary is
// cut into named edges (a side of the outline, a whole round hole) that supports and loads are put on.

export type Pt = [number, number];
/** A closed loop: a polygon (corners in order) or a circle. */
export type Loop = { kind: 'poly'; pts: Pt[] } | { kind: 'circle'; c: Pt; r: number };
export interface Part { outer: Loop; holes: Loop[] }
/** A piece of the boundary that a support or a load can go on. */
export interface Edge { id: string; label: string; loop: number; seg: number | null }

const area = (p: Pt[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
/** The outline counter-clockwise and the holes clockwise (so every boundary piece's outward side is on its right). */
export function oriented(part: Part): Part {
  const fix = (l: Loop, ccw: boolean): Loop => (l.kind === 'circle' ? l : { kind: 'poly', pts: (area(l.pts) > 0) === ccw ? l.pts : [...l.pts].reverse() });
  return { outer: fix(part.outer, true), holes: part.holes.map((h) => fix(h, false)) };
}

/** The edges of a part: each side of a polygon (loop 0 is the outline, 1… the holes), a circle whole. */
export function edgesOf(part: Part, names: string[] = []): Edge[] {
  const out: Edge[] = [];
  [part.outer, ...part.holes].forEach((l, loop) => {
    if (l.kind === 'circle') { out.push({ id: `L${loop}`, label: '', loop, seg: null }); return; }
    l.pts.forEach((_, seg) => out.push({ id: `L${loop}S${seg}`, label: '', loop, seg }));
  });
  let side = 0, hole = 0;
  return out.map((e, i) => ({ ...e, label: names[i] || (e.loop === 0 ? `Side ${++side}` : `Hole ${++hole}${e.seg !== null ? ` side ${e.seg + 1}` : ''}`) }));
}

const inPoly = (p: Pt[], x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inLoop = (l: Loop, x: number, y: number) => (l.kind === 'circle' ? (x - l.c[0]) ** 2 + (y - l.c[1]) ** 2 < l.r * l.r : inPoly(l.pts, x, y));
export const inside = (part: Part, x: number, y: number) => inLoop(part.outer, x, y) && !part.holes.some((h) => inLoop(h, x, y));

const segDist = (x: number, y: number, [ax, ay]: Pt, [bx, by]: Pt) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};
const loopDist = (l: Loop, x: number, y: number) => {
  if (l.kind === 'circle') return Math.abs(Math.hypot(x - l.c[0], y - l.c[1]) - l.r);
  let d = Infinity;
  for (let i = 0; i < l.pts.length; i++) d = Math.min(d, segDist(x, y, l.pts[i], l.pts[(i + 1) % l.pts.length]));
  return d;
};
/** How far a point is from the nearest boundary. */
export const boundaryDist = (part: Part, x: number, y: number) => Math.min(loopDist(part.outer, x, y), ...part.holes.map((h) => loopDist(h, x, y)));

export function bounds(part: Part) {
  const l = part.outer;
  if (l.kind === 'circle') return { x0: l.c[0] - l.r, y0: l.c[1] - l.r, x1: l.c[0] + l.r, y1: l.c[1] + l.r };
  const xs = l.pts.map((p) => p[0]), ys = l.pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Does the part make sense: an outline of 3+ corners or a circle, holes inside it and apart from each other. */
export function partProblem(part: Part): string | null {
  const o = part.outer;
  if (o.kind === 'poly' && (o.pts.length < 3 || Math.abs(area(o.pts)) < 1e-9)) return 'The outline needs at least three corners around an area.';
  if (o.kind === 'circle' && !(o.r > 0)) return 'The circle needs a radius.';
  for (const [i, h] of part.holes.entries()) {
    if (h.kind === 'circle') {
      if (!(h.r > 0)) return `Hole ${i + 1} needs a radius.`;
      if (!inLoop(o, h.c[0], h.c[1]) || loopDist(o, h.c[0], h.c[1]) <= h.r) return `Hole ${i + 1} reaches the outside edge: make it smaller or move it in.`;
    } else if (h.pts.some(([x, y]) => !inLoop(o, x, y))) return `Hole ${i + 1} reaches outside the part.`;
  }
  return null;
}

// ——— Ready-made parts, each with its sizes as settings (mm) ———

export interface TemplateParam { key: string; label: string; value: number; min: number; max: number }
export interface Template { id: string; name: string; params: TemplateParam[]; make: (v: Record<string, number>) => { part: Part; names: string[] } }

const rect = (x0: number, y0: number, x1: number, y1: number): Loop => ({ kind: 'poly', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });

export const TEMPLATES: Template[] = [
  {
    id: 'beam', name: 'Cantilever beam',
    params: [{ key: 'L', label: 'Length', value: 200, min: 20, max: 5000 }, { key: 'H', label: 'Height', value: 20, min: 2, max: 1000 }],
    make: ({ L, H }) => ({ part: { outer: rect(0, 0, L, H), holes: [] }, names: ['Bottom', 'Right end', 'Top', 'Left end'] }),
  },
  {
    id: 'plate', name: 'Plate with a hole',
    params: [{ key: 'W', label: 'Width', value: 200, min: 20, max: 5000 }, { key: 'H', label: 'Height', value: 100, min: 10, max: 5000 }, { key: 'R', label: 'Hole radius', value: 15, min: 1, max: 2000 }],
    make: ({ W, H, R }) => ({ part: { outer: rect(0, 0, W, H), holes: [{ kind: 'circle', c: [W / 2, H / 2], r: R }] }, names: ['Bottom', 'Right end', 'Top', 'Left end', 'Hole'] }),
  },
  {
    id: 'bracket', name: 'L-bracket',
    params: [{ key: 'A', label: 'Width', value: 120, min: 20, max: 5000 }, { key: 'B', label: 'Height', value: 120, min: 20, max: 5000 }, { key: 'T', label: 'Thickness of the arms', value: 30, min: 4, max: 2000 }, { key: 'R', label: 'Bolt hole radius', value: 6, min: 1, max: 500 }],
    make: ({ A, B, T, R }) => ({
      part: { outer: { kind: 'poly', pts: [[0, 0], [A, 0], [A, T], [T, T], [T, B], [0, B]] }, holes: [{ kind: 'circle', c: [T / 2, B - T / 2], r: Math.min(R, T / 2.6) }, { kind: 'circle', c: [A - T / 2, T / 2], r: Math.min(R, T / 2.6) }] },
      names: ['Bottom', 'Right end', 'Top of the arm', 'Inside of the upright', 'Top', 'Left side', 'Top bolt hole', 'End bolt hole'],
    }),
  },
  {
    id: 'hook', name: 'Lifting lug',
    params: [{ key: 'W', label: 'Width', value: 80, min: 10, max: 5000 }, { key: 'H', label: 'Height', value: 100, min: 10, max: 5000 }, { key: 'R', label: 'Pin hole radius', value: 14, min: 1, max: 2000 }],
    make: ({ W, H, R }) => {
      // A plate with a rounded top (half a circle of the width) and the pin hole at its centre.
      const top = H - W / 2, pts: Pt[] = [[0, 0], [W, 0], [W, top]];
      for (let k = 1; k < 24; k++) { const a = (Math.PI * k) / 24; pts.push([W / 2 + (W / 2) * Math.cos(a), top + (W / 2) * Math.sin(a)]); }
      pts.push([0, top]);
      return { part: { outer: { kind: 'poly', pts }, holes: [{ kind: 'circle', c: [W / 2, top], r: Math.min(R, W / 2.4) }] }, names: ['Base', 'Right side', ...Array.from({ length: 24 }, () => 'Rounded top'), 'Left side', 'Pin hole'] };
    },
  },
];

/** The rounded top of the lug is one edge for people (its 24 small sides share a name). */
export function groupedEdges(edges: Edge[]): { label: string; ids: string[] }[] {
  const out: { label: string; ids: string[] }[] = [];
  for (const e of edges) { const g = out.find((x) => x.label === e.label); if (g) g.ids.push(e.id); else out.push({ label: e.label, ids: [e.id] }); }
  return out;
}
