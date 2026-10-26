import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Role } from '@/lib/play/ops';
import { RoundedBoxGeometry, THREE } from '../world/core';
import { surfaceMaps } from '../world/textures';

// The people of Ridgeline Ops (the owner: "an articulated, multi-mesh tactical military operator
// (helmet with NVGs, plate carrier vest, backpack, articulated limbs with walk/run/crouch cycles)").
// Each figure is built from shaped parts (boots, legs, a plate carrier with pouches, a helmet with a
// night-vision mount, gloves) and skinned to a skeleton of 19 bones, all in one mesh with its colours
// in the vertices: one draw per soldier, however many parts. The skeleton is posed every frame by
// `pose()`: walk, run, crouch and prone cycles, aiming, hands up, a flinch when hit, and a fall.

type V3 = [number, number, number];
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;
type BoneName = (typeof BONES)[number];
/** Each bone's parent and where it sits relative to it (bind pose, metres). */
const RIG: Record<BoneName, [BoneName | null, V3]> = {
  hips: [null, [0, 0.98, 0]], spine: ['hips', [0, 0.12, 0]], chest: ['spine', [0, 0.2, 0]], neck: ['chest', [0, 0.26, 0]], head: ['neck', [0, 0.1, 0]],
  shL: ['chest', [0.17, 0.2, 0]], armL: ['shL', [0.06, 0, 0]], foreL: ['armL', [0, -0.29, 0]], handL: ['foreL', [0, -0.26, 0]],
  shR: ['chest', [-0.17, 0.2, 0]], armR: ['shR', [-0.06, 0, 0]], foreR: ['armR', [0, -0.29, 0]], handR: ['foreR', [0, -0.26, 0]],
  thighL: ['hips', [0.1, -0.04, 0]], shinL: ['thighL', [0, -0.44, 0]], footL: ['shinL', [0, -0.43, 0]],
  thighR: ['hips', [-0.1, -0.04, 0]], shinR: ['thighR', [0, -0.44, 0]], footR: ['shinR', [0, -0.43, 0]],
};
/** Where each bone is in the bind pose (model space). */
const WORLD: Record<BoneName, V3> = (() => {
  const out = {} as Record<BoneName, V3>;
  for (const b of BONES) { const [p, at] = RIG[b]; const base = p ? out[p] : [0, 0, 0]; out[b] = [base[0] + at[0], base[1] + at[1], base[2] + at[2]]; }
  return out;
})();

export interface Look { camo: number; dark: number; skin: number; vest: number; helmet: 'combat' | 'beret' | 'hood' | 'none' | 'heavy'; nvg: boolean; pack: boolean; bulky: number; armband?: number; civilian?: boolean }
export const LOOKS: Record<Role | 'hostage' | 'friend', Look> = {
  rifleman: { camo: 0x55593d, dark: 0x34362a, skin: 0xc8a07a, vest: 0x3f4430, helmet: 'combat', nvg: false, pack: true, bulky: 1 },
  sniper: { camo: 0x6d6448, dark: 0x4a4434, skin: 0xb08260, vest: 0x5a5238, helmet: 'hood', nvg: false, pack: false, bulky: 1.05 },
  breacher: { camo: 0x2f3236, dark: 0x1e2023, skin: 0x9c7252, vest: 0x26282b, helmet: 'combat', nvg: true, pack: false, bulky: 1.08 },
  medic: { camo: 0x58603f, dark: 0x363a2b, skin: 0xd4a985, vest: 0x40472f, helmet: 'combat', nvg: false, pack: true, bulky: 1, armband: 0xd92b2b },
  juggernaut: { camo: 0x23252a, dark: 0x141518, skin: 0x8a6448, vest: 0x1b1c1f, helmet: 'heavy', nvg: false, pack: false, bulky: 1.35 },
  officer: { camo: 0x4b4f38, dark: 0x2c2e22, skin: 0xc79a74, vest: 0x3a3e2c, helmet: 'beret', nvg: false, pack: false, bulky: 1 },
  boss: { camo: 0x3b2a22, dark: 0x1f1714, skin: 0xb58866, vest: 0x2a211b, helmet: 'beret', nvg: false, pack: false, bulky: 1.12, armband: 0xd4a017 },
  hostage: { camo: 0xd2691e, dark: 0xb45a18, skin: 0xd8b08c, vest: 0xd2691e, helmet: 'none', nvg: false, pack: false, bulky: 0.95, civilian: true },
  friend: { camo: 0x4c5a6e, dark: 0x2a3340, skin: 0xc49a74, vest: 0x36414f, helmet: 'combat', nvg: true, pack: true, bulky: 1, armband: 0x38bdf8 },
};

const cache = new Map<string, THREE.BufferGeometry>();
let material: THREE.MeshStandardMaterial | null = null;

/** Builds (once per look) the merged, skinned body. */
function body(look: Look): THREE.BufferGeometry {
  const key = JSON.stringify(look);
  const hit = cache.get(key);
  if (hit) return hit;
  const parts: THREE.BufferGeometry[] = [];
  const part = (g: THREE.BufferGeometry, bone: BoneName, color: number, at: V3, rot?: V3) => {
    if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
    g.translate(at[0], at[1], at[2]);
    const geo = g.index ? g.toNonIndexed() : g, n = geo.attributes.position.count, c = new THREE.Color(color);
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), bi = BONES.indexOf(bone);
    for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], i * 3); si[i * 4] = bi; sw[i * 4] = 1; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    parts.push(geo);
  };
  const W = WORLD, k = look.bulky;
  const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
  const rb = (w: number, h: number, d: number, r = 0.03) => new RoundedBoxGeometry(w, h, d, 1, r);
  // Legs: thighs, knee pads, shins, boots.
  for (const s of ['L', 'R'] as const) {
    const t = W[`thigh${s}`], sh = W[`shin${s}`], f = W[`foot${s}`], x = t[0];
    part(cap(0.085 * k, 0.3), `thigh${s}`, look.camo, [x, t[1] - 0.22, 0]);
    part(cap(0.072 * k, 0.3), `shin${s}`, look.camo, [x, sh[1] - 0.22, 0]);
    if (!look.civilian) part(rb(0.1, 0.1, 0.06, 0.02), `shin${s}`, look.dark, [x, sh[1] - 0.02, 0.07]);
    part(rb(0.12, 0.1, 0.27, 0.03), `foot${s}`, 0x231d18, [x, f[1] - 0.02, 0.05]);
    // A thigh pouch on the right leg.
    if (s === 'R' && !look.civilian) part(rb(0.07, 0.14, 0.1), 'thighR', look.dark, [x - 0.08, t[1] - 0.2, 0.02]);
  }
  // Hips and torso, the plate carrier with magazine pouches, a radio, the backpack.
  part(rb(0.3 * k, 0.16, 0.2 * k, 0.05), 'hips', look.dark, [0, W.hips[1] - 0.02, 0]);
  part(rb(0.32 * k, 0.2, 0.21 * k, 0.06), 'spine', look.camo, [0, W.spine[1] + 0.08, 0]);
  part(rb(0.38 * k, 0.32, 0.24 * k, 0.07), 'chest', look.camo, [0, W.chest[1] + 0.12, 0]);
  if (!look.civilian) {
    part(rb(0.36 * k, 0.3, 0.07, 0.02), 'chest', look.vest, [0, W.chest[1] + 0.1, 0.13 * k]);
    part(rb(0.36 * k, 0.3, 0.06, 0.02), 'chest', look.vest, [0, W.chest[1] + 0.1, -0.13 * k]);
    for (const x of [-0.11, 0, 0.11]) part(rb(0.085, 0.12, 0.06, 0.015), 'chest', look.dark, [x * k, W.chest[1] + 0.0, 0.19 * k]);
    part(rb(0.06, 0.12, 0.05, 0.01), 'chest', 0x1a1a1a, [0.15 * k, W.chest[1] + 0.22, 0.15 * k]);
    part(new THREE.CylinderGeometry(0.006, 0.006, 0.16), 'chest', 0x111111, [0.17 * k, W.chest[1] + 0.34, 0.15 * k]);
  }
  if (look.pack) part(rb(0.3, 0.38, 0.16, 0.05), 'chest', look.dark, [0, W.chest[1] + 0.08, -0.25 * k]);
  if (look.armband) for (const s of [1, -1]) part(new THREE.CylinderGeometry(0.068, 0.068, 0.05, 10), s > 0 ? 'armL' : 'armR', look.armband, [W.shL[0] * s + 0.06 * s, W.armL[1] - 0.08, 0]);
  // Arms and gloved hands.
  for (const s of ['L', 'R'] as const) {
    const a = W[`arm${s}`], fo = W[`fore${s}`], h = W[`hand${s}`];
    part(cap(0.058 * k, 0.2), `arm${s}`, look.camo, [a[0], a[1] - 0.14, 0]);
    part(cap(0.05 * k, 0.19), `fore${s}`, look.camo, [fo[0], fo[1] - 0.13, 0]);
    part(rb(0.075, 0.1, 0.045, 0.018), `hand${s}`, look.civilian ? look.skin : 0x2a2a26, [h[0], h[1] - 0.05, 0]);
    if (!look.civilian) part(rb(0.1 * k, 0.07, 0.11 * k, 0.03), `sh${s}`, look.vest, [W[`sh${s}`][0] * 1.3, W[`sh${s}`][1] + 0.01, 0]);
  }
  // Neck, head, the face covered (balaclava or shemagh), and what's on the head.
  part(cap(0.05, 0.06), 'neck', look.civilian ? look.skin : look.dark, [0, W.neck[1] + 0.04, 0]);
  const hd = W.head[1] + 0.1;
  part(new THREE.SphereGeometry(0.115, 16, 12), 'head', look.civilian ? look.skin : look.dark, [0, hd, 0]);
  if (!look.civilian) part(rb(0.17, 0.05, 0.04, 0.015), 'head', look.skin, [0, hd + 0.03, 0.095]); // the eye slit shows skin
  if (look.civilian) part(rb(0.13, 0.04, 0.03, 0.01), 'head', 0x2a1e16, [0, hd + 0.04, 0.1]); // brows
  if (look.helmet === 'combat' || look.helmet === 'heavy') {
    const hr = look.helmet === 'heavy' ? 0.16 : 0.135;
    part(new THREE.SphereGeometry(hr, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), 'head', look.helmet === 'heavy' ? 0x202226 : 0x4b5036, [0, hd + 0.02, -0.005]);
    if (look.helmet === 'heavy') part(rb(0.2, 0.12, 0.05, 0.02), 'head', 0x2a2d33, [0, hd - 0.01, 0.12]); // visor
    part(rb(0.05, 0.04, 0.03, 0.01), 'head', 0x1a1a1a, [0, hd + 0.08, 0.12]); // NVG mount
    if (look.nvg) for (const x of [-0.025, 0.025]) part(new THREE.CylinderGeometry(0.016, 0.018, 0.07, 10), 'head', 0x111111, [x, hd + 0.1, 0.15], [Math.PI / 2 - 0.5, 0, 0]);
    for (const s of [-1, 1]) part(rb(0.02, 0.05, 0.12, 0.008), 'head', 0x2b2b2b, [s * hr * 0.95, hd + 0.01, 0]); // rails
  } else if (look.helmet === 'beret') {
    part(new THREE.CylinderGeometry(0.125, 0.12, 0.05, 16), 'head', look.armband === 0xd4a017 ? 0x3b0d0d : 0x6b1515, [0.02, hd + 0.1, 0], [0, 0, -0.25]);
  } else if (look.helmet === 'hood') {
    part(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), 'head', look.camo, [0, hd + 0.01, -0.01]);
    // Ghillie scraps over the shoulders.
    for (let i = 0; i < 10; i++) part(rb(0.04, 0.16, 0.02, 0.005), 'chest', i % 2 ? look.camo : look.dark, [Math.cos(i) * 0.18, W.chest[1] + 0.22 - (i % 3) * 0.05, Math.sin(i * 1.7) * 0.14], [0.3 * Math.sin(i), i, 0]);
  }
  const geo = mergeGeometries(parts.map((g) => { for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(n)) g.deleteAttribute(n); return g; }));
  parts.forEach((g) => g.dispose());
  cache.set(key, geo);
  return geo;
}

/** One person: the skinned mesh, its bones by name, and the state its animation needs. */
export class Operator {
  mesh: THREE.SkinnedMesh;
  root = new THREE.Group();
  bones = {} as Record<BoneName, THREE.Bone>;
  private phase = Math.random() * 6;
  private flinch = 0;
  private fall = 0;
  held: THREE.Object3D | null = null;
  constructor(public look: Look) {
    if (!material) {
      const f = surfaceMaps('fabric');
      material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02, normalMap: f.normal, normalScale: new THREE.Vector2(0.4, 0.4) });
    }
    this.mesh = new THREE.SkinnedMesh(body(look), material);
    for (const b of BONES) { const bone = new THREE.Bone(); bone.name = b; this.bones[b] = bone; }
    for (const b of BONES) { const [p, at] = RIG[b]; this.bones[b].position.set(...at); if (p) this.bones[p].add(this.bones[b]); }
    this.mesh.add(this.bones.hips);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(BONES.map((b) => this.bones[b])));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.root.rotation.order = 'YXZ';
  }
  /** Puts a gun (or anything) in the right hand, pointing forward. */
  hold(o: THREE.Object3D | null) {
    if (this.held) this.bones.handR.remove(this.held);
    this.held = o;
    if (o) { o.position.set(0, -0.06, 0.02); o.rotation.set(-Math.PI / 2, 0, 0); this.bones.handR.add(o); }
  }
  hit() { this.flinch = 1; }
  /** Poses the skeleton: `speed` m/s, stance, aim (0 lowered … 1 shouldered), facing pitch for aiming up and down. */
  pose(dt: number, { speed = 0, stance = 'stand' as 'stand' | 'crouch' | 'prone', aim = 0, pitch = 0, dead = false, handsUp = false, run = false }) {
    const B = this.bones;
    this.phase += dt * (speed > 0.2 ? 2 + speed * 1.55 : 0);
    const ph = this.phase, sw = Math.min(1, speed / 3.5) * (run ? 1.25 : 1), s = Math.sin(ph), c = Math.cos(ph);
    this.flinch = Math.max(0, this.flinch - dt * 5);
    for (const b of BONES) B[b].rotation.set(0, 0, 0);
    B.hips.position.set(0, 0.98, 0);
    if (dead) {
      // Knees give, the body folds back and lies still.
      this.fall = Math.min(1, this.fall + dt * 1.8);
      const e = 1 - Math.pow(1 - this.fall, 2);
      this.root.rotation.x = -1.45 * e;
      B.hips.position.y = 0.98 - 0.62 * e;
      B.thighL.rotation.x = -0.6 * e; B.thighR.rotation.x = -0.25 * e; B.shinL.rotation.x = 1 * e; B.shinR.rotation.x = 0.5 * e;
      B.armL.rotation.set(-0.4 * e, 0, 1.1 * e); B.armR.rotation.set(-0.8 * e, 0, -0.9 * e); B.head.rotation.set(0.3 * e, 0.4 * e, 0);
      return;
    }
    this.root.rotation.x = 0;
    // Legs: a walking or running cycle; crouched legs bent and hips low; prone flat on the ground.
    if (stance === 'prone') {
      this.root.rotation.x = 0; B.hips.position.set(0, 0.2, 0); B.hips.rotation.x = Math.PI / 2 - 0.05;
      B.thighL.rotation.x = 0.1 + s * 0.15 * sw; B.thighR.rotation.x = 0.1 - s * 0.15 * sw; B.shinL.rotation.x = 0.2; B.shinR.rotation.x = 0.2;
      B.armR.rotation.set(-2.8, 0, 0.2); B.foreR.rotation.x = -0.9; B.armL.rotation.set(-2.9, 0, -0.3); B.foreL.rotation.x = -0.6;
      B.neck.rotation.x = -1.2;
      return;
    }
    const crouch = stance === 'crouch';
    B.thighL.rotation.x = -s * 0.65 * sw + (crouch ? -1.25 : 0); B.thighR.rotation.x = s * 0.65 * sw + (crouch ? -0.55 : 0);
    B.shinL.rotation.x = Math.max(0, -c) * 0.9 * sw + (crouch ? 1.9 : 0.05); B.shinR.rotation.x = Math.max(0, c) * 0.9 * sw + (crouch ? 1.35 : 0.05);
    B.footL.rotation.x = crouch ? -0.6 : -0.15 * sw * s; B.footR.rotation.x = crouch ? -0.8 : 0.15 * sw * s;
    B.hips.position.y = (crouch ? 0.62 : 0.98) + Math.abs(s) * 0.03 * sw;
    B.hips.rotation.y = s * 0.08 * sw;
    B.spine.rotation.x = (run ? 0.25 : 0.06) * sw + (crouch ? 0.35 : 0);
    B.chest.rotation.y = -s * 0.1 * sw;
    // Arms: hands up, shouldering a gun (aimed up or down with the look), or swinging while walking.
    if (handsUp) {
      B.armL.rotation.set(0, 0, 2.7); B.armR.rotation.set(0, 0, -2.7); B.foreL.rotation.z = 0.6; B.foreR.rotation.z = -0.6;
    } else if (aim > 0.05) {
      const a = aim, up = pitch;
      B.chest.rotation.x += -up * 0.5 * a;
      B.armR.rotation.set(-1.25 * a - up * 0.4, -0.35 * a, -0.15 * a); B.foreR.rotation.set(-1.1 * a, 0, 0); B.handR.rotation.set(0.25 * a, 0, 0);
      B.armL.rotation.set(-1.45 * a - up * 0.4, 0.55 * a, 0.25 * a); B.foreL.rotation.set(-0.55 * a, 0, 0);
      B.neck.rotation.x = -up * 0.4 * a; B.head.rotation.y = 0.15 * a;
      if (a < 1) { B.armL.rotation.x += s * 0.4 * sw * (1 - a); B.armR.rotation.x -= s * 0.4 * sw * (1 - a); }
    } else {
      B.armL.rotation.set(s * 0.5 * sw, 0, 0.12); B.armR.rotation.set(-s * 0.5 * sw, 0, -0.12); B.foreL.rotation.x = -0.25; B.foreR.rotation.x = -0.25;
    }
    // A hit rocks the upper body back.
    if (this.flinch > 0) { B.spine.rotation.x -= this.flinch * 0.35; B.head.rotation.x -= this.flinch * 0.3; }
  }
  /** Where each body part is in the world, for hits: [head, chest, pelvis, legs…] as spheres. */
  hitSpheres(out: { c: THREE.Vector3; r: number; part: 'head' | 'body' | 'arm' | 'leg' }[]) {
    const B = this.bones, k = this.look.bulky;
    const list: [BoneName, number, 'head' | 'body' | 'arm' | 'leg', number][] = [['head', 0.14, 'head', 0.1], ['chest', 0.24 * k, 'body', 0.12], ['spine', 0.21 * k, 'body', 0.05], ['hips', 0.19 * k, 'body', 0], ['thighL', 0.11, 'leg', -0.22], ['thighR', 0.11, 'leg', -0.22], ['shinL', 0.09, 'leg', -0.22], ['shinR', 0.09, 'leg', -0.22], ['foreL', 0.07, 'arm', -0.12], ['foreR', 0.07, 'arm', -0.12]];
    while (out.length < list.length) out.push({ c: new THREE.Vector3(), r: 0, part: 'body' });
    list.forEach(([b, r, part, dy], i) => { out[i].c.set(0, dy, 0).applyMatrix4(B[b].matrixWorld); out[i].r = r; out[i].part = part; });
    out.length = list.length;
    return out;
  }
}
