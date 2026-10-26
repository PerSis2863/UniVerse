import { RoundedBoxGeometry, THREE } from '../world/core';
import { surface } from '../world/textures';

// The aircraft and drops of Ridgeline Ops (the owner: "High-Value Supply Drops parachuting from
// C-130 planes… the helicopter physically lands, opens its side doors, and the player must board
// it… reinforcement trucks or helicopters… mortar strikes"): a utility helicopter (ours in green,
// theirs in grey) with spinning rotors and sliding doors, a four-engine cargo plane, a crate under
// a parachute, and a mortar barrage. Each is a model and a small state machine the game drives.

export class Heli {
  group = new THREE.Group();
  private rotor = new THREE.Group(); private tail = new THREE.Group();
  private doors: THREE.Mesh[] = [];
  /** 0 closed … 1 open. */
  doorOpen = 0;
  spin = 1;
  constructor(enemy = false) {
    const skin = surface('panels', { color: enemy ? 0x45484c : 0x46503a, metal: 0.5, rough: 0.55 }), dark = new THREE.MeshStandardMaterial({ color: 0x18191b, metalness: 0.6, roughness: 0.45 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0c1520, metalness: 0.95, roughness: 0.06, envMapIntensity: 1.6 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], parent: THREE.Object3D = this.group) => { const m = new THREE.Mesh(geo, mat); m.position.set(...at); m.castShadow = true; parent.add(m); return m; };
    add(new RoundedBoxGeometry(2.4, 2.1, 6.2, 3, 0.7), skin, [0, 1.85, 0]);
    const nose = add(new THREE.SphereGeometry(1.2, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass, [0, 1.75, -2.85]); nose.rotation.x = -Math.PI / 2; nose.scale.set(0.95, 1, 0.75);
    add(new THREE.BoxGeometry(0.6, 0.65, 6.6), skin, [0, 2.35, 6]);
    add(new THREE.BoxGeometry(0.14, 2, 1.3), skin, [0, 3.2, 9.1]);
    add(new THREE.BoxGeometry(2.4, 0.1, 0.8), skin, [0, 2.4, 8.2]);
    for (const x of [-1.25, 1.25]) { add(new THREE.CylinderGeometry(0.07, 0.07, 4.8).rotateX(Math.PI / 2), dark, [x, 0.12, 0.2]); for (const z of [-1.1, 1.4]) add(new THREE.BoxGeometry(0.09, 0.75, 0.09), dark, [x, 0.48, z]); }
    add(new RoundedBoxGeometry(1.7, 0.75, 2.9, 2, 0.28), skin, [0, 3.25, 0.4]); // engines
    for (const x of [-0.6, 0.6]) add(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 14).rotateX(Math.PI / 2), dark, [x, 3.25, 2.05]); // exhausts
    // The cabin's side openings (dark inside) and the doors that slide back over the fuselage.
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.02, 1.35, 1.9), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1 }), [s * 1.205, 1.9, 0.2]);
      this.doors.push(add(new THREE.BoxGeometry(0.06, 1.4, 1.95), skin, [s * 1.24, 1.9, 0.2]));
    }
    this.rotor.position.set(0, 3.75, 0.3); this.group.add(this.rotor);
    for (let i = 0; i < 4; i++) { const b = add(new THREE.BoxGeometry(0.36, 0.05, 7.6).translate(0, 0, 3.8), dark, [0, 0, 0], this.rotor); b.rotation.y = (i * Math.PI) / 2; }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(7.6, 40), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; this.rotor.add(disc);
    this.tail.position.set(0.2, 3.3, 9.15); this.group.add(this.tail);
    for (let i = 0; i < 2; i++) { const b = add(new THREE.BoxGeometry(0.04, 1.6, 0.2), dark, [0, 0, 0], this.tail); b.rotation.x = (i * Math.PI) / 2; }
    this.group.rotation.order = 'YXZ';
  }
  update(dt: number) {
    this.rotor.rotation.y += dt * 24 * this.spin; this.tail.rotation.x += dt * 38 * this.spin;
    this.doors.forEach((d) => { d.position.z = 0.2 + this.doorOpen * 1.9; });
  }
}

/** A path the helicopter flies: from, to, over `dur` seconds, eased; then it hovers or lands. */
export interface Flight { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number }
export function flyAlong(h: Heli, f: Flight, t: number) {
  const k = Math.min(1, Math.max(0, (t - f.t0) / f.dur)), e = 1 - Math.pow(1 - k, 3);
  const prev = h.group.position.clone();
  h.group.position.lerpVectors(f.from, f.to, e);
  const v = h.group.position.clone().sub(prev);
  if (v.lengthSq() > 1e-6) h.group.rotation.y = Math.atan2(v.x, v.z) + Math.PI;
  h.group.rotation.x = -Math.min(0.25, v.length() * 2) * (1 - e * e);
  return k;
}

export class Plane {
  group = new THREE.Group();
  private props: THREE.Mesh[] = [];
  constructor() {
    const skin = surface('panels', { color: 0x5b6150, metal: 0.4, rough: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: 0x1d1e20 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...at); this.group.add(m); return m; };
    add(new THREE.CapsuleGeometry(2.2, 22, 8, 16).rotateX(Math.PI / 2), skin, [0, 0, 0]);
    add(new THREE.BoxGeometry(40, 0.5, 4.2), skin, [0, 1.6, -1]);
    add(new THREE.BoxGeometry(12, 0.35, 2.6), skin, [0, 3, 12]);
    add(new THREE.BoxGeometry(0.35, 6, 3.2), skin, [0, 4.6, 12.4]);
    for (const x of [-13, -7, 7, 13]) { add(new THREE.CylinderGeometry(0.75, 0.75, 3.2, 14).rotateX(Math.PI / 2), skin, [x, 0.9, -2.6]); this.props.push(add(new THREE.BoxGeometry(4, 0.2, 0.15), dark, [x, 0.9, -4.3])); }
  }
  update(dt: number) { for (const p of this.props) p.rotation.z += dt * 30; }
}

/** A supply crate swinging down under a parachute. */
export class Chute {
  group = new THREE.Group();
  canopy: THREE.Mesh;
  constructor() {
    this.canopy = new THREE.Mesh(new THREE.SphereGeometry(3.2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0x6b7a3a, roughness: 0.9, side: THREE.DoubleSide }));
    this.canopy.position.y = 6; this.group.add(this.canopy);
    const lines = new THREE.BufferGeometry().setFromPoints([...Array(8)].flatMap((_, i) => { const a = (i / 8) * Math.PI * 2; return [new THREE.Vector3(Math.cos(a) * 2.6, 6.6, Math.sin(a) * 2.6), new THREE.Vector3(0, 0.9, 0)]; }));
    this.group.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x222222 })));
  }
}

/** Shells falling round a point: when each lands. */
export function barrage(at: THREE.Vector3, t: number) {
  return Array.from({ length: 6 }, (_, i) => ({ t: t + 3 + i * 0.9 + Math.random() * 0.4, at: new THREE.Vector3(at.x + (Math.random() - 0.5) * 22, 0, at.z + (Math.random() - 0.5) * 22), whistled: false }));
}
