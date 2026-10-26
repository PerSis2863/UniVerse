import type { Gun } from '@/lib/play/ops';
import { RoundedBoxGeometry, THREE } from '../world/core';
import { surface } from '../world/textures';
import { buildGun, type GunRig } from './guns';

// The first-person view (the owner: "a gritty first-person perspective with visible tactical
// hands/gloves… true first-person ADS where the camera smoothly interpolates to align directly with
// the weapon's iron sights or optic reticle… visual camera kick… an animation to slide fresh armor
// plates into the vest"). The gun and two gloved arms live in their own scene in front of their own
// camera. Every frame the gun's pose blends between hip, aimed (its eye point exactly on the
// camera's axis), sprinting (canted low), tactical sprint (raised), and lowered for using kit; on
// top come sway that lags the look, walking bob, recoil that springs back, and the reload, pump,
// bolt, plate, medkit and swap animations. The arms reach for the gun's grips.

type Action = 'none' | 'plate' | 'firstaid' | 'bandage' | 'adrenaline' | 'splint';
const ease = (t: number) => t * t * (3 - 2 * t);
const seg = (t: number, a: number, b: number) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));

let flashTex: THREE.CanvasTexture | null = null;
function flashTexture() {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rad.addColorStop(0, 'rgba(255,250,220,1)'); rad.addColorStop(0.2, 'rgba(255,200,90,0.9)'); rad.addColorStop(0.5, 'rgba(255,120,20,0.35)'); rad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rad; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,220,140,0.8)'; g.lineWidth = 6;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); g.stroke(); }
  flashTex = new THREE.CanvasTexture(c);
  return flashTex;
}

class Arm {
  group = new THREE.Group();
  private sleeve: THREE.Mesh;
  hand: THREE.Group;
  constructor(side: 1 | -1, sleeveMat: THREE.Material, gloveMat: THREE.Material, padMat: THREE.Material) {
    this.sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 1, 12, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), sleeveMat);
    this.group.add(this.sleeve);
    this.hand = new THREE.Group();
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.03, 0.09, 2, 0.012), gloveMat);
    this.hand.add(palm);
    // Fingers curled round the grip, the thumb along the side, a knuckle pad, a cuff.
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.03, 3, 6), gloveMat);
      f.position.set(-0.028 + i * 0.018, -0.026, -0.03); f.rotation.x = 1.1; this.hand.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.035, 3, 6), gloveMat);
    thumb.position.set(0.04 * side, -0.005, -0.02); thumb.rotation.set(0.4, 0, side * 0.9); this.hand.add(thumb);
    const pad = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.012, 0.03, 2, 0.005), padMat); pad.position.set(0, 0.018, -0.03); this.hand.add(pad);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.04, 12).rotateX(Math.PI / 2), padMat); cuff.position.set(0, 0, 0.055); this.hand.add(cuff);
    this.group.add(this.hand);
  }
  /** Places the hand at a point (vm space) and runs the sleeve from the shoulder to it. */
  reach(shoulder: THREE.Vector3, at: THREE.Vector3, q: THREE.Quaternion) {
    this.hand.position.copy(at); this.hand.quaternion.copy(q);
    const wrist = at.clone().add(new THREE.Vector3(0, 0, 0.07).applyQuaternion(q));
    const len = shoulder.distanceTo(wrist);
    this.sleeve.position.copy(wrist); this.sleeve.scale.set(1, 1, len); this.sleeve.lookAt(shoulder);
  }
}

export class Viewmodel {
  group = new THREE.Group();
  /** The gun's parts (muzzle, eye point, magazine…), or null between guns. */
  rig: GunRig | null = null;
  private gunHolder = new THREE.Group();
  private left: Arm; private right: Arm;
  private flash: THREE.Group;
  private flashT = 0;
  private kit = new THREE.Group();
  private kitParts: Record<Exclude<Action, 'none'>, THREE.Object3D>;
  // Animation state.
  ads = 0; sprint = 0; tac = 0; lower = 0;
  private swayX = 0; private swayY = 0; private swayVX = 0; private swayVY = 0;
  private kickZ = 0; private kickP = 0; private kickVZ = 0; private kickVP = 0; private kickR = 0;
  private bob = 0; private dip = 0;
  private reloadT = -1; private reloadDur = 1; private reloadEmpty = false;
  private actionT = -1; private actionDur = 1; private actionKind: Action = 'none';
  private swapT = -1; private pumpT = -1; private pumpDur = 0.5;
  private next: Gun | null = null;
  private scopeTex: THREE.Texture | null;
  private v = { a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler() };
  private shoulderL = new THREE.Vector3(-0.2, -0.36, 0.26); private shoulderR = new THREE.Vector3(0.24, -0.38, 0.22);
  constructor(scene: THREE.Scene, scopeTex: THREE.Texture | null) {
    this.scopeTex = scopeTex;
    const sleeve = surface('fabric', { color: 0x535a3c, rough: 1, bump: 1.2 }), glove = new THREE.MeshStandardMaterial({ color: 0x2b2b27, roughness: 0.75 }), pad = new THREE.MeshStandardMaterial({ color: 0x3d3f36, roughness: 0.6 });
    this.left = new Arm(-1, sleeve, glove, pad); this.right = new Arm(1, sleeve, glove, pad);
    this.group.add(this.gunHolder, this.left.group, this.right.group, this.kit);
    // Muzzle flash: three crossed glowing cards.
    this.flash = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm); p.rotation.set(i === 0 ? 0 : Math.PI / 2, i === 2 ? Math.PI / 2 : 0, 0); this.flash.add(p); }
    this.flash.visible = false;
    // Kit held in the left hand: a plate, a medkit, a bandage roll, a syringe, a splint.
    const mk = (geo: THREE.BufferGeometry, color: number, extra?: (g: THREE.Group) => void) => { const g = new THREE.Group(); g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 }))); extra?.(g); g.visible = false; this.kit.add(g); return g; };
    this.kitParts = {
      plate: mk(new RoundedBoxGeometry(0.24, 0.3, 0.025, 2, 0.02), 0x3a3d42, (g) => { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.04), new THREE.MeshBasicMaterial({ color: 0xd4a017 })); t.position.z = 0.014; g.add(t); }),
      firstaid: mk(new RoundedBoxGeometry(0.16, 0.11, 0.06, 2, 0.01), 0xe8e8e2, (g) => { const r = new THREE.MeshBasicMaterial({ color: 0xc81e1e }); const a = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.02), r), b = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.06), r); a.position.z = b.position.z = 0.031; g.add(a, b); }),
      bandage: mk(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 14).rotateZ(Math.PI / 2), 0xe9e4d6),
      adrenaline: mk(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 10).rotateX(Math.PI / 2), 0xf2c744, (g) => { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.03).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1 })); n.position.z = -0.075; g.add(n); }),
      splint: mk(new RoundedBoxGeometry(0.03, 0.02, 0.26, 2, 0.006), 0x2f6b3a),
    };
    scene.add(this.group);
  }

  /** Puts a gun in the hands (with the lower-and-raise of a swap if one is already out). */
  setGun(gun: Gun, instant = false) {
    if (this.rig && !instant) { this.next = gun; this.swapT = 0; return; }
    this.build(gun);
  }
  private build(gun: Gun) {
    if (this.rig) this.gunHolder.remove(this.rig.group);
    this.rig = buildGun(gun, { scopeTex: this.scopeTex });
    this.rig.group.traverse((o) => { o.castShadow = false; });
    this.gunHolder.add(this.rig.group);
    this.rig.muzzle.add(this.flash);
    if (this.rig.pump) this.rig.pump.userData.z0 = this.rig.pump.position.z;
    if (this.rig.bolt) this.rig.bolt.userData.z0 = this.rig.bolt.position.z;
  }
  /** Where the muzzle is, in the view's own space (x right, y up, −z ahead), for effects in the world. */
  muzzleAt(out: THREE.Vector3) { return this.rig ? this.rig.muzzle.getWorldPosition(out) : out.set(0.15, -0.12, -0.8); }
  portAt(out: THREE.Vector3) { return this.rig ? this.rig.port.getWorldPosition(out) : out.set(0.15, -0.12, -0.4); }
  /** Fires: a kick back and up, the flash, and the pump or bolt to work if it has one. */
  fire(kick: number, cycle = 0) {
    this.kickVZ += 0.9 * kick; this.kickVP += 9 * kick; this.kickR = (Math.random() - 0.5) * 0.06 * kick * 30;
    this.flashT = 0.05; this.flash.rotation.z = Math.random() * Math.PI; this.flash.scale.setScalar(0.7 + Math.random() * 0.7);
    if (cycle > 0) { this.pumpT = 0; this.pumpDur = cycle; }
  }
  hideFlash() { this.flashT = 0; }
  reload(dur: number, empty: boolean) { this.reloadT = 0; this.reloadDur = dur; this.reloadEmpty = empty; }
  cancelReload() { this.reloadT = -1; if (this.rig) { this.rig.mag.position.copy(this.rig.magHome); this.rig.mag.visible = true; } }
  get reloading() { return this.reloadT >= 0; }
  act(kind: Exclude<Action, 'none'>, dur: number) { this.actionKind = kind; this.actionT = 0; this.actionDur = dur; }
  get busy() { return this.actionT >= 0 || this.swapT >= 0; }
  land(power: number) { this.dip = Math.min(0.08, this.dip + power * 0.01); }

  update(dt: number, s: { ads: boolean; speed: number; sprint: boolean; tac: boolean; slide: boolean; lookDX: number; lookDY: number; crouch: boolean; lean: number; breath: number; time: number; adsTime: number }) {
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    const adsRate = 1 / Math.max(0.08, s.adsTime);
    this.ads += ((s.ads && !this.busy && this.reloadT < 0.15 ? 1 : 0) - this.ads) * Math.min(1, dt * adsRate * 3.2);
    this.sprint += ((s.sprint && !s.tac ? 1 : 0) - this.sprint) * k(9);
    this.tac += ((s.tac ? 1 : 0) - this.tac) * k(10);
    this.lower += ((this.actionT >= 0 ? 1 : 0) - this.lower) * k(10);
    // Sway: the gun lags behind the look and springs back; less when aiming.
    const swayK = 1 - this.ads * 0.8;
    this.swayVX += (-s.lookDX * 0.9 * swayK - this.swayX * 90) * dt; this.swayVY += (-s.lookDY * 0.9 * swayK - this.swayY * 90) * dt;
    this.swayVX *= Math.exp(-14 * dt); this.swayVY *= Math.exp(-14 * dt);
    this.swayX += this.swayVX * dt; this.swayY += this.swayVY * dt;
    // Recoil springs (stiff, well damped).
    this.kickVZ += (-this.kickZ * 260) * dt; this.kickVP += (-this.kickP * 240) * dt;
    this.kickVZ *= Math.exp(-22 * dt); this.kickVP *= Math.exp(-20 * dt);
    this.kickZ += this.kickVZ * dt; this.kickP += this.kickVP * dt; this.kickR *= Math.exp(-12 * dt);
    // Walking bob, bigger sprinting; breathing sway when still.
    this.bob += dt * (s.speed > 0.3 ? 4 + s.speed * 1.3 : 0);
    const bobA = Math.min(1, s.speed / 6) * (1 - this.ads * 0.85), bx = Math.sin(this.bob) * 0.012 * bobA, by = -Math.abs(Math.cos(this.bob)) * 0.012 * bobA;
    const br = s.breath * (1 - this.ads * 0.7);
    this.dip *= Math.exp(-8 * dt);

    const rig = this.rig, P = this.v.a.set(0.16, -0.16, -0.36), R = this.v.e.set(0, 0.03, 0);
    // Aimed: the eye point on the axis, a little in front of the eye.
    if (rig && this.ads > 0.001) {
      const e = rig.eye.position, relief = rig.zoom > 3 ? 0.07 : 0.11;
      P.lerp(this.v.b.set(-e.x, -e.y, -relief - e.z), ease(this.ads));
      R.y *= 1 - this.ads;
    }
    // Sprinting canted low, tactical sprint raised, kit lowers it out of sight.
    P.add(this.v.b.set(-0.04 * this.sprint, -0.07 * this.sprint, 0.04 * this.sprint)); R.x += -0.35 * this.sprint; R.y += 0.75 * this.sprint; R.z += 0.45 * this.sprint;
    P.add(this.v.b.set(-0.06 * this.tac, 0.05 * this.tac, 0.06 * this.tac)); R.x += 1.05 * this.tac; R.y += 0.35 * this.tac; R.z += 0.35 * this.tac;
    P.y -= 0.32 * this.lower; R.x -= 0.5 * this.lower;
    if (s.slide) { R.z += 0.25; P.x -= 0.03; }
    // Reload: tilt, magazine out, hand away and back with a fresh one, in, charging handle if empty.
    let leftTarget: THREE.Vector3 | null = null;
    if (this.reloadT >= 0 && rig) {
      this.reloadT += dt / this.reloadDur;
      const t = this.reloadT;
      const tilt = seg(t, 0, 0.15) * (1 - seg(t, 0.85, 1));
      R.z += 0.55 * tilt; R.x += 0.25 * tilt; P.y -= 0.03 * tilt; P.x -= 0.02 * tilt;
      const out = seg(t, 0.12, 0.32), back = seg(t, 0.5, 0.72);
      rig.mag.position.copy(rig.magHome).add(this.v.b.set(0, -0.35 * out * (1 - back), 0.02 * out * (1 - back)));
      rig.mag.visible = t < 0.33 || t > 0.5;
      leftTarget = this.v.b.copy(rig.mag.position).add(new THREE.Vector3(0, -0.06, 0));
      if (t > 0.3 && t < 0.52) leftTarget.y -= 0.25 * Math.sin(((t - 0.3) / 0.22) * Math.PI);
      if (this.reloadEmpty && t > 0.75 && t < 0.92) { const pull = Math.sin(((t - 0.75) / 0.17) * Math.PI); P.z += 0.02 * pull; R.z -= 0.15 * pull; }
      if (t >= 1) { this.reloadT = -1; rig.mag.position.copy(rig.magHome); rig.mag.visible = true; }
    }
    // A swap: down, change, up.
    if (this.swapT >= 0) {
      this.swapT += dt / 0.55;
      const d = this.swapT < 0.45 ? seg(this.swapT, 0, 0.45) : 1 - seg(this.swapT, 0.45, 1);
      P.y -= 0.35 * d; R.x -= 0.6 * d;
      if (this.swapT >= 0.45 && this.next) { this.build(this.next); this.next = null; }
      if (this.swapT >= 1) this.swapT = -1;
    }
    // The pump or bolt after a shot.
    if (this.pumpT >= 0 && rig) {
      this.pumpT += dt / this.pumpDur;
      const w = Math.sin(Math.min(1, this.pumpT) * Math.PI);
      if (rig.pump) rig.pump.position.z = rig.pump.userData.z0 + 0.07 * w;
      if (rig.bolt) { rig.bolt.rotation.z = 1.2 * Math.min(1, w * 2); rig.bolt.position.z = rig.bolt.userData.z0 + 0.05 * Math.max(0, w - 0.3); }
      if (this.pumpT >= 1) this.pumpT = -1;
    }

    // Put it together.
    this.gunHolder.position.set(P.x + this.swayX * 0.6 + bx + Math.sin(s.time * 1.3) * 0.0015 * br, P.y + this.swayY * 0.6 + by - this.dip + Math.sin(s.time * 1.9) * 0.0012 * br, P.z + this.kickZ);
    this.gunHolder.rotation.set(R.x + this.kickP + this.swayY * 1.5, R.y + this.swayX * 1.5, R.z + this.kickR + this.swayX * 0.8 - s.lean * 0.12 * (1 - this.ads));
    this.group.rotation.z = 0;
    // Arms: the right on the grip, the left on the foregrip (or on the magazine during a reload).
    if (rig) {
      this.gunHolder.updateMatrixWorld(true);
      const grip = rig.grip.getWorldPosition(new THREE.Vector3()), fore = (leftTarget ? this.gunHolder.localToWorld(leftTarget.clone()) : rig.fore.getWorldPosition(new THREE.Vector3()));
      const q = this.gunHolder.getWorldQuaternion(this.v.q);
      this.right.reach(this.shoulderR, grip.add(new THREE.Vector3(0.012, 0.0, 0.02).applyQuaternion(q)), q);
      if (this.actionT < 0) this.left.reach(this.shoulderL, fore.add(new THREE.Vector3(-0.01, -0.012, 0).applyQuaternion(q)), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.5))));
    }
    // Kit in the left hand while it's used.
    for (const p of Object.values(this.kitParts)) p.visible = false;
    if (this.actionT >= 0) {
      this.actionT += dt / this.actionDur;
      const t = Math.min(1, this.actionT), kind = this.actionKind as Exclude<Action, 'none'>, part = this.kitParts[kind];
      part.visible = true;
      const up = seg(t, 0, 0.25) * (1 - seg(t, 0.8, 1));
      let at = new THREE.Vector3(-0.05, -0.5 + 0.38 * up, -0.34);
      if (kind === 'plate') at = new THREE.Vector3(-0.02, -0.5 + 0.36 * seg(t, 0, 0.35) - 0.45 * seg(t, 0.55, 0.9), -0.36 + 0.1 * seg(t, 0.55, 0.9));
      if (kind === 'adrenaline') at = new THREE.Vector3(-0.05, -0.2 - 0.35 * seg(t, 0.45, 0.6), -0.32);
      part.position.copy(at); part.rotation.set(kind === 'plate' ? -0.3 + 0.9 * seg(t, 0.55, 0.9) : 0.2, 0.3, 0);
      this.left.reach(this.shoulderL, at.clone().add(new THREE.Vector3(0.02, -0.05, 0.03)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.3, -0.4)));
      if (this.actionT >= 1) { this.actionT = -1; this.actionKind = 'none'; }
    }
    // The flash lasts a frame or three.
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
  }
}
