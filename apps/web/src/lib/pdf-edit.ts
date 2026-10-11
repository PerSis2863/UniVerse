// The Studio PDF editor (Stage 5 · B9.15): the pure parts. Pages are kept as a list pointing at their
// source (the opened PDF, an added PDF or a picture) with a turn and marks; marks are stored in page
// fractions (0..1) so they stay put at any zoom.

export type MarkKind = 'pen' | 'highlight' | 'text' | 'image' | 'whiteout';
export interface Mark { id: string; kind: MarkKind; color: string; size: number; points?: { x: number; y: number }[]; rect?: { x: number; y: number; w: number; h: number }; text?: string; image?: string }
export interface PageRef { id: string; source: number; index: number; rotation: 0 | 90 | 180 | 270; marks: Mark[] }

/** Moves a page from one place to another. */
export function movePage<T>(pages: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return pages;
  const out = [...pages];
  const [p] = out.splice(from, 1);
  out.splice(to, 0, p);
  return out;
}

/** A quarter turn more (or less). */
export const turn = (r: PageRef['rotation'], dir: 1 | -1): PageRef['rotation'] => (((r + dir * 90) % 360 + 360) % 360) as PageRef['rotation'];

/** "1-3, 5" → [0, 1, 2, 4] (in range, no repeats, in order of first mention). */
export function parseRanges(text: string, count: number): number[] {
  const out: number[] = [];
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= count && !out.includes(i - 1)) out.push(i - 1);
  }
  return out;
}

/** A point in page fractions from a pointer position on the shown page. */
export function toFraction(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }) {
  return { x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)) };
}

/** The mark nearest a point (within a small distance), to remove it. */
export function markAt(marks: Mark[], p: { x: number; y: number }, near = 0.02): Mark | null {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (m.rect) {
      const { x, y, w, h } = m.rect;
      if (p.x >= x - near && p.x <= x + w + near && p.y >= y - near && p.y <= y + h + near) return m;
    } else if (m.points?.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= near)) return m;
  }
  return null;
}

/** Thins a freehand line: drops points closer than `min` to the last kept one. */
export function simplify(points: { x: number; y: number }[], min = 0.002) {
  const out: { x: number; y: number }[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= min) out.push(p);
  }
  return out;
}
