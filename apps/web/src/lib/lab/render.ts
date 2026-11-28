// Hyperion's camera pictures of a driving scenario (M577, the owner, 27 Nov: the automated-driving page's "visualize and
// label… data", its Ground Truth Labeler): what a pinhole camera on the ego vehicle sees at a moment (sky, ground,
// roads and their markings, the actors as shaded cuboids, nearest drawn last), and the true labels that come with it:
// each actor's box in the picture and how much of it can be seen. Pure: an RGB buffer and an id buffer.

import * as S from './scenario';

export interface CameraSpec { mount?: [number, number, number]; yaw?: number; pitch?: number; fov?: number; width?: number; height?: number }
export interface Label { truth: number; cls: S.ActorClass; box: [number, number, number, number]; visible: number }
type V3 = [number, number, number];
const CLASS_RGB: Record<S.ActorClass, V3> = { car: [113, 113, 122], truck: [87, 83, 78], pedestrian: [234, 88, 12], bicycle: [8, 145, 178] };

/** Fills a convex polygon (pixel coordinates) into the buffers, writing colour and id where it is drawn. */
function fill(rgb: Uint8ClampedArray, ids: Int32Array, W: number, H: number, poly: [number, number][], c: V3, id: number) {
  if (poly.length < 3) return 0;
  let y0 = Infinity, y1 = -Infinity; for (const p of poly) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  let n = 0;
  for (let y = Math.max(0, Math.ceil(y0 - 0.5)); y <= Math.min(H - 1, Math.floor(y1 - 0.5)); y++) {
    const yc = y + 0.5; let xl = Infinity, xr = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) { const x = ax + ((yc - ay) / (by - ay)) * (bx - ax); xl = Math.min(xl, x); xr = Math.max(xr, x); }
    }
    for (let x = Math.max(0, Math.ceil(xl - 0.5)); x <= Math.min(W - 1, Math.floor(xr - 0.5)); x++) { const k = y * W + x; rgb[3 * k] = c[0]; rgb[3 * k + 1] = c[1]; rgb[3 * k + 2] = c[2]; ids[k] = id; n++; }
  }
  return n;
}
/** The picture at step k of a run, and the labels: each non-ego actor in view, its box [x y w h] (pixels, from the
 *  top left) and the share of its drawn area left uncovered by nearer things. */
export function cameraImage(run: S.Run, k: number, ego: number, cam: CameraSpec = {}) {
  const W = cam.width ?? 640, H = cam.height ?? 360, fov = ((cam.fov ?? 70) * Math.PI) / 180, f = W / 2 / Math.tan(fov / 2);
  const e = run.poses[ego][k], m = cam.mount ?? [1.9, 0, 1.3], yaw = e.yaw + ((cam.yaw ?? 0) * Math.PI) / 180, pitch = ((cam.pitch ?? 2) * Math.PI) / 180;
  const cx0 = e.x + m[0] * Math.cos(e.yaw) - m[1] * Math.sin(e.yaw), cy0 = e.y + m[0] * Math.sin(e.yaw) + m[1] * Math.cos(e.yaw), cz0 = m[2];
  const cY = Math.cos(yaw), sY = Math.sin(yaw), cP = Math.cos(pitch), sP = Math.sin(pitch);
  // world → camera: forward, right, up (pitched down by `pitch`)
  const toCam = (x: number, y: number, z: number): V3 => { const dx = x - cx0, dy = y - cy0, dz = z - cz0, fw = dx * cY + dy * sY, rt = dx * sY - dy * cY; return [fw * cP - dz * sP, rt, fw * sP + dz * cP]; };
  const NEAR = 0.3, proj = (p: V3): [number, number] => [W / 2 + (f * p[1]) / p[0], H / 2 - (f * p[2]) / p[0]];
  /** A polygon in the camera frame cut at the near plane, then projected. */
  const project = (pts: V3[]) => {
    const out: V3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ina = a[0] >= NEAR, inb = b[0] >= NEAR;
      if (ina) out.push(a);
      if (ina !== inb) { const t = (NEAR - a[0]) / (b[0] - a[0]); out.push([NEAR, a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]); }
    }
    return out.map(proj);
  };
  const rgb = new Uint8ClampedArray(W * H * 3), ids = new Int32Array(W * H).fill(-1);
  // sky and ground split at the horizon (pitched)
  const horizon = H / 2 - f * Math.tan(-pitch);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k2 = 3 * (y * W + x), sky = y < horizon, t = sky ? y / Math.max(1, horizon) : 0; const c: V3 = sky ? [150 + 60 * t, 190 + 40 * t, 235] : [196, 214, 186]; rgb[k2] = c[0]; rgb[k2 + 1] = c[1]; rgb[k2 + 2] = c[2]; }
  // the roads: strips between their edges, then the markings, far to near
  const strips: { d: number; poly: V3[]; c: V3 }[] = [];
  for (const rd of run.roads) {
    const B = S.laneBoundaries(rd), L = B[B.length - 1], R = B[0];
    for (let i = 0; i + 1 < rd.x.length; i += 2) {
      const j = Math.min(rd.x.length - 1, i + 2), q = [toCam(L.x[i], L.y[i], 0), toCam(L.x[j], L.y[j], 0), toCam(R.x[j], R.y[j], 0), toCam(R.x[i], R.y[i], 0)];
      if (q.every((p) => p[0] < NEAR) || q.some((p) => p[0] > 300)) continue;
      strips.push({ d: Math.max(...q.map((p) => p[0])), poly: q, c: [150, 154, 160] });
    }
    for (const bd of B) for (let i = 0; i + 1 < bd.x.length; i++) {
      if (!bd.solid && Math.floor(i / 6) % 2) continue;
      const hx = -Math.sin(rd.h[i]) * 0.08, hy = Math.cos(rd.h[i]) * 0.08, q = [toCam(bd.x[i] - hx, bd.y[i] - hy, 0.01), toCam(bd.x[i + 1] - hx, bd.y[i + 1] - hy, 0.01), toCam(bd.x[i + 1] + hx, bd.y[i + 1] + hy, 0.01), toCam(bd.x[i] + hx, bd.y[i] + hy, 0.01)];
      if (q.every((p) => p[0] < NEAR) || q.some((p) => p[0] > 200)) continue;
      strips.push({ d: Math.max(...q.map((p) => p[0])) - 0.01, poly: q, c: [245, 245, 245] });
    }
  }
  strips.sort((a, b) => b.d - a.d).forEach((s) => fill(rgb, ids, W, H, project(s.poly), s.c, -2));
  // the actors, far to near, their faces far to near; ids keep who is in front at each pixel
  const order = run.poses.map((p, i) => ({ i, d: toCam(p[k].x, p[k].y, 0)[0] })).filter((o) => o.i !== ego && o.d > NEAR - 10).sort((a, b) => b.d - a.d);
  const area = new Map<number, number>(), boxes = new Map<number, [number, number, number, number]>();
  for (const { i } of order) {
    const a = run.actors[i], C = S.corners(a, run.poses[i][k]), col = CLASS_RGB[a.cls];
    const faces: { d: number; pts: V3[]; shade: number }[] = [[0, 1], [1, 2], [2, 3], [3, 0]].map(([p, q], fi) => { const pts = [toCam(C[p][0], C[p][1], 0), toCam(C[q][0], C[q][1], 0), toCam(C[q][0], C[q][1], a.H), toCam(C[p][0], C[p][1], a.H)]; return { d: Math.max(...pts.map((v) => v[0])), pts, shade: 0.7 + 0.08 * fi }; });
    faces.push({ d: -Infinity, pts: C.map(([x, y]) => toCam(x, y, a.H)), shade: 1.1 });
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const fc of faces.sort((x, y) => y.d - x.d)) {
      const poly = project(fc.pts); if (poly.length < 3) continue;
      for (const [px, py] of poly) { bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py); }
      fill(rgb, ids, W, H, poly, col.map((c) => Math.min(255, c * fc.shade)) as V3, i);
    }
    // its own pixels before anything nearer is drawn (its faces overlap each other: count each pixel once)
    let n = 0; for (let p = 0; p < ids.length; p++) if (ids[p] === i) n++;
    if (n > 0) { area.set(i, n); boxes.set(i, [Math.max(0, bx0), Math.max(0, by0), Math.min(W, bx1), Math.min(H, by1)]); }
  }
  // what is left showing of each: its pixels that nothing nearer covered
  const shown = new Map<number, number>(); for (let p = 0; p < ids.length; p++) if (ids[p] >= 0) shown.set(ids[p], (shown.get(ids[p]) ?? 0) + 1);
  const labels: Label[] = [...boxes].map(([i, [x0, y0, x1, y1]]) => ({ truth: i, cls: run.actors[i].cls, box: [x0, y0, x1 - x0, y1 - y0] as [number, number, number, number], visible: Math.min(1, (shown.get(i) ?? 0) / (area.get(i) ?? 1)) })).filter((l) => l.box[2] > 1 && l.box[3] > 1);
  return { rgb, ids, width: W, height: H, labels };
}
/** A box moved linearly between two keyframes' boxes (the labeller's interpolation), for frame k between ka and kb. */
export const interpolateBox = (a: number[], b: number[], ka: number, kb: number, k: number) => a.map((v, i) => v + ((b[i] - v) * (k - ka)) / (kb - ka || 1));
