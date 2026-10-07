import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';

// Drawing what AI on boards (Stage 4 · 3.5, src/server/board-ai.ts) sends back, as Excalidraw
// elements placed to the right of what's already on the board.

type Origin = { x: number; y: number };
const NOTE_COLORS = ['#fff3bf', '#d3f9d8', '#d0ebff', '#ffe3e3', '#e5dbff', '#ffe8cc'];

const box = (id: string, x: number, y: number, width: number, height: number, text: string, bg: string, fontSize = 18, extra: Partial<ExcalidrawElementSkeleton> = {}) =>
  ({ id, type: 'rectangle', x, y, width, height, backgroundColor: bg, fillStyle: 'solid', strokeColor: '#495057', roundness: { type: 3 }, label: { text, fontSize }, ...extra }) as ExcalidrawElementSkeleton;
const arrow = (from: string, to: string, x: number, y: number) =>
  ({ type: 'arrow', x, y, strokeColor: '#868e96', start: { id: from }, end: { id: to } }) as unknown as ExcalidrawElementSkeleton;
const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);

/** Columns of sticky notes, one per theme, each under its name. */
export function drawThemes(themes: { name: string; notes: number[] }[], texts: string[]) {
  return (o: Origin): ExcalidrawElementSkeleton[] => {
    const out: ExcalidrawElementSkeleton[] = [];
    themes.forEach((t, c) => {
      const x = o.x + c * 300;
      out.push({ type: 'text', x, y: o.y, text: t.name, fontSize: 28, strokeColor: '#364fc7' } as ExcalidrawElementSkeleton);
      t.notes.forEach((n, r) => out.push(box(uid(), x, o.y + 60 + r * 130, 260, 110, texts[n] ?? '', NOTE_COLORS[c % NOTE_COLORS.length])));
    });
    return out;
  };
}

/** A centre, branches around it, and each branch's ideas further out, joined by arrows. */
export function drawMindMap(map: { center: string; branches: { label: string; ideas: string[] }[] }) {
  return (o: Origin): ExcalidrawElementSkeleton[] => {
    const cx = o.x + 700, cy = o.y + 520;
    const centerId = uid();
    const out: ExcalidrawElementSkeleton[] = [box(centerId, cx - 130, cy - 50, 260, 100, map.center, '#e5dbff', 26, { type: 'ellipse' } as Partial<ExcalidrawElementSkeleton>)];
    const n = map.branches.length;
    map.branches.forEach((b, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const bx = cx + Math.cos(angle) * 340, by = cy + Math.sin(angle) * 260;
      const branchId = uid();
      out.push(box(branchId, bx - 100, by - 35, 200, 70, b.label, NOTE_COLORS[i % NOTE_COLORS.length], 20));
      out.push(arrow(centerId, branchId, cx, cy));
      b.ideas.forEach((idea, j) => {
        const spread = (j - (b.ideas.length - 1) / 2) * 0.32;
        const ix = cx + Math.cos(angle + spread) * 620, iy = cy + Math.sin(angle + spread) * 470;
        const ideaId = uid();
        out.push(box(ideaId, ix - 90, iy - 28, 180, 56, idea, '#f8f9fa', 16));
        out.push(arrow(branchId, ideaId, bx, by));
      });
    });
    return out;
  };
}

/** The summary as a card on the board. */
export function drawSummary(s: { title: string; summary: string; nextSteps: string[] }) {
  return (o: Origin): ExcalidrawElementSkeleton[] => {
    const text = `${s.title}\n\n${s.summary}${s.nextSteps.length ? `\n\nNext steps:\n${s.nextSteps.map((x) => `• ${x}`).join('\n')}` : ''}`;
    const lines = text.split('\n').reduce((t, l) => t + Math.max(1, Math.ceil(l.length / 48)), 0);
    return [box(uid(), o.x, o.y, 560, Math.max(160, lines * 28 + 40), text, '#f1f3f5', 18)];
  };
}

export interface Diagram { title: string; nodes: { id: string; label: string; shape: 'box' | 'round' | 'diamond' | 'ellipse'; row: number; col: number }[]; edges: { from: string; to: string; label: string }[] }
const FILL = { box: '#edf2ff', round: '#e5dbff', diamond: '#fff0f6', ellipse: '#e6fcf5' } as const;
const STROKE = { box: '#4c6ef5', round: '#7950f2', diamond: '#d6336c', ellipse: '#0ca678' } as const;
const CLEAN_FONT = 6; // Nunito: a clean font, unlike the hand-drawn sketch

/** A clean diagram from a sketch (3.5): shapes on a grid, smooth lines, arrows bound to the shapes, its title above. */
export function drawDiagram(d: Diagram) {
  return (o: Origin): ExcalidrawElementSkeleton[] => {
    const COL = 300, ROW = 190, W = 220, H = 88;
    const ids = new Map(d.nodes.map((n) => [n.id, uid()]));
    const centre = new Map<string, { x: number; y: number }>();
    const out: ExcalidrawElementSkeleton[] = [];
    if (d.title) out.push({ type: 'text', x: o.x, y: o.y, text: d.title, fontSize: 28, fontFamily: CLEAN_FONT, strokeColor: '#364fc7' } as ExcalidrawElementSkeleton);
    const top = o.y + (d.title ? 80 : 0);
    for (const n of d.nodes) {
      const w = n.shape === 'diamond' ? 250 : W, h = n.shape === 'diamond' ? 130 : H;
      const cx = o.x + n.col * COL + W / 2, cy = top + n.row * ROW + 65;
      centre.set(n.id, { x: cx, y: cy });
      out.push({
        id: ids.get(n.id), type: n.shape === 'diamond' ? 'diamond' : n.shape === 'ellipse' ? 'ellipse' : 'rectangle',
        x: cx - w / 2, y: cy - h / 2, width: w, height: h, backgroundColor: FILL[n.shape], fillStyle: 'solid', strokeColor: STROKE[n.shape], strokeWidth: 2, roughness: 0,
        ...(n.shape === 'round' || n.shape === 'box' ? { roundness: { type: 3 } } : {}),
        label: { text: n.label, fontSize: 18, fontFamily: CLEAN_FONT },
      } as ExcalidrawElementSkeleton);
    }
    for (const e of d.edges) {
      const a = centre.get(e.from), b = centre.get(e.to);
      if (!a || !b) continue;
      out.push({
        type: 'arrow', x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y, strokeColor: '#495057', strokeWidth: 2, roughness: 0,
        start: { id: ids.get(e.from) }, end: { id: ids.get(e.to) },
        ...(e.label ? { label: { text: e.label, fontSize: 14, fontFamily: CLEAN_FONT } } : {}),
      } as unknown as ExcalidrawElementSkeleton);
    }
    return out;
  };
}
