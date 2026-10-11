// Auto-framing in calls (Stage 5 · B8.8): where to crop the camera picture so the face stays
// framed (about a third of the height, a little above the middle), zooming at most 2×, and how to
// glide there instead of jumping.

export interface Box { x: number; y: number; w: number; h: number }

/** The crop (same shape as the picture) for a face, or the whole picture when there's none. */
export function frameFor(face: Box | null, W: number, H: number): Box {
  if (!face || face.w <= 0 || face.h <= 0) return { x: 0, y: 0, w: W, h: H };
  const h = Math.min(H, Math.max(H / 2, face.h * 3));
  const w = (h * W) / H;
  const cx = face.x + face.w / 2, cy = face.y + face.h / 2 + face.h * 0.3;
  return { x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - h, cy - h / 2)), w, h };
}

/** A step from `a` towards `b` (t: 0–1). */
export const glide = (a: Box, b: Box, t: number): Box => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });
