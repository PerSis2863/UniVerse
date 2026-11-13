// M172: points that would pile up on a map join into one group with a count (the owner, 13 Nov: "make
// it detailing"), worked out on screen each frame, so groups split as the map is zoomed in. Points
// are taken in the order given (most important first): each joins the nearest group within `r`
// pixels of its first point, or starts one. The group sits at its members' middle.

export interface Group<T> { x: number; y: number; items: T[] }

export function groupNear<T>(pts: { item: T; x: number; y: number }[], r: number): Group<T>[] {
  const cells = new Map<string, { g: Group<T>; ax: number; ay: number; sx: number; sy: number }[]>();
  const all: { g: Group<T>; ax: number; ay: number; sx: number; sy: number }[] = [];
  for (const p of pts) {
    const cx = Math.floor(p.x / r), cy = Math.floor(p.y / r);
    let best: (typeof all)[number] | null = null, bd = r;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const c of cells.get(`${cx + dx},${cy + dy}`) ?? []) { const d = Math.hypot(c.ax - p.x, c.ay - p.y); if (d < bd) { bd = d; best = c; } }
    }
    if (best) { best.g.items.push(p.item); best.sx += p.x; best.sy += p.y; continue; }
    const c = { g: { x: p.x, y: p.y, items: [p.item] }, ax: p.x, ay: p.y, sx: p.x, sy: p.y };
    all.push(c);
    const key = `${cx},${cy}`;
    const list = cells.get(key);
    if (list) list.push(c); else cells.set(key, [c]);
  }
  return all.map((c) => ({ ...c.g, x: c.sx / c.g.items.length, y: c.sy / c.g.items.length }));
}
