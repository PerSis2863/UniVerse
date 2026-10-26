import * as THREE from 'three';

/** A damped spring in three axes (Hooke's law: acceleration = −stiffness·position − damping·velocity).
 *  Kicks go into `vel`; `pos` swings out and settles back to zero. Stepped in small slices so a slow
 *  frame can't make a stiff spring blow up. */
export class Spring3D {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  constructor(public stiffness: number, public damping: number) {}
  kick(x: number, y: number, z: number) { this.vel.x += x; this.vel.y += y; this.vel.z += z; return this; }
  update(dt: number) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n, k = this.stiffness, c = this.damping, p = this.pos, v = this.vel;
    for (let i = 0; i < n; i++) {
      v.x += (-k * p.x - c * v.x) * h; v.y += (-k * p.y - c * v.y) * h; v.z += (-k * p.z - c * v.z) * h;
      p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
    }
    return this;
  }
  reset() { this.pos.set(0, 0, 0); this.vel.set(0, 0, 0); }
}
