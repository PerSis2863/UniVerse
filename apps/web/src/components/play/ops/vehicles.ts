import type { Part } from '@/lib/play/ops';
import { RoundedBoxGeometry, THREE } from '../world/core';
import { surface } from '../world/textures';
import { mergeByMaterial } from './merge';
import type { SolidGrid } from './grid';
import type { Hit, Target } from './weapons';

// Vehicles (the owner: "LTV armored trucks, dirt bikes, and tactical Zodiac boats with enter/exit
// mechanics (F), headlights, fuel gauges, and destructible tires"). Arcade handling: throttle,
// brake and steering along the heading, the body following the ground under its wheels (pitch and
// roll), bumping off what's solid, boats only on water. Fuel burns with the throttle; tyres can be
// shot flat (slower, pulling to one side); enough damage sets it burning and then it blows up.

export type VehicleKind = 'ltv' | 'bike' | 'boat';
const SPEC: Record<VehicleKind, { top: number; accel: number; turn: number; hp: number; wheels: number; seat: [number, number, number]; length: number; width: number; fuelS: number }> = {
  ltv: { top: 24, accel: 7, turn: 0.9, hp: 1400, wheels: 4, seat: [0.5, 1.75, 0.2], length: 5, width: 2.4, fuelS: 300 },
  bike: { top: 30, accel: 11, turn: 1.6, hp: 260, wheels: 2, seat: [0, 1.25, -0.2], length: 2.1, width: 0.8, fuelS: 240 },
  boat: { top: 17, accel: 6, turn: 1.1, hp: 450, wheels: 0, seat: [0, 1.0, -1.2], length: 4.6, width: 2, fuelS: 280 },
};

function ltvModel(camo: number) {
  const g = new THREE.Group(), body = surface('panels', { color: camo, metal: 0.45, rough: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2730, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.75 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], rot?: [number, number, number]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...at); if (rot) m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(new RoundedBoxGeometry(2.3, 0.9, 5, 2, 0.15), body, [0, 0.95, 0]);
  add(new RoundedBoxGeometry(2.15, 1.0, 2.4, 2, 0.12), body, [0, 1.85, -0.2]);
  add(new THREE.BoxGeometry(1.9, 0.6, 0.06), glass, [0, 1.95, -1.42], [0.35, 0, 0]);
  for (const x of [-1.08, 1.08]) add(new THREE.BoxGeometry(0.06, 0.5, 1.4), glass, [x, 1.95, -0.3]);
  add(new RoundedBoxGeometry(2.4, 0.35, 0.3, 2, 0.08), dark, [0, 0.7, -2.6]); // bumper
  add(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20), dark, [0, 2.45, 0.2]); // roof ring
  add(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 18).rotateX(Math.PI / 2), dark, [0, 1.3, 2.62]); // spare tyre
  const lights = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff1c2, emissiveIntensity: 0 });
  for (const x of [-0.75, 0.75]) add(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12).rotateX(Math.PI / 2), lights, [x, 1.15, -2.51]);
  const wheels: THREE.Mesh[] = [], tread = surface('rock', { color: 0x2a2a2a, rough: 1 });
  for (const [x, z] of [[-1.15, -1.6], [1.15, -1.6], [-1.15, 1.6], [1.15, 1.6]]) wheels.push(add(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 20).rotateZ(Math.PI / 2), tread, [x, 0.55, z]));
  return { g, wheels, lights };
}
function bikeModel() {
  const g = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: 0x2b2f2a, metalness: 0.6, roughness: 0.4 }), tank = new THREE.MeshStandardMaterial({ color: 0x5c6b2f, metalness: 0.4, roughness: 0.5 }), rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], rot?: [number, number, number]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...at); if (rot) m.rotation.set(...rot); m.castShadow = true; g.add(m); return m; };
  const wheels = [add(new THREE.TorusGeometry(0.34, 0.09, 8, 20).rotateY(Math.PI / 2), rubber, [0, 0.42, -0.72]), add(new THREE.TorusGeometry(0.34, 0.09, 8, 20).rotateY(Math.PI / 2), rubber, [0, 0.42, 0.7])];
  add(new RoundedBoxGeometry(0.3, 0.25, 0.55, 2, 0.08), tank, [0, 0.95, -0.15]);
  add(new RoundedBoxGeometry(0.26, 0.1, 0.7, 2, 0.04), rubber, [0, 0.98, 0.35]);
  add(new THREE.BoxGeometry(0.08, 0.08, 1.2), frame, [0, 0.72, 0], [0.15, 0, 0]);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.7), frame, [0, 0.7, -0.62], [0.35, 0, 0]);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.7), frame, [0, 1.12, -0.5]).rotation.z = Math.PI / 2;
  add(new RoundedBoxGeometry(0.22, 0.2, 0.3, 2, 0.05), frame, [0, 0.62, 0.05]); // engine
  const lights = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff1c2, emissiveIntensity: 0 });
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12).rotateX(Math.PI / 2), lights, [0, 1.02, -0.78]);
  return { g, wheels, lights };
}
function boatModel() {
  const g = new THREE.Group(), tube = new THREE.MeshStandardMaterial({ color: 0x2f3328, roughness: 0.7 }), floor = new THREE.MeshStandardMaterial({ color: 0x1c1d1a, roughness: 0.9 }), motor = new THREE.MeshStandardMaterial({ color: 0x222426, metalness: 0.5, roughness: 0.4 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], rot?: [number, number, number]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...at); if (rot) m.rotation.set(...rot); m.castShadow = true; g.add(m); return m; };
  for (const x of [-0.8, 0.8]) add(new THREE.CapsuleGeometry(0.28, 3.6, 6, 14).rotateX(Math.PI / 2), tube, [x, 0.35, 0.1]);
  add(new THREE.CapsuleGeometry(0.28, 1.1, 6, 14).rotateZ(Math.PI / 2), tube, [0, 0.35, -1.95]);
  add(new THREE.BoxGeometry(1.4, 0.08, 3.8), floor, [0, 0.15, 0.1]);
  add(new RoundedBoxGeometry(0.35, 0.5, 0.35, 2, 0.06), motor, [0, 0.6, 2.25]);
  add(new THREE.BoxGeometry(0.08, 0.6, 0.12), motor, [0, 0.1, 2.3]);
  const lights = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff1c2, emissiveIntensity: 0 });
  add(new THREE.SphereGeometry(0.06, 8, 6), lights, [0, 0.7, -2.1]);
  return { g, wheels: [] as THREE.Mesh[], lights };
}

export class Vehicle implements Target {
  team = 'foe' as const;
  group = new THREE.Group();
  spec: (typeof SPEC)[VehicleKind];
  pos: THREE.Vector3; yaw: number; speed = 0; steer = 0; fuel = 1; hp: number; tires: number[];
  driver: 'me' | 'ai' | null = null;
  burning = 0; dead = false;
  center = new THREE.Vector3(); radius: number;
  /** Which tyre the last bullet hit (−1 the body). */
  lastTire = -1;
  private wheels: THREE.Mesh[]; private lights: THREE.MeshStandardMaterial;
  private near: THREE.Box3[] = [];
  private box = new THREE.Box3();
  constructor(public id: number, public kind: VehicleKind, x: number, z: number, yaw: number, grid: SolidGrid, enemy = false) {
    this.spec = SPEC[kind];
    const m = kind === 'ltv' ? ltvModel(enemy ? 0x3b3a33 : 0x5c6447) : kind === 'bike' ? bikeModel() : boatModel();
    this.group.add(mergeByMaterial(m.g, new Set(m.wheels))); this.wheels = m.wheels; this.lights = m.lights;
    this.pos = new THREE.Vector3(x, grid.ground(x, z), z); this.yaw = yaw;
    this.hp = this.spec.hp; this.tires = Array.from({ length: this.spec.wheels }, () => 70);
    this.radius = this.spec.length * 0.65;
    this.group.rotation.order = 'YXZ';
    if (kind === 'boat') this.pos.y = 0;
  }
  get flat() { return this.tires.filter((t) => t <= 0).length; }
  /** Bullets: the tyres (spheres) or the body (a box turned with it). */
  trace(origin: THREE.Vector3, dir: THREE.Vector3, len: number): Hit | null {
    if (this.dead) return null;
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert(), o = origin.clone().applyMatrix4(inv), d = dir.clone().transformDirection(inv);
    const ray = new THREE.Ray(o, d), hit = new THREE.Vector3();
    let best: Hit | null = null;
    this.wheels.forEach((w, i) => { if (ray.intersectSphere(new THREE.Sphere(w.position, 0.5), hit)) { const dd = hit.distanceTo(o); if (dd < len && (!best || dd < best.d)) { best = { d: dd, part: 'leg' }; this.lastTire = i; } } });
    this.box.set(new THREE.Vector3(-this.spec.width / 2, 0.3, -this.spec.length / 2), new THREE.Vector3(this.spec.width / 2, this.kind === 'ltv' ? 2.4 : 1.2, this.spec.length / 2));
    if (ray.intersectBox(this.box, hit)) { const dd = hit.distanceTo(o); if (dd < len && (!best || dd < (best as Hit).d)) { best = { d: dd, part: 'body' }; this.lastTire = -1; } }
    return best;
  }
  /** Damage from a bullet or a blast; a tyre if `part` says so. Returns true when it blows up. */
  damage(n: number, part: Part) {
    if (this.dead) return false;
    if (part === 'leg' && this.lastTire >= 0) { this.tires[this.lastTire] = Math.max(0, this.tires[this.lastTire] - n); return false; }
    this.hp -= n * (this.kind === 'ltv' ? 0.5 : 1);
    if (this.hp < this.spec.hp * 0.25 && !this.burning) this.burning = 8;
    if (this.hp <= 0) { this.dead = true; this.speed = 0; return true; }
    return false;
  }
  /** One step: `throttle` −1…1, `steerIn` −1…1; `water` is the water level here. Returns the crash speed if it hit something. */
  drive(dt: number, throttle: number, steerIn: number, grid: SolidGrid, water: (x: number, z: number) => number, night: boolean) {
    const s = this.spec;
    if (this.dead) throttle = 0;
    if (this.fuel <= 0) throttle = Math.min(0, throttle) * 0;
    const top = s.top * (this.flat ? 0.55 : 1) * (this.hp < s.hp * 0.25 ? 0.7 : 1);
    if (throttle) { this.speed += throttle * s.accel * dt; this.fuel = Math.max(0, this.fuel - Math.abs(throttle) * dt / s.fuelS); }
    else this.speed *= Math.exp(-0.8 * dt);
    this.speed = Math.max(-top * 0.35, Math.min(top, this.speed));
    this.steer += ((steerIn + (this.flat ? 0.15 * (this.lastTire % 2 ? 1 : -1) : 0)) - this.steer) * Math.min(1, dt * 6);
    this.yaw -= this.steer * s.turn * dt * Math.min(1, Math.abs(this.speed) / 6) * Math.sign(this.speed || 1);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    let crash = 0;
    // Boats stay on water, cars off deep water.
    const g = grid.ground(nx, nz), wl = water(nx, nz);
    if (this.kind === 'boat' ? g > wl - 0.5 : g < wl - 1.2) { crash = Math.abs(this.speed) * 0.3; this.speed *= -0.2; }
    else {
      // What's solid in the way (above the wheels).
      this.box.set(new THREE.Vector3(nx - s.width / 2, this.pos.y + 0.5, nz - s.width / 2), new THREE.Vector3(nx + s.width / 2, this.pos.y + 2, nz + s.width / 2));
      const front = new THREE.Box3(new THREE.Vector3(nx + fx * s.length * 0.4 - s.width / 2, this.pos.y + 0.5, nz + fz * s.length * 0.4 - s.width / 2), new THREE.Vector3(nx + fx * s.length * 0.4 + s.width / 2, this.pos.y + 2, nz + fz * s.length * 0.4 + s.width / 2));
      const hit = grid.around(nx, nz, s.length, this.near).some((b) => b.max.y > this.pos.y + 0.6 && (b.intersectsBox(this.box) || b.intersectsBox(front)));
      if (hit) { crash = Math.abs(this.speed); this.speed *= -0.25; }
      else { this.pos.x = nx; this.pos.z = nz; }
    }
    // Follow the ground: pitch and roll from where the wheels are.
    if (this.kind === 'boat') { this.pos.y = water(this.pos.x, this.pos.z) - 0.05 + Math.sin(performance.now() / 600 + this.id) * 0.06; this.group.rotation.set(Math.sin(performance.now() / 900) * 0.03 - this.speed * 0.004, this.yaw, this.steer * 0.08); }
    else {
      const L = s.length * 0.4, W = s.width * 0.45, rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const hf = grid.ground(this.pos.x + fx * L, this.pos.z + fz * L), hb = grid.ground(this.pos.x - fx * L, this.pos.z - fz * L), hr = grid.ground(this.pos.x + rx * W, this.pos.z + rz * W), hl = grid.ground(this.pos.x - rx * W, this.pos.z - rz * W);
      const y = (hf + hb + hr + hl) / 4;
      this.pos.y += (y - this.pos.y) * Math.min(1, dt * 12);
      const pitch = Math.atan2(hf - hb, L * 2), roll = Math.atan2(hl - hr, W * 2) + (this.kind === 'bike' ? -this.steer * Math.min(1, Math.abs(this.speed) / 10) * 0.4 : 0);
      this.group.rotation.set(-pitch, this.yaw, roll);
    }
    this.group.position.copy(this.pos);
    for (const w of this.wheels) w.rotation.x -= this.speed * dt / 0.5;
    if (this.kind === 'bike' && this.wheels[0]) this.wheels[0].rotation.y = this.steer * 0.4;
    this.lights.emissiveIntensity = this.driver && night ? 3 : 0;
    this.center.set(this.pos.x, this.pos.y + 1, this.pos.z);
    if (this.burning > 0 && !this.dead) { this.burning -= dt; if (this.burning <= 0) { this.hp = 0; this.dead = true; return -1; } }
    return crash;
  }
  /** Where the player sits (and the camera's anchor). */
  seat(out: THREE.Vector3) { return out.set(...this.spec.seat).applyMatrix4(this.group.matrixWorld); }
  /** A spot beside it to get out at. */
  side(out: THREE.Vector3) { const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); return out.set(this.pos.x - rx * (this.spec.width / 2 + 0.8), this.pos.y, this.pos.z - rz * (this.spec.width / 2 + 0.8)); }
}
