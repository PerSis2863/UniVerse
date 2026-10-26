import type { Gun } from '@/lib/play/ops';
import { RoundedBoxGeometry, THREE } from '../world/core';
import { surface } from '../world/textures';
import { buildGun, type GunRig } from './guns';
import { Spring3D } from './spring';

// The first-person view (the owner: "multi-stage procedural reload & weapon animations… separate
// weapon sub-meshes… articulated fingers and tactical gloves/sleeves… Hooke's law damped springs…
// true 3D aim down sights"). The gun (its receiver, barrel, magazine, bolt carrier, charging handle
// and optic move on their own) and two jointed arms live in their own scene in front of their own
// camera. Each frame the pose is built in layers:
//   1. the stance: hip, aimed (the sight's eye point exactly on the camera's axis), sprint (canted
//      low), tactical sprint (high across the chest, the free arm pumping), lowered for kit;
//   2. the clip being played, keyed in seconds and eased: tactical and empty reloads, inspect, swap
//      out and raise (with a bolt check), plate, meds, grenade throw;
//   3. springs: recoil (kick back, muzzle climb, roll), mouse-look sway with inertia, a camera kick;
//   4. a figure-8 bob timed to the footsteps and slow breathing when still.
// Then each arm reaches its hand target with two-bone IK (shoulder, elbow, wrist) and the fingers
// curl round what they hold. Clips send cues (`onCue`) at their moments for sounds and effects.

export type Kit = 'plate' | 'firstaid' | 'bandage' | 'adrenaline' | 'splint';
export type Throwable = 'frag' | 'flash' | 'smoke';
export type Cue = 'grab' | 'magOut' | 'magDrop' | 'magIn' | 'boltBack' | 'boltSlam' | 'shell' | 'pump' | 'velcro' | 'pin' | 'throw' | 'inject' | 'cloth';
type ClipKind = 'reload' | 'inspect' | 'kit' | 'throw' | 'swapOut' | 'raise';
interface Clip { kind: ClipKind; t: number; len: number; scale: number; empty: boolean; kit: Kit; nade: Throwable; shells: number; fired: Set<string> }

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Eased keyframes: `k` is [[time, value], …] in order; before the first and after the last, they hold. */
function keys(t: number, k: readonly (readonly [number, number])[]) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const [t0, v0] = k[i - 1], [t1, v1] = k[i]; return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0 || 1)); }
  return k[k.length - 1][1];
}
/** The same for points (each key a time and x, y, z). */
function keys3(t: number, k: readonly (readonly [number, number, number, number])[], out: THREE.Vector3) {
  return out.set(keys(t, k.map((q) => [q[0], q[1]] as const)), keys(t, k.map((q) => [q[0], q[2]] as const)), keys(t, k.map((q) => [q[0], q[3]] as const)));
}

let flashTex: [THREE.CanvasTexture, THREE.CanvasTexture] | null = null;
/** The muzzle flash: a spiky star (seen down the barrel) and a flame tongue (seen from the side). */
function flashTextures() {
  if (flashTex) return flashTex;
  const star = document.createElement('canvas'); star.width = star.height = 128;
  const g = star.getContext('2d')!;
  const core = g.createRadialGradient(64, 64, 0, 64, 64, 40);
  core.addColorStop(0, 'rgba(255,252,230,1)'); core.addColorStop(0.3, 'rgba(255,210,110,0.95)'); core.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = core; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + (i % 2) * 0.2, len = i % 2 ? 44 : 62, w = 0.16;
    const sp = g.createLinearGradient(64, 64, 64 + Math.cos(a) * len, 64 + Math.sin(a) * len);
    sp.addColorStop(0, 'rgba(255,230,160,0.95)'); sp.addColorStop(1, 'rgba(255,110,20,0)');
    g.fillStyle = sp; g.beginPath(); g.moveTo(64 + Math.cos(a - w) * 8, 64 + Math.sin(a - w) * 8); g.lineTo(64 + Math.cos(a) * len, 64 + Math.sin(a) * len); g.lineTo(64 + Math.cos(a + w) * 8, 64 + Math.sin(a + w) * 8); g.closePath(); g.fill();
  }
  const side = document.createElement('canvas'); side.width = 64; side.height = 128;
  const h = side.getContext('2d')!;
  for (let y = 0; y < 128; y++) {
    const k = y / 128, width = Math.sin(Math.min(1, k * 1.3) * Math.PI) * 26 * (1 - k * 0.4);
    const lg = h.createLinearGradient(32 - width, 0, 32 + width, 0);
    lg.addColorStop(0, 'rgba(255,120,20,0)'); lg.addColorStop(0.5, `rgba(255,${Math.round(230 - k * 90)},${Math.round(150 - k * 120)},${0.95 - k * 0.6})`); lg.addColorStop(1, 'rgba(255,120,20,0)');
    h.fillStyle = lg; h.fillRect(32 - width, 127 - y, width * 2, 1);
  }
  flashTex = [new THREE.CanvasTexture(star), new THREE.CanvasTexture(side)];
  return flashTex;
}

/** One arm: upper arm and forearm in a baggy camouflage shirt (the sleeve rolled toward the wrist),
 *  a GPS watch on the left wrist, and a tactical glove (padded knuckle guards, a velcro wrist strap)
 *  whose five fingers each have three joints. */
const UPPER = 0.36, FORE = 0.34, Y = new THREE.Vector3(0, 1, 0);
type Finger = { a: THREE.Group; b: THREE.Group; c: THREE.Group };
class Arm {
  group = new THREE.Group();
  hand = new THREE.Group();
  private upper: THREE.Mesh; private fore: THREE.Mesh; private elbow: THREE.Mesh; private roll: THREE.Mesh;
  private fingers: Finger[] = [];
  private thumb: Finger;
  private e = new THREE.Vector3(); private w = new THREE.Vector3(); private d = new THREE.Vector3(); private p = new THREE.Vector3(); private q = new THREE.Quaternion();
  constructor(private side: 1 | -1, m: { sleeve: THREE.Material; glove: THREE.Material; pad: THREE.Material; strap: THREE.Material; steel: THREE.Material; screen: THREE.Material }) {
    const limb = (r0: number, r1: number, mat: THREE.Material) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1, 16, 1).translate(0, 0.5, 0), mat);
    this.upper = limb(0.066, 0.06, m.sleeve); this.fore = limb(0.055, 0.042, m.sleeve);
    this.elbow = new THREE.Mesh(new THREE.SphereGeometry(0.061, 16, 10), m.sleeve);
    // The rolled cuff, thick and folded, most of the way down the forearm.
    this.roll = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 8, 18).rotateX(Math.PI / 2), m.sleeve);
    this.group.add(this.upper, this.elbow, this.fore, this.roll, this.hand);
    // The glove (x across the knuckles, y the back of the hand, fingers toward −z).
    const rb = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);
    const palm = new THREE.Mesh(rb(0.088, 0.036, 0.092, 0.014), m.glove);
    const back = new THREE.Mesh(rb(0.066, 0.01, 0.05, 0.004), m.pad); back.position.set(0, 0.02, 0.008);
    this.hand.add(palm, back);
    for (let i = 0; i < 4; i++) { const k = new THREE.Mesh(rb(0.017, 0.011, 0.015, 0.004), m.pad); k.position.set((-0.03 + i * 0.02) * side, 0.02, -0.037); this.hand.add(k); }
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.044, 0.05, 16).rotateX(Math.PI / 2), m.glove); cuff.position.set(0, 0, 0.066);
    const strap = new THREE.Mesh(rb(0.056, 0.014, 0.026, 0.004), m.strap); strap.position.set(0.004 * side, 0.044, 0.066);
    this.hand.add(cuff, strap);
    const seg = (len: number, r: number) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 10).rotateX(Math.PI / 2).translate(0, 0, -len / 2 - r * 0.4), m.glove);
    const finger = (lens: readonly number[], r: number) => {
      const a = new THREE.Group(), b = new THREE.Group(), c = new THREE.Group();
      a.add(seg(lens[0], r)); b.position.set(0, 0, -lens[0] - r * 0.9); b.add(seg(lens[1], r * 0.93)); a.add(b);
      c.position.set(0, 0, -lens[1] - r * 0.85); c.add(seg(lens[2], r * 0.86)); b.add(c);
      return { a, b, c };
    };
    for (let i = 0; i < 4; i++) {
      // Index on the thumb's side, the little finger shorter.
      const f = finger(i === 3 ? [0.019, 0.014, 0.012] : i === 2 ? [0.024, 0.018, 0.015] : [0.026, 0.019, 0.015], i === 3 ? 0.0088 : 0.0098);
      f.a.position.set((-0.03 + i * 0.02) * side, -0.002, -0.046); this.hand.add(f.a); this.fingers.push(f);
    }
    this.thumb = finger([0.024, 0.02, 0.016], 0.0112);
    this.thumb.a.position.set(-0.043 * side, -0.01, -0.006); this.hand.add(this.thumb.a);
    if (side < 0) {
      // A GPS watch on the left wrist: band, a chunky case with a bezel, a lit screen.
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.024, 18).rotateX(Math.PI / 2), m.strap);
      const face = new THREE.Mesh(rb(0.04, 0.016, 0.044, 0.006), m.pad), bezel = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0028, 6, 20).rotateX(Math.PI / 2), m.steel);
      const screen = new THREE.Mesh(new THREE.CircleGeometry(0.0135, 20).rotateX(-Math.PI / 2), m.screen);
      band.position.set(0, 0, 0.11); face.position.set(0, 0.05, 0.11); bezel.position.set(0, 0.058, 0.11); screen.position.set(0, 0.0585, 0.11);
      this.hand.add(band, face, bezel, screen);
    }
  }
  /** Places the hand and bends the arm to it: `pole` is the way the elbow points. `curl` 0 open … 1 a fist; `trigger` the index finger's own curl. */
  pose(shoulder: THREE.Vector3, at: THREE.Vector3, q: THREE.Quaternion, curl: number, pole: THREE.Vector3, trigger = curl) {
    this.hand.position.copy(at); this.hand.quaternion.copy(q);
    this.fingers.forEach((f, i) => { const c = i === 0 ? trigger : curl + i * 0.03; f.a.rotation.x = -c * 1.05; f.b.rotation.x = -c * 1.3; f.c.rotation.x = -c * 0.95; });
    const t = this.thumb; t.a.rotation.set(-curl * 0.25, this.side * (0.6 + curl * 0.4), 0); t.b.rotation.set(0, this.side * curl * 0.5, 0); t.c.rotation.set(0, this.side * curl * 0.45, 0);
    // Two-bone IK from the shoulder to the wrist (stretching a little if it's out of reach; the shoulders are off screen).
    const W = this.w.set(0, 0, 0.09).applyQuaternion(q).add(at), d = this.d.subVectors(W, shoulder), dist = d.length();
    const k = Math.max(1, dist / ((UPPER + FORE) * 0.985)), a = UPPER * k, b = FORE * k, L = Math.max(Math.abs(a - b) + 1e-4, dist);
    const cosA = (a * a + L * L - b * b) / (2 * a * L), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    d.normalize();
    const perp = this.p.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
    const E = this.e.copy(shoulder).addScaledVector(d, a * cosA).addScaledVector(perp, a * sinA);
    const place = (mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) => {
      const v = new THREE.Vector3().subVectors(to, from), len = v.length();
      mesh.position.copy(from); mesh.quaternion.copy(this.q.setFromUnitVectors(Y, v.divideScalar(len || 1))); mesh.scale.set(1, len, 1);
    };
    place(this.upper, shoulder, E); place(this.fore, E, W);
    this.elbow.position.copy(E);
    this.roll.position.copy(E).lerp(W, 0.62); this.roll.quaternion.copy(this.fore.quaternion);
  }
}

export class Viewmodel {
  group = new THREE.Group();
  /** The gun's parts (muzzle, eye point, magazine…), or null between guns. */
  rig: GunRig | null = null;
  /** Said at each clip's moments (sounds, effects); `magDrop` also gets the falling magazine. */
  onCue: ((cue: Cue) => void) | null = null;
  onMagDrop: ((mag: THREE.Object3D, at: THREE.Vector3, q: THREE.Quaternion) => void) | null = null;
  /** A visual camera bump (radians of pitch, roll) for the game to add to the view. */
  camKick = new Spring3D(260, 20);
  private gunHolder = new THREE.Group();
  private left: Arm; private right: Arm;
  private flash: THREE.Group; private flashT = 0; private flashLight: THREE.PointLight;
  private kit = new THREE.Group();
  private kitParts: Record<Kit | Throwable | 'binoculars', THREE.Group>;
  private pin: THREE.Object3D;
  // Stance weights.
  ads = 0; sprint = 0; tac = 0; binoc = 0;
  private binocWant = false;
  // Springs: the gun's position and rotation (recoil, bumps), and the look sway.
  private posSpring = new Spring3D(900, 45); private rotSpring = new Spring3D(700, 38); private sway = new Spring3D(160, 16);
  private boltT = 1; private boltLocked = false; private triggerT = 1; private pumpT = -1; private pumpDur = 0.5;
  private clip: Clip | null = null;
  private next: Gun | null = null;
  private scopeTex: THREE.Texture | null;
  private v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion(), r: new THREE.Quaternion(), e: new THREE.Euler(), m: new THREE.Matrix4() };
  private shoulderL = new THREE.Vector3(-0.2, -0.3, -0.04); private shoulderR = new THREE.Vector3(0.3, -0.34, 0.06);
  private poleL = new THREE.Vector3(-0.8, -1, 0.3); private poleR = new THREE.Vector3(0.9, -1, 0.3);
  private casings: { m: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3; life: number }[] = []; private casingNext = 0;
  private ring: THREE.Mesh | null = null;
  constructor(scene: THREE.Scene, scopeTex: THREE.Texture | null) {
    this.scopeTex = scopeTex;
    const mats = {
      sleeve: surface('ripstop', { rough: 1, bump: 1.2 }),
      glove: surface('glove', { color: 0x3a3a34, rough: 0.8, bump: 1 }), pad: surface('polymer', { color: 0x2c2d2a, rough: 0.6, bump: 0.8 }),
      strap: surface('fabric', { color: 0x2a2a26, rough: 1, bump: 1.4 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 1, roughness: 0.25 }),
      screen: new THREE.MeshBasicMaterial({ color: 0x2f6b46 }),
    };
    this.left = new Arm(-1, mats); this.right = new Arm(1, mats);
    this.group.add(this.gunHolder, this.left.group, this.right.group, this.kit);
    // Muzzle flash: a star facing back down the barrel and two flame tongues crossed at 45°.
    const [star, side] = flashTextures();
    this.flash = new THREE.Group();
    const fm = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffffff });
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), fm(star)); this.flash.add(cap);
    for (const a of [Math.PI / 4, -Math.PI / 4]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.24).rotateX(-Math.PI / 2).translate(0, 0, -0.11).rotateZ(a), fm(side)); this.flash.add(t); }
    this.flash.visible = false;
    // The flash's light on the hands and gun (always in the scene, so turning it on doesn't rebuild shaders).
    this.flashLight = new THREE.PointLight(0xffaa33, 0, 8, 2); this.group.add(this.flashLight);
    // A rim light from behind and above the gun, so its metal edges, rail ridges and bolts catch highlights.
    const rim = new THREE.DirectionalLight(0xdfe8ff, 2.6); rim.position.set(0.7, 1, -1.6); this.group.add(rim, rim.target);
    // Brass in the view: a few casings that spin out of the port over the gun before the world's own take over.
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.045, 10), new THREE.MeshStandardMaterial({ color: 0xd2a645, metalness: 1, roughness: 0.25 })); c.visible = false; this.group.add(c); this.casings.push({ m: c, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 }); }
    // Kit for the left hand: a curved blue plate, a medkit, a bandage roll, a syringe, a splint; grenades; binoculars.
    const mk = (build: (g: THREE.Group) => void) => { const g = new THREE.Group(); build(g); g.visible = false; this.kit.add(g); return g; };
    const mat = (color: number, rough = 0.6, metal = 0.1) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    let pin: THREE.Object3D = new THREE.Object3D();
    this.kitParts = {
      plate: mk((g) => {
        // A 22 × 28 cm curved ceramic plate with bevelled top corners and STRIKE FACE stencilled on.
        const sh = new THREE.Shape([new THREE.Vector2(-0.11, -0.14), new THREE.Vector2(0.11, -0.14), new THREE.Vector2(0.11, 0.105), new THREE.Vector2(0.075, 0.14), new THREE.Vector2(-0.075, 0.14), new THREE.Vector2(-0.11, 0.105)]);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 1 });
        const pos = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - (pos.getX(i) / 0.11) ** 2 * 0.022);
        geo.computeVertexNormals();
        g.add(new THREE.Mesh(geo, surface('polymer', { color: 0x3f4d61, rough: 0.7, bump: 0.6 })));
        const c = document.createElement('canvas'); c.width = 256; c.height = 64;
        const x = c.getContext('2d')!; x.fillStyle = 'rgba(235,235,230,0.92)'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('STRIKE FACE', 128, 34);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.0375), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
        label.position.set(0, 0.03, 0.0205); g.add(label);
      }),
      firstaid: mk((g) => { g.add(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.11, 0.06, 2, 0.01), mat(0xe8e8e2))); const r = new THREE.MeshBasicMaterial({ color: 0xc81e1e }); const a = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.02), r), b = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.06), r); a.position.z = b.position.z = 0.031; g.add(a, b); }),
      bandage: mk((g) => g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 14).rotateZ(Math.PI / 2), mat(0xe9e4d6, 0.95)))),
      adrenaline: mk((g) => { g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 10).rotateX(Math.PI / 2), mat(0xf2c744, 0.4))); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 10).rotateX(Math.PI / 2), mat(0xe2541c, 0.5)); cap.position.z = 0.07; const n = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.03).rotateX(Math.PI / 2), mats.steel); n.position.z = -0.075; g.add(cap, n); }),
      splint: mk((g) => g.add(new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.02, 0.26, 2, 0.006), mat(0x2f6b3a)))),
      frag: mk((g) => {
        // A fragmentation grenade: olive body, the metal fuse on top, the spoon down its side, the pin and its pull ring.
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.032, 20, 14), surface('polymer', { color: 0x4e5636, rough: 0.75, bump: 0.8 })));
        const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.022, 14), mats.steel); fuse.position.y = 0.036; g.add(fuse);
        const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.062, 0.004), mats.steel); spoon.position.set(0, 0.018, 0.031); spoon.rotation.x = -0.18; g.add(spoon);
        pin = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.03).rotateZ(Math.PI / 2), mats.steel); shaft.position.set(-0.012, 0.038, 0);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 8, 18), mats.steel); ring.position.set(-0.034, 0.038, 0);
        pin.add(shaft, ring); g.add(pin);
      }),
      flash: mk((g) => g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.09, 12), mat(0x9aa0a6, 0.4, 0.5)))),
      smoke: mk((g) => g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.1, 12), mat(0x4b6b44, 0.6, 0.2)))),
      binoculars: mk((g) => { for (const x of [-0.034, 0.034]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.027, 0.11, 14).rotateX(Math.PI / 2), mat(0x2a2c28, 0.8)); t.position.x = x; g.add(t); } const br = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.05), mat(0x1c1d1b)); g.add(br); }),
    };
    this.pin = pin;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 8, 18), mats.steel); this.ring.visible = false; this.group.add(this.ring);
    scene.add(this.group);
  }

  /** Puts a gun in the hands: down and away, then the new one up with a bolt check (or straight in). */
  setGun(gun: Gun, instant = false) {
    if (this.rig && !instant) { this.next = gun; this.play('swapOut', 0.3, 1); return; }
    this.build(gun);
    if (!instant) this.play('raise', 0.55, 1);
  }
  /** The gun comes up from below (deploying, after a menu). */
  raise() { this.play('raise', 0.55, 1); }
  private build(gun: Gun) {
    if (this.rig) this.gunHolder.remove(this.rig.group);
    this.rig = buildGun(gun, { scopeTex: this.scopeTex });
    this.rig.group.traverse((o) => { o.castShadow = false; });
    this.gunHolder.add(this.rig.group);
    this.rig.muzzle.add(this.flash);
    for (const o of [this.rig.pump, this.rig.bolt, this.rig.boltCarrier, this.rig.chargingHandle]) if (o) o.userData.home = o.position.clone();
    this.boltLocked = false;
  }
  private play(kind: ClipKind, len: number, scale: number, o: Partial<Pick<Clip, 'empty' | 'kit' | 'nade' | 'shells'>> = {}) {
    this.clip = { kind, t: 0, len, scale: Math.max(0.05, scale), empty: false, kit: 'plate', nade: 'frag', shells: 1, fired: new Set(), ...o };
  }
  /** Where the muzzle is, in the view's own space (x right, y up, −z ahead), for effects in the world. */
  muzzleAt(out: THREE.Vector3) { return this.rig ? this.rig.muzzle.getWorldPosition(out) : out.set(0.15, -0.12, -0.8); }
  portAt(out: THREE.Vector3) { return this.rig ? this.rig.port.getWorldPosition(out) : out.set(0.15, -0.12, -0.4); }
  /** A shot: the springs kicked (back into the shoulder, the muzzle climbing, a little roll), the bolt
   *  carrier cycling, the flash and its light. `kick` is the gun's recoil next to a carbine's (1). */
  fire(kick: number, cycle = 0, empty = false) {
    const k = Math.min(3.5, kick) * (1 - this.ads * 0.45), r = () => Math.random() - 0.5;
    this.posSpring.kick(r() * 0.25 * k, 0.15 * k, 2.8 * k);
    this.rotSpring.kick(1.4 * k, r() * 0.6 * k, r() * 1.2 * k);
    this.camKick.kick(0.28 * k, r() * 0.1 * k, r() * 0.22 * k);
    if (this.rig && !this.rig.tube && !this.rig.bolt) {
      const c = this.casings[this.casingNext]; this.casingNext = (this.casingNext + 1) % this.casings.length;
      this.rig.port.getWorldPosition(c.m.position); c.m.visible = true; c.life = 0.35;
      c.v.set(1.6 + Math.random() * 0.6, 1 + Math.random() * 0.5, 0.35); c.w.set(18 + Math.random() * 10, 6, 14);
    }
    this.boltT = 0; this.boltLocked = empty && !!this.rig && this.rig.handle === 'slide'; this.triggerT = 0;
    this.flashT = 0.035; this.flash.rotation.z = Math.random() * Math.PI; this.flash.scale.setScalar(0.75 + Math.random() * 0.6);
    this.flashLight.intensity = 3.2;
    if (cycle > 0 && this.rig && (this.rig.pump || this.rig.bolt)) { this.pumpT = 0; this.pumpDur = cycle; }
  }
  hideFlash() { this.flashT = 0; this.flashLight.intensity = 0; }
  /** A reload: tactical (2.1 s for a carbine) or from empty (2.7 s, the magazine dropped and the bolt racked), scaled to the gun's time. */
  reload(dur: number, empty: boolean, shells = 1) {
    if (this.rig?.tube) { const n = Math.max(1, shells); this.play('reload', 0.25 + n * 0.45 + (empty ? 0.55 : 0) + 0.2, dur / (0.25 + n * 0.45 + (empty ? 0.55 : 0) + 0.2), { empty, shells: n }); return; }
    const len = empty ? 2.7 : 2.1;
    this.play('reload', len, dur / len, { empty });
  }
  cancelReload() {
    if (this.clip?.kind !== 'reload') return;
    this.clip = null;
    if (this.rig) { this.rig.mag.position.copy(this.rig.magHome); this.rig.mag.rotation.set(0, 0, 0); this.rig.mag.visible = true; }
  }
  get reloading() { return this.clip?.kind === 'reload'; }
  /** Using kit (plates, meds) for `dur` seconds. */
  act(kind: Kit, dur: number) { const len = kind === 'plate' ? 1.5 : kind === 'adrenaline' ? 1.1 : kind === 'bandage' ? 1.6 : 1.5; this.play('kit', len, dur / len, { kit: kind }); }
  /** A grenade: out, pin pulled, wound up and thrown (`throw` is cued at the release). */
  toss(nade: Throwable) { this.play('throw', 0.85, 1, { nade }); }
  /** Turning the gun over to look at it (I); anything else cuts it short. */
  inspect() { if (!this.clip && this.ads < 0.05 && this.sprint < 0.1) this.play('inspect', 3.5, 1); }
  stopInspect() { if (this.clip?.kind === 'inspect') this.clip = null; }
  /** Binoculars up (marking an airstrike) or down. */
  binoculars(on: boolean) { this.binocWant = on; }
  get busy() { const k = this.clip?.kind; return k === 'kit' || k === 'swapOut' || k === 'raise' || k === 'throw' || this.binoc > 0.05; }
  land(power: number) { this.posSpring.kick(0, -Math.min(1.6, power * 0.35), 0); this.rotSpring.kick(-Math.min(1.2, power * 0.25), 0, 0); }

  update(dt: number, s: { ads: boolean; speed: number; sprint: boolean; tac: boolean; slide: boolean; lookDX: number; lookDY: number; crouch: boolean; lean: number; breath: number; time: number; adsTime: number; gait: number }) {
    const k = (rate: number) => 1 - Math.exp(-rate * dt), rig = this.rig, V = this.v;
    // Aiming moves at the gun's own speed (about 0.18–0.45 s), eased.
    const adsTarget = s.ads && !this.busy && (!this.clip || this.clip.kind === 'inspect') ? 1 : 0;
    if (adsTarget && this.clip?.kind === 'inspect') this.clip = null;
    this.ads = Math.min(1, Math.max(0, this.ads + Math.sign(adsTarget - this.ads) * dt / Math.max(0.08, s.adsTime)));
    const ads = smooth(this.ads);
    this.sprint += ((s.sprint && !s.tac ? 1 : 0) - this.sprint) * k(9);
    this.tac += ((s.tac ? 1 : 0) - this.tac) * k(9);
    this.binoc += ((this.binocWant ? 1 : 0) - this.binoc) * k(8);
    if ((s.sprint || s.tac) && this.clip?.kind === 'inspect') this.clip = null;

    // Springs.
    const swayK = 1 - ads * 0.8;
    this.sway.vel.y += -s.lookDX * 5 * swayK; this.sway.vel.x += -s.lookDY * 5 * swayK;
    this.sway.update(dt); this.posSpring.update(dt); this.rotSpring.update(dt); this.camKick.update(dt);
    // Bob: a figure 8 on the footsteps (lowest as each foot lands), bigger sprinting; breathing when still.
    const phi = s.gait * Math.PI, A = Math.min(1, s.speed / 5) * (1 + this.sprint * 0.9 + this.tac * 1.5) * (1 - ads * 0.85);
    const bx = Math.sin(phi) * 0.011 * A, by = -Math.cos(2 * phi) * 0.0065 * A, broll = Math.sin(phi) * 0.025 * A;
    const br = s.breath * (1 - ads * 0.7) * (1 - Math.min(1, s.speed / 2) * 0.7);
    const breathX = Math.sin(s.time * 0.9) * 0.0016 * br, breathY = Math.sin(s.time * 1.8) * 0.0011 * br;

    // 1. The stance.
    const P = V.a.set(0.22, -0.2, -0.48), R = V.e.set(0, 0.04, 0);
    if (rig && ads > 0.001) {
      const e = rig.eye.position, relief = rig.zoom > 3 ? 0.07 : 0.11;
      P.lerp(V.b.set(-e.x, -e.y, -relief - e.z), ads);
      R.y *= 1 - ads;
    }
    P.x += -0.02 * this.sprint; P.y += -0.03 * this.sprint; P.z += 0.03 * this.sprint; R.x += -0.22 * this.sprint; R.y += 0.55 * this.sprint; R.z += 0.35 * this.sprint;
    // Tactical sprint: the rifle high across the chest.
    P.x += 0.03 * this.tac; P.y += -0.05 * this.tac; P.z += 0.06 * this.tac; R.x += 0.85 * this.tac; R.y += 0.5 * this.tac; R.z += -0.4 * this.tac;
    P.y -= 0.45 * this.binoc; R.x -= 0.8 * this.binoc;
    if (s.slide) { R.z += 0.25; P.x -= 0.03; }

    // 2. The clip.
    let leftW = 0; const leftAt = new THREE.Vector3(), leftQ = V.r.identity(); let leftCurl = 0.8, leftInGun = true;
    let rightAt: THREE.Vector3 | null = null, rightQ: THREE.Quaternion | null = null, rightCurl = 0.9;
    if (this.ring && this.clip?.kind !== 'throw') this.ring.visible = false;
    let kitPart: THREE.Group | null = null; const kitAt = new THREE.Vector3(), kitRot = new THREE.Euler();
    let magY = 0, magZ = 0, magRx = 0, magShow = true, handlePull = 0;
    const c = this.clip;
    if (c) {
      c.t += dt / c.scale;
      const T = c.t, cue = (name: Cue, at: number, key: string = name) => { if (T >= at && !c.fired.has(key)) { c.fired.add(key); this.onCueInternal(name); } };
      if (c.kind === 'reload' && rig && !rig.tube) {
        const E = c.empty;
        // Pushed up and forward to the middle of the screen, rolled and lifted so the magazine well faces you.
        const w = keys(T, E ? [[0, 0], [0.4, 1], [1.5, 1], [1.7, 0.85], [2.3, 0.85], [2.7, 0]] : [[0, 0], [0.4, 1], [1.5, 1], [2.1, 0]]);
        P.lerp(V.b.set(0.08, -0.1, -0.58), w);
        R.x += (0.35 - R.x) * w; R.y += (0.25 - R.y) * w; R.z += (0.55 - R.z) * w;
        // The magazine: out and down (0.4–0.9), a fresh one up and in (0.9–1.5).
        magY = keys(T, [[0.4, 0], [0.9, -0.3], [1.5, 0]]); magZ = keys(T, [[0.4, 0], [0.9, 0.03], [1.5, 0]]); magRx = keys(T, [[0.4, 0], [0.9, 0.35], [1.4, 0.06], [1.5, 0]]);
        if (E && T >= 0.45 && T < 0.9) magShow = false;
        // The left hand: to the magazine, with it down and up, then (empty) to the charging handle.
        leftW = keys(T, E ? [[0, 0], [0.3, 1], [1.5, 1], [1.62, 0]] : [[0, 0], [0.3, 1], [1.55, 1], [2.0, 0]]);
        leftCurl = keys(T, [[0, 0.8], [0.22, 0.35], [0.32, 0.95], [1.5, 0.95], [1.6, 0.6]]);
        const magPos = V.b.copy(rig.magHome).add(new THREE.Vector3(0, magY, magZ));
        // The hand round the magazine's left side, fingers across its front.
        leftAt.copy(magPos).add(new THREE.Vector3(-0.026, -0.07, 0.004));
        leftQ.setFromEuler(new THREE.Euler(0.15, 0, Math.PI / 2));
        cue('grab', 0.3); cue('magOut', 0.42);
        if (E) cue('magDrop', 0.45);
        cue('magIn', 1.5);
        if (E && rig.handle !== 'none') {
          const hw = keys(T, [[1.55, 0], [1.75, 1], [2.15, 1], [2.35, 0]]);
          handlePull = keys(T, [[1.8, 0], [1.95, 1], [2.04, 1], [2.08, 0]]);
          if (hw > 0) {
            const h = this.handlePose(rig, handlePull);
            if (leftW < hw) { leftW = hw; leftAt.copy(h.at); leftQ.copy(h.q); leftCurl = 0.85; }
          }
          cue('boltBack', 1.85); cue('boltSlam', 2.08);
        } else if (E && rig.bolt) { if (T > 1.75 && this.pumpT < 0) { this.pumpT = 0; this.pumpDur = 0.5; } cue('boltBack', 1.8); }
      }
      if (c.kind === 'reload' && rig && rig.tube) {
        // A round at a time into the loading port underneath, then (empty) the pump racked.
        const end = c.len, loadEnd = 0.25 + c.shells * 0.45;
        const roll = keys(T, [[0, 0], [0.25, -0.5], [loadEnd, -0.5], [end, 0]]); R.z += roll; R.x += -roll * 0.3; P.x -= 0.02 * -roll; P.y += 0.03 * roll;
        const i = Math.floor((T - 0.25) / 0.45), u = (T - 0.25 - i * 0.45) / 0.45;
        if (T > 0.2 && T < loadEnd) {
          leftW = 1; leftInGun = false;
          const port = this.toView(V.b.set(0, -0.06, rig.magHome.z + 0.05), new THREE.Vector3());
          const pouch = new THREE.Vector3(-0.18, -0.5, -0.22), sw = Math.sin(clamp01(u) * Math.PI);
          leftAt.copy(port).lerp(pouch, sw); leftQ.setFromEuler(new THREE.Euler(-0.6, 0, -0.5)); leftCurl = 0.7;
          if (i >= 0 && i < c.shells) cue('shell', 0.25 + i * 0.45 + 0.4, `shell${i}`);
        } else leftW = keys(T, [[0, 0], [0.2, 0.5], [loadEnd, 0.5], [loadEnd + 0.1, 0]]);
        if (c.empty && rig.pump) { const pk = keys(T, [[loadEnd + 0.05, 0], [loadEnd + 0.25, 1], [loadEnd + 0.45, 0]]); rig.pump.position.z = (rig.pump.userData.home as THREE.Vector3).z + 0.07 * pk; cue('pump', loadEnd + 0.08); }
      }
      if (c.kind === 'inspect') {
        const w = keys(T, [[0, 0], [0.5, 1], [3, 1], [3.5, 0]]);
        P.x -= 0.12 * w; P.y += 0.08 * w; P.z -= 0.02 * w;
        R.z += keys(T, [[0, 0], [0.6, -0.7], [1.5, -0.7], [2.2, 0.7], [2.9, 0.7], [3.5, 0]]);
        R.y += keys(T, [[0, 0], [0.6, 0.45], [1.5, 0.4], [2.2, -0.55], [2.9, -0.5], [3.5, 0]]);
        R.x += 0.1 * w;
        cue('cloth', 0.1, 'c1'); cue('cloth', 2.0, 'c2');
      }
      if (c.kind === 'kit' || c.kind === 'throw') {
        const L = c.len, w = keys(T, [[0, 0], [0.22, 1], [L - 0.22, 1], [L, 0]]);
        if (c.kind === 'throw') { P.y -= 0.5 * w; R.x -= 0.8 * w; }
        else { P.x += 0.06 * w; P.y -= 0.12 * w; P.z += 0.06 * w; R.x -= 0.25 * w; R.y -= 0.4 * w; R.z -= 0.7 * w; }
        leftW = 1; leftInGun = false;
        kitPart = this.kitParts[c.kind === 'throw' ? c.nade : c.kit];
        if (c.kind === 'throw') {
          // In the right hand: up into view, the left hand hooks the ring and pulls the pin, wound back, thrown.
          keys3(T, [[0, 0.16, -0.4, -0.36], [0.2, 0.05, -0.08, -0.36], [0.32, 0.06, -0.07, -0.35], [0.42, 0.12, -0.01, -0.24], [0.5, 0.03, 0.04, -0.8], [0.85, 0.16, -0.45, -0.36]], kitAt);
          kitRot.set(0.2, -0.3, -0.2);
          if (T > 0.5) kitPart = null;
          this.pin.visible = T < 0.24;
          rightAt = kitAt.clone().add(V.b.set(0.012, -0.035, 0.038)); rightQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, -0.3, 0.4)); rightCurl = 0.75;
          if (c.nade === 'frag') cue('pin', 0.24);
          cue('throw', 0.5);
        } else if (c.kit === 'plate') {
          // Up from the left, shown, then slid down into the carrier at the bottom middle.
          keys3(T, [[0, -0.25, -0.38, -0.45], [0.45, -0.06, -0.06, -0.42], [0.75, -0.03, -0.09, -0.4], [1.1, 0, -0.36, -0.33], [1.5, -0.2, -0.46, -0.36]], kitAt);
          kitRot.set(keys(T, [[0, -0.5], [0.45, -0.25], [0.75, -0.3], [1.1, -0.9]]), 0.15, keys(T, [[0, 0.3], [0.45, 0.05]]));
          cue('velcro', 0.85);
        } else if (c.kit === 'adrenaline') {
          keys3(T, [[0, -0.15, -0.45, -0.3], [0.35, -0.05, -0.08, -0.3], [0.6, -0.05, -0.08, -0.29], [0.7, -0.05, -0.45, -0.25], [1.1, -0.15, -0.5, -0.3]], kitAt);
          kitRot.set(-1.2, 0, 0.3); cue('inject', 0.68);
        } else if (c.kit === 'bandage') {
          const a = T * 9, wrap = keys(T, [[0.3, 0], [0.4, 1], [1.2, 1], [1.3, 0]]);
          keys3(T, [[0, -0.15, -0.45, -0.3], [0.35, -0.05, -0.1, -0.3], [1.25, -0.05, -0.1, -0.3], [1.6, -0.15, -0.45, -0.3]], kitAt);
          kitAt.x += Math.cos(a) * 0.05 * wrap; kitAt.y += Math.sin(a) * 0.03 * wrap; kitRot.set(0, a * 0.3, 0); cue('cloth', 0.4);
        } else {
          keys3(T, [[0, -0.15, -0.45, -0.3], [0.4, -0.05, -0.09, -0.3], [1.1, -0.05, -0.11, -0.3], [1.5, -0.15, -0.45, -0.3]], kitAt);
          kitRot.set(0.25, 0.4, 0); cue(c.kit === 'splint' ? 'velcro' : 'cloth', 0.7);
        }
        if (c.kind === 'throw') {
          const pull = keys(T, [[0.12, 0], [0.24, 0.0001], [0.34, 1]]);
          leftAt.copy(kitAt).add(V.b.set(-0.05, 0.03, 0.02)).lerp(V.c.set(-0.22, -0.1, -0.32), pull);
          if (T > 0.55) leftAt.lerp(V.c.set(-0.3, -0.45, -0.3), keys(T, [[0.55, 0], [0.75, 1]]));
          leftQ.setFromEuler(new THREE.Euler(0.3, 0.6, -0.4)); leftCurl = keys(T, [[0.15, 0.3], [0.24, 0.8]]);
          if (this.ring) { this.ring.visible = T > 0.24 && T < 0.6; this.ring.position.copy(leftAt).add(V.b.set(0.03, 0.01, -0.03)); }
        } else { leftAt.copy(kitAt).add(V.b.set(0.02, -0.04, 0.035)); leftQ.setFromEuler(new THREE.Euler(0.5, 0.3, -0.5)); leftCurl = 0.7; }
      }
      if (c.kind === 'swapOut') {
        const w = keys(T, [[0, 0], [0.3, 1]]); P.x += 0.02 * w; P.y -= 0.45 * w; P.z += 0.05 * w; R.x -= 0.9 * w; R.y += 0.2 * w; R.z += 0.3 * w;
        if (T >= c.len) { if (this.next) { this.build(this.next); this.next = null; } this.play('raise', 0.55, 1); }
      }
      if (c.kind === 'raise' && rig) {
        const w = keys(T, [[0, 1], [0.32, 0]]); P.x += 0.02 * w; P.y -= 0.45 * w; P.z += 0.05 * w; R.x -= 0.9 * w; R.y += 0.2 * w; R.z += 0.3 * w;
        // The bolt check: rolled to look into the port, the handle tugged a little.
        R.z += keys(T, [[0.3, 0], [0.42, 0.32], [0.55, 0]]);
        if (rig.handle !== 'none') {
          const hw = keys(T, [[0.28, 0], [0.38, 1], [0.5, 1], [0.55, 0]]);
          handlePull = keys(T, [[0.4, 0], [0.46, 0.35], [0.5, 0]]);
          if (hw > 0) { const h = this.handlePose(rig, handlePull); leftW = hw; leftAt.copy(h.at); leftQ.copy(h.q); leftCurl = 0.85; }
          cue('boltBack', 0.45);
        }
      }
      if (c && this.clip === c && c.t >= c.len) {
        this.clip = null;
        if (rig) { rig.mag.position.copy(rig.magHome); rig.mag.rotation.set(0, 0, 0); rig.mag.visible = true; if (c.kind === 'reload') this.boltLocked = false; }
      }
    }
    if (rig) {
      rig.mag.position.copy(rig.magHome).add(V.b.set(0, magY, magZ)); rig.mag.rotation.x = magRx; rig.mag.visible = magShow;
      // The bolt carrier runs back and forward on a shot (60 ms); a pistol's slide stays back on empty until the reload's end.
      this.boltT = Math.min(1, this.boltT + dt / 0.06);
      const run = this.boltLocked ? 1 : Math.sin(this.boltT * Math.PI);
      const back = Math.max(run * rig.boltTravel, handlePull * (rig.handle === 'slide' ? rig.boltTravel + 0.006 : rig.handle === 'side' ? 0.08 : 0));
      if (rig.boltCarrier) rig.boltCarrier.position.z = (rig.boltCarrier.userData.home as THREE.Vector3).z + back;
      if (rig.chargingHandle && rig.handle === 'top') rig.chargingHandle.position.z = (rig.chargingHandle.userData.home as THREE.Vector3).z + handlePull * 0.08;
      // A pump or bolt action worked after a shot.
      if (this.pumpT >= 0) {
        this.pumpT += dt / this.pumpDur;
        const w = Math.sin(Math.min(1, this.pumpT) * Math.PI);
        if (rig.pump) rig.pump.position.z = (rig.pump.userData.home as THREE.Vector3).z + 0.07 * w;
        if (rig.bolt) { rig.bolt.rotation.z = 1.2 * Math.min(1, w * 2); rig.bolt.position.z = (rig.bolt.userData.home as THREE.Vector3).z + 0.05 * Math.max(0, w - 0.3); }
        if (this.pumpT >= 1) this.pumpT = -1;
      }
    }

    // 3 and 4: springs, sway, bob and breathing on top.
    const ps = this.posSpring.pos, rs = this.rotSpring.pos, sw = this.sway.pos;
    this.gunHolder.position.set(P.x + sw.y * -0.25 + bx + breathX + ps.x, P.y + sw.x * 0.25 + by + breathY + ps.y, P.z + ps.z);
    this.gunHolder.rotation.set(R.x + rs.x + sw.x + breathY * 2, R.y + rs.y + sw.y + breathX * 2, R.z + rs.z + sw.y * 0.8 + broll - s.lean * 0.12 * (1 - ads));

    // The arms.
    this.triggerT = Math.min(1, this.triggerT + dt / 0.09);
    for (const p of Object.values(this.kitParts)) p.visible = false;
    if (rig) {
      this.gunHolder.updateMatrixWorld(true);
      const gq = this.gunHolder.getWorldQuaternion(new THREE.Quaternion());
      // Right hand round the pistol grip, the index finger on the trigger.
      const grip = this.toView(V.b.copy(rig.grip.position).add(new THREE.Vector3(0.026, 0.004, 0.012)), new THREE.Vector3());
      const rq = gq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2 + 0.15)));
      // Binoculars take both hands to the eyes.
      if (this.binoc > 0.02) {
        const bp = this.kitParts.binoculars; bp.visible = true; bp.position.set(0, -0.03 - (1 - this.binoc) * 0.4, -0.17); bp.rotation.set(0, 0, 0);
        const bq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0));
        this.right.pose(this.shoulderR, grip.clone().lerp(new THREE.Vector3(0.05, -0.07 - (1 - this.binoc) * 0.4, -0.16), smooth(this.binoc)), rq.clone().slerp(bq, smooth(this.binoc)), 0.8, this.poleR);
        this.left.pose(this.shoulderL, new THREE.Vector3(-0.05, -0.07 - (1 - this.binoc) * 0.4, -0.16), bq, 0.8, this.poleL);
      } else {
        if (rightAt && rightQ) this.right.pose(this.shoulderR, rightAt, rightQ, rightCurl, this.poleR);
        else this.right.pose(this.shoulderR, grip, rq, 0.92, this.poleR, 0.35 + 0.3 * Math.sin(Math.min(1, this.triggerT) * Math.PI));
        // Left hand: on the handguard (underneath, fingers round the far side), or wherever the clip wants it, or pumping in a tactical sprint.
        // On a vertical foregrip the hand wraps it from the left (the arm locked to the grip's socket); otherwise under the handguard.
        const fore = this.toView(V.b.copy(rig.fore.position).add(rig.foregrip ? new THREE.Vector3(-0.024, 0, 0.004) : new THREE.Vector3(-0.03, -0.02, 0)), new THREE.Vector3());
        const fq = rig.foregrip ? gq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2 - 0.1)))
          : gq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.35))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)));
        const at = fore.clone(), q = fq.clone();
        let curl = rig.foregrip ? 0.9 : 0.75;
        if (leftW > 0) {
          const target = leftInGun ? this.toView(leftAt, new THREE.Vector3()) : leftAt.clone();
          const tq = leftInGun ? gq.clone().multiply(leftQ) : leftQ.clone();
          at.lerp(target, leftW); q.slerp(tq, leftW); curl += (leftCurl - curl) * leftW;
        }
        const pump = this.tac * (1 - leftW);
        if (pump > 0.01) {
          const swing = new THREE.Vector3(-0.2 + Math.sin(phi) * 0.03, -0.3 + Math.sin(phi) * 0.07, -0.28 + Math.cos(phi) * 0.09);
          at.lerp(swing, pump); q.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0.4, -0.9)), pump); curl += (1 - curl) * pump;
        }
        this.left.pose(this.shoulderL, at, q, curl, this.poleL);
      }
      if (kitPart) { kitPart.visible = true; kitPart.position.copy(kitAt); kitPart.rotation.copy(kitRot); }
    }
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt; c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
      if (c.life <= 0) c.m.visible = false;
    }
    // The flash lasts 35 ms; its light fades with it.
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    if (rig) { this.flashLight.position.copy(this.muzzleAt(V.b)); }
    this.flashLight.intensity = this.flashT > 0 ? this.flashLight.intensity : Math.max(0, this.flashLight.intensity - dt * 120);
  }

  /** A gun-space point to the view's space (after the gun has been posed). */
  private toView(p: THREE.Vector3, out: THREE.Vector3) { return out.copy(p).applyMatrix4(this.gunHolder.matrixWorld); }
  /** Where the left hand holds the charging handle (gun space), pulled back by `pull` (0–1). */
  private handlePose(rig: GunRig, pull: number) {
    const q = new THREE.Quaternion();
    if (rig.handle === 'side' && rig.chargingHandle) {
      const p = (rig.chargingHandle.userData.home as THREE.Vector3).clone().add(new THREE.Vector3(0.055, -0.005, 0.02 + pull * 0.08));
      q.setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));
      return { at: p, q };
    }
    const home = rig.chargingHandle?.userData.home as THREE.Vector3 | undefined;
    const p = (home ? home.clone() : new THREE.Vector3(0, 0.04, rig.grip.position.z + 0.04)).add(new THREE.Vector3(-0.02, 0.032, 0.02 + pull * (rig.handle === 'slide' ? 0.03 : 0.08)));
    q.setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
    return { at: p, q };
  }
  private onCueInternal(cue: Cue) {
    if (cue === 'magIn') { this.camKick.pos.x += 0.03; this.rotSpring.kick(0.8, 0, 0); this.posSpring.kick(0, 0.5, 0); }
    if (cue === 'boltSlam') { this.posSpring.kick(0, 0, -0.8); this.rotSpring.kick(0.4, 0, 0.3); this.camKick.pos.x += 0.012; }
    if (cue === 'magDrop' && this.rig && this.onMagDrop) {
      this.rig.mag.updateMatrixWorld(true);
      const at = this.rig.mag.getWorldPosition(new THREE.Vector3()), q = this.rig.mag.getWorldQuaternion(new THREE.Quaternion());
      this.onMagDrop(this.rig.mag.clone(), at, q);
    }
    this.onCue?.(cue);
  }
  /** For tests and tuning: jump the current clip to a moment (design seconds). */
  seek(t: number) { if (this.clip) this.clip.t = t; }
  get clipName() { return this.clip ? `${this.clip.kind}${this.clip.empty ? ':empty' : ''}@${this.clip.t.toFixed(2)}` : ''; }
}
