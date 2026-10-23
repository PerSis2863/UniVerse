// Topping up the owner's guide board: the page fills a new board itself and sends it to the room in
// batches, so leaving or losing the connection part-way left a half-filled board that never filled
// again (it only filled an empty one). Each opening now adds back the shapes that never arrived.

type Shape = { id: string; type: string; version: number; isDeleted?: boolean; containerId?: string | null; boundElements?: readonly { id: string; type: string }[] | null };

/**
 * The board's shapes with the missing guide shapes added, or null when nothing is missing. `fresh`
 * is the guide as drawn now (fixed ids, except box labels, which follow their box). Shapes someone
 * deleted stay deleted; a box whose label never arrived is replaced with a newer copy.
 */
export function guideTopUp<T extends Shape>(board: readonly T[], fresh: readonly T[]): T[] | null {
  const have = new Map(board.map((e) => [e.id, e]));
  const redo = new Set<string>();
  for (const e of fresh) {
    if (e.containerId) continue; // a label: comes with its box
    const h = have.get(e.id);
    if (!h) redo.add(e.id);
    else if (!h.isDeleted && h.boundElements?.some((b) => b.type === 'text' && !have.has(b.id))) redo.add(e.id);
  }
  if (!redo.size) return null;
  const add = new Map<string, T>();
  for (const e of fresh) {
    if (!redo.has(e.id) && !(e.containerId && redo.has(e.containerId))) continue;
    const h = have.get(e.id);
    add.set(e.id, h ? { ...e, version: h.version + 1 } : e);
  }
  return [...board.map((e) => add.get(e.id) ?? e), ...[...add.values()].filter((e) => !have.has(e.id))];
}
