// Spatial audio in group calls (Stage 5 · B8.6, opt-in): each voice comes from where that person's
// tile is on the screen (left to right), so it's easier to tell who's talking. Kept away from the
// very edges, so nobody is heard in one ear only.

/** Left (−0.8) to right (0.8) for a tile whose middle is at `x`, on a stage from `left` with `width`. */
export function panFor(x: number, left: number, width: number) {
  if (!(width > 0)) return 0;
  const p = ((x - left) / width) * 2 - 1;
  return Math.max(-0.8, Math.min(0.8, Math.round(p * 100) / 100));
}
