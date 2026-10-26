import { groundAt, type OpsMap } from '@/lib/play/ops';
import { THREE } from '../world/core';

// Everything solid in Ridgeline Ops, bucketed on a 16 m grid so moving, the camera, shots and
// sight lines only test the boxes near them, plus the ground (from the height grid).

const CELL = 16;
export class SolidGrid {
  private cells = new Map<number, THREE.Box3[]>();
  private seen = new Set<THREE.Box3>();
  private key = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512);
  private hit = new THREE.Vector3();
  private ray = new THREE.Ray();
  private near: THREE.Box3[] = [];
  private kinds = new WeakMap<THREE.Box3, string>();
  constructor(private m: OpsMap) {}

  /** Adds a solid; `surface` is what it sounds like underfoot (metal, wood, concrete). */
  add(b: THREE.Box3, surface?: string) {
    if (surface) this.kinds.set(b, surface);
    for (let cx = Math.floor(b.min.x / CELL); cx <= Math.floor(b.max.x / CELL); cx++) for (let cz = Math.floor(b.min.z / CELL); cz <= Math.floor(b.max.z / CELL); cz++) {
      const k = this.key(cx, cz), list = this.cells.get(k);
      if (list) list.push(b); else this.cells.set(k, [b]);
    }
  }
  kind(b: THREE.Box3) { return this.kinds.get(b); }
  remove(b: THREE.Box3) { for (const list of this.cells.values()) { const i = list.indexOf(b); if (i >= 0) list.splice(i, 1); } }
  /** The boxes within `r` of a point (into `out`). */
  around(x: number, z: number, r: number, out: THREE.Box3[]) {
    out.length = 0; this.seen.clear();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
      for (const b of this.cells.get(this.key(cx, cz)) ?? []) if (!this.seen.has(b)) { this.seen.add(b); out.push(b); }
    }
    return out;
  }
  /** The boxes near a straight segment (every 12 m along it, one cell either side). */
  along(from: THREE.Vector3, dir: THREE.Vector3, len: number, out: THREE.Box3[]) {
    out.length = 0; this.seen.clear();
    for (let d = 0; d <= len + 12; d += 12) {
      const x = from.x + dir.x * Math.min(d, len), z = from.z + dir.z * Math.min(d, len);
      for (let cx = Math.floor(x / CELL) - 1; cx <= Math.floor(x / CELL) + 1; cx++) for (let cz = Math.floor(z / CELL) - 1; cz <= Math.floor(z / CELL) + 1; cz++) {
        for (const b of this.cells.get(this.key(cx, cz)) ?? []) if (!this.seen.has(b)) { this.seen.add(b); out.push(b); }
      }
    }
    return out;
  }
  ground(x: number, z: number) { return groundAt(this.m.heights, x, z); }
  /** How far a ray goes before it meets a solid or the ground (up to `max`); `normal` gets what it hit. */
  cast(from: THREE.Vector3, dir: THREE.Vector3, max: number, normal?: THREE.Vector3): number {
    let best = max;
    this.ray.set(from, dir);
    for (const b of this.along(from, dir, max, this.near)) {
      if (!this.ray.intersectBox(b, this.hit)) continue;
      const d = this.hit.distanceTo(from);
      if (d < best && d > 0.02) {
        best = d;
        if (normal) {
          // Which face: the axis where the hit point is on the box's edge.
          const e = 1e-3, h = this.hit;
          normal.set(Math.abs(h.x - b.min.x) < e ? -1 : Math.abs(h.x - b.max.x) < e ? 1 : 0, Math.abs(h.y - b.min.y) < e ? -1 : Math.abs(h.y - b.max.y) < e ? 1 : 0, Math.abs(h.z - b.min.z) < e ? -1 : Math.abs(h.z - b.max.z) < e ? 1 : 0);
        }
      }
    }
    // The ground: 1.5 m steps, then halving to find the crossing.
    let prev = 0;
    for (let d = 1.5; d < best; d += 1.5) {
      const y = from.y + dir.y * d;
      if (y < this.ground(from.x + dir.x * d, from.z + dir.z * d)) {
        let lo = prev, hi = d;
        for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (from.y + dir.y * mid < this.ground(from.x + dir.x * mid, from.z + dir.z * mid)) hi = mid; else lo = mid; }
        if (hi < best) { best = hi; if (normal) { const x = from.x + dir.x * hi, z = from.z + dir.z * hi; normal.set(this.ground(x - 0.5, z) - this.ground(x + 0.5, z), 1, this.ground(x, z - 0.5) - this.ground(x, z + 0.5)).normalize(); } }
        break;
      }
      prev = d;
    }
    return best;
  }
  /** Whether two points see each other (nothing solid or the ground between). */
  clear(a: THREE.Vector3, b: THREE.Vector3, dir = new THREE.Vector3()) {
    dir.subVectors(b, a);
    const d = dir.length();
    dir.divideScalar(d || 1);
    return this.cast(a, dir, d) >= d - 0.5;
  }
}
