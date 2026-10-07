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
