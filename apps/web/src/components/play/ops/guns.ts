import { WEAPONS, gunStats, type Gun, type GunModel } from '@/lib/play/ops';
import { RoundedBoxGeometry, THREE } from '../world/core';
import { surface } from '../world/textures';
import { mergeByMaterial } from './merge';

// The guns' 3D models (the owner: "detailed 3D procedural multi-part weapon viewmodels (receiver,
// barrel, stock, scope, magazine)"), built from each gun's description in the arsenal and its
// attachments: receiver and upper rail, barrel, handguard (rails, wood or a heavy guard), stock
// (tube, skeleton, wood, fixed, folded), pistol grip, the magazine (straight, curved, box, drum,
// tube, in the grip), iron sights (folded away under an optic), and each attachment's own shape.
// The gun points down −z. Named points: the muzzle, the eye point for aiming (behind the rear sight
// or the optic), the ejection port, the magazine (it drops out on reloads) and the grips for the hands.

export interface GunRig {
  /** The root (`weaponRig`): it holds the parts below, which move on their own. */
  group: THREE.Group;
  /** Body, stock, grip, trigger guard and the top rail; the barrel, gas block and muzzle device; the optic. */
  receiver: THREE.Group; barrel: THREE.Group; optic: THREE.Group | null;
  muzzle: THREE.Object3D; eye: THREE.Object3D; port: THREE.Object3D; mag: THREE.Object3D; magHome: THREE.Vector3;
  fore: THREE.Object3D; grip: THREE.Object3D;
  /** The bolt carrier seen in the ejection port (a pistol's slide), how far it runs back on a shot,
   *  and the charging handle the hand racks after an empty reload (`handle` says where it is). */
  boltCarrier: THREE.Object3D | null; boltTravel: number;
  chargingHandle: THREE.Object3D | null; handle: 'top' | 'side' | 'slide' | 'none';
  /** The optic's lens, where the scope picture or the dot is drawn. */
  lens: THREE.Mesh | null;
  pump: THREE.Object3D | null; bolt: THREE.Object3D | null;
  laser: THREE.Object3D | null;
  zoom: number;
  /** Loaded a round at a time (pump shotguns), not by magazine. */
  tube: boolean;
  /** The left hand holds a vertical foregrip (`fore` is its socket) rather than the handguard. */
  foregrip: boolean;
}

let mats: Record<string, THREE.Material> | null = null;
function M() {
  if (mats) return mats;
  mats = {
    // Anodised gunmetal for the receiver, darker aluminium for rails and barrels, stippled polymer.
    metal: surface('gunmetal', { color: 0x585c62, metal: 0.85, rough: 0.3, bump: 0.5 }),
    dark: surface('gunmetal', { color: 0x34373b, metal: 0.85, rough: 0.38, bump: 0.35 }),
    polymer: surface('polymer', { color: 0x3a3b3f, metal: 0.05, rough: 0.75, bump: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.22 }),
    wood: surface('wood', { color: 0xb07a4a, rough: 0.6 }),
    tan: new THREE.MeshStandardMaterial({ color: 0x8a7556, metalness: 0.1, roughness: 0.8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 1, roughness: 0.25 }),
    violet: new THREE.MeshStandardMaterial({ color: 0x6d28d9, metalness: 0.8, roughness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b1620, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.7 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a34a, metalness: 1, roughness: 0.3 }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
  };
  return mats;
}

/** The dot or ring drawn in a red-dot or holographic sight's glass. */
function reticleMat(kind: 'dot' | 'holo') {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5));
      float a = ${kind === 'dot' ? 'smoothstep(0.045, 0.025, d)' : 'smoothstep(0.03, 0.015, d) + smoothstep(0.012, 0.0, abs(d - 0.3)) * step(0.0, 1.0)'};
      float tint = 0.08 * (1.0 - smoothstep(0.4, 0.5, d));
      gl_FragColor = vec4(mix(vec3(0.1, 0.18, 0.2), vec3(2.6, 0.22, 0.16), clamp(a, 0.0, 1.0)), max(tint, clamp(a, 0.0, 1.0))); }`, // brighter than white: the bloom makes it glow
  });
}
/** A magnified optic's lens: the scope camera's picture, a crosshair, dark round the edge. */
export function scopeLensMat(tex: THREE.Texture, mil: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { tScope: { value: tex }, live: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tScope; uniform float live; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5; float d = length(p);
        vec3 c = live > 0.5 ? texture2D(tScope, vUv).rgb : vec3(0.03, 0.05, 0.06);
        float line = step(abs(p.x), 0.0035) + step(abs(p.y), 0.0035);
        ${mil ? 'line *= step(0.04, d) + step(d, 0.012); float dots = step(fract(abs(p.x) * 25.0), 0.12) * step(abs(p.y), 0.012) + step(fract(abs(p.y) * 25.0), 0.12) * step(abs(p.x), 0.012); line += dots * step(d, 0.42);' : 'line *= step(d, 0.45); c += vec3(1.0, 0.15, 0.1) * smoothstep(0.016, 0.008, distance(p, vec2(0.0, -0.06)));'}
        c = mix(c, vec3(0.0), clamp(line, 0.0, 1.0) * 0.95);
        c *= 1.0 - smoothstep(0.38, 0.5, d);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export function buildGun(gun: Gun, { lite = false, scopeTex = null as THREE.Texture | null } = {}): GunRig {
  if (!lite && WEAPONS[gun.base].model.body === 'ar') return buildRifle(gun, scopeTex);
  const b = WEAPONS[gun.base], s = gunStats(gun), md: GunModel = b.model, m = M();
  const g = new THREE.Group();
  const receiver = new THREE.Group(), barrel = new THREE.Group();
  receiver.name = 'Receiver'; barrel.name = 'Barrel';
  g.add(receiver, barrel);
  const body = md.color === 0x9ca3af ? new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.95, roughness: 0.25 }) : gun.rarity === 4 ? m.gold : (m.metal as THREE.MeshStandardMaterial).clone();
  if (gun.rarity < 4 && md.color !== 0x9ca3af) (body as THREE.MeshStandardMaterial).color.set(md.color).multiplyScalar(1.7); // the arsenal's colours are for flat paint; brushed metal needs them lighter
  const accent = gun.rarity === 4 ? m.gold : gun.rarity === 3 ? m.violet : m.dark;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], rot?: [number, number, number], parent: THREE.Object3D = receiver) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...at); if (rot) mesh.rotation.set(...rot); mesh.castShadow = !lite; parent.add(mesh); return mesh;
  };
  const box = (w: number, h: number, d: number, r = 0.006) => (lite ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2 - 0.001)));
  const cyl = (r: number, len: number, seg = 14) => new THREE.CylinderGeometry(r, r, len, lite ? 8 : seg).rotateX(Math.PI / 2);
  const pistol = b.cls === 'pistol', L = md.len, bar = md.barrel;
  const rh = pistol ? 0.055 : md.body === 'heavy' ? 0.1 : 0.072, rw = pistol ? 0.03 : 0.046;
  // The bolt carrier: a pistol's whole slide, otherwise the bright bolt face in the ejection port.
  let boltCarrier: THREE.Object3D | null = null, boltTravel = 0, chargingHandle: THREE.Object3D | null = null, handle: GunRig['handle'] = 'none';
  // Receiver (the body), with an upper rail on long guns.
  if (md.body === 'bullpup') {
    add(box(rw + 0.01, rh + 0.03, L), body, [0, 0, 0.05]);
    add(box(0.03, 0.05, 0.22), m.polymer, [0, 0.07, -0.08]); // carry handle
  } else if (pistol) {
    boltCarrier = new THREE.Group(); boltCarrier.name = 'Slide'; receiver.add(boltCarrier); boltTravel = 0.028; handle = 'slide';
    add(box(rw, rh * 0.7, L), body, [0, 0.012, 0], undefined, boltCarrier);
    if (!lite) for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(rw + 0.002, rh * 0.5, 0.003), m.dark, [0, 0.014, L / 2 - 0.012 - i * 0.007], undefined, boltCarrier); // slide serrations
    add(box(rw * 0.92, rh * 0.45, L * 0.95), accent, [0, -0.02, 0]);
  } else {
    add(box(rw, rh, L), body, [0, 0, 0]);
    add(box(rw * 0.9, rh * 0.5, L * 0.8), accent, [0, -rh * 0.55, 0.02]);
  }
  if (!pistol && md.body !== 'bullpup') {
    // A Picatinny rail with machined ridges along the top.
    add(box(0.022, 0.01, L * 1.05, 0.002), m.dark, [0, rh / 2 + 0.005, -0.02]);
    const ridges = lite ? 6 : 16;
    for (let i = 0; i < ridges; i++) add(new THREE.BoxGeometry(0.024, 0.005, L * 1.05 / ridges * 0.45), m.dark, [0, rh / 2 + 0.012, -0.02 - L * 0.525 + (i + 0.5) * (L * 1.05 / ridges)]);
  }
  const front = -L / 2;
  // Handguard and barrel.
  const guardLen = pistol ? 0 : md.body === 'bullpup' ? 0.12 : md.guard === 'heavy' ? 0.3 : 0.26;
  if (guardLen) {
    const gm = md.guard === 'wood' ? m.wood : md.guard === 'heavy' ? body : m.polymer;
    add(box(md.guard === 'slim' ? 0.04 : 0.052, md.guard === 'heavy' ? 0.07 : 0.06, guardLen, 0.01), gm, [0, -0.004, front - guardLen / 2], undefined, barrel);
    if (md.guard === 'rail' || md.guard === 'heavy') for (let i = 0; i < (lite ? 6 : 12); i++) add(new THREE.BoxGeometry(0.056, 0.004, guardLen / (lite ? 6 : 12) * 0.5), m.dark, [0, 0.03, front - 0.01 - (i + 0.5) * (guardLen / (lite ? 6 : 12))], undefined, barrel);
    if (!lite && md.guard !== 'wood') for (const x of [-1, 1]) for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.003, 0.012, 0.03), m.dark, [x * (md.guard === 'slim' ? 0.021 : 0.027), -0.004, front - 0.04 - i * (guardLen / 4)], undefined, barrel); // vent slots
  }
  const barrelLen = pistol ? 0.02 : bar - guardLen * 0.4;
  const barrelStart = front - guardLen;
  if (!pistol) add(cyl(md.body === 'heavy' ? 0.016 : 0.01, barrelLen), m.dark, [0, 0.008, barrelStart - barrelLen / 2], undefined, barrel);
  let muzzleZ = pistol ? front - 0.005 : barrelStart - barrelLen;
  if (md.body === 'ak' || md.body === 'battle') add(box(0.02, 0.02, 0.05), m.dark, [0, 0.015, muzzleZ + 0.02], undefined, barrel); // gas block
  if (md.body === 'heavy') { add(box(0.07, 0.05, 0.06), m.dark, [0, 0.008, muzzleZ - 0.02], undefined, barrel); muzzleZ -= 0.05; } // muzzle brake
  // The pump's fore-end; the bolt handle.
  let pump: THREE.Object3D | null = null, bolt: THREE.Object3D | null = null;
  if (md.body === 'pump') { pump = add(box(0.05, 0.05, 0.16, 0.012), m.wood, [0, -0.04, front - 0.18], undefined, barrel); add(cyl(0.012, bar * 0.8), m.dark, [0, -0.038, front - bar * 0.4], undefined, barrel); }
  if (md.body === 'bolt' || md.body === 'heavy') { bolt = new THREE.Group(); bolt.name = 'Bolt'; bolt.position.set(0.03, 0.02, L * 0.15); receiver.add(bolt); add(cyl(0.006, 0.05).rotateY(Math.PI / 2), m.steel, [0.02, 0, 0], undefined, bolt); add(new THREE.SphereGeometry(0.011, 10, 8), m.dark, [0.045, 0, 0], undefined, bolt); handle = 'none'; }
  // Ejection port, the bolt carrier behind it, and the charging handle.
  const portZ = pistol ? 0 : md.body === 'bullpup' ? 0.12 : -0.02;
  if (!pistol && !bolt && md.body !== 'pump') {
    add(new THREE.BoxGeometry(0.002, 0.022, 0.06), m.dark, [rw / 2 + 0.001, 0.01, portZ]); // the port's dark opening
    boltCarrier = new THREE.Group(); boltCarrier.name = 'BoltCarrier'; boltCarrier.position.set(rw / 2 - 0.004, 0.01, portZ); receiver.add(boltCarrier);
    add(new THREE.BoxGeometry(0.008, 0.016, 0.05), m.steel, [0, 0, 0], undefined, boltCarrier); boltTravel = 0.022;
    if (md.body === 'ak' || md.body === 'battle' || md.body === 'lmg') {
      // A side charging handle riding on the carrier.
      add(box(0.03, 0.01, 0.012, 0.003), m.steel, [0.018, 0, 0.012], undefined, boltCarrier); handle = 'side'; chargingHandle = boltCarrier;
    } else {
      // The T-shaped charging handle at the back of the top rail.
      chargingHandle = new THREE.Group(); chargingHandle.name = 'ChargingHandle'; chargingHandle.position.set(0, rh / 2 + 0.004, (md.body === 'bullpup' ? 0.15 : L / 2) - 0.012); receiver.add(chargingHandle);
      add(new THREE.BoxGeometry(0.012, 0.008, 0.05), m.dark, [0, 0, 0], undefined, chargingHandle);
      add(box(0.05, 0.01, 0.014, 0.003), m.dark, [0, 0, 0.022], undefined, chargingHandle); handle = 'top';
    }
  }
  // Stock and grip.
  const rear = L / 2;
  if (md.stock === 'tube') { add(cyl(0.012, 0.16), m.dark, [0, 0, rear + 0.08]); add(box(0.04, 0.09, 0.05, 0.01), m.polymer, [0, -0.02, rear + 0.18]); }
  if (md.stock === 'skeleton') { add(box(0.012, 0.01, 0.22), m.polymer, [0, 0.02, rear + 0.11]); add(box(0.012, 0.01, 0.2), m.polymer, [0, -0.05, rear + 0.1]); add(box(0.04, 0.1, 0.03, 0.01), m.polymer, [0, -0.015, rear + 0.22]); }
  if (md.stock === 'wood') add(box(0.042, 0.075, 0.26, 0.012), m.wood, [0, -0.025, rear + 0.13], [-0.12, 0, 0]);
  if (md.stock === 'fixed') add(box(0.045, 0.1, 0.24, 0.012), md.body === 'heavy' ? body : m.polymer, [0, -0.02, rear + 0.12]);
  if (md.stock === 'folded') add(box(0.01, 0.05, 0.14), m.dark, [0.03, -0.01, rear - 0.07]);
  const gripZ = md.body === 'bullpup' ? -0.12 : pistol ? 0.04 : rear - 0.06;
  const gripMesh = add(box(0.03, pistol ? 0.11 : 0.1, 0.045, 0.008), md.stock === 'wood' && md.wood ? m.wood : m.polymer, [0, pistol ? -0.07 : -0.08, gripZ], [0.28, 0, 0]);
  add(box(0.012, 0.03, 0.04, 0.003), m.dark, [0, -0.04, gripZ - 0.045]); // trigger guard
  if (!lite) add(new THREE.BoxGeometry(0.004, 0.018, 0.004), m.steel, [0, -0.04, gripZ - 0.035], [0.3, 0, 0]); // trigger
  // The magazine (its own part: it comes out on reloads).
  const extended = gun.att.mag === 'extmag', ml = extended ? 1.45 : 1;
  const mag = new THREE.Group(), magZ = md.body === 'bullpup' ? 0.16 : pistol ? gripZ + 0.005 : front + L * 0.35;
  mag.name = 'Magazine';
  if (md.mag === 'curved') { for (let i = 0; i < 4; i++) add(box(0.026, 0.05 * ml, 0.06), i % 2 ? m.dark : accent === m.dark ? m.metal : accent, [0, -0.025 - i * 0.045 * ml, -i * 0.012 * ml], [-0.12 * i, 0, 0], mag); }
  else if (md.mag === 'straight' || md.mag === 'stick') add(box(0.024, 0.16 * ml, 0.055), m.dark, [0, -0.08 * ml, 0], undefined, mag);
  else if (md.mag === 'box') add(box(0.06, 0.11 * ml, 0.1), md.body === 'lmg' ? m.tan : m.dark, [md.body === 'lmg' ? -0.02 : 0, -0.06 * ml, 0], undefined, mag);
  else if (md.mag === 'drum') add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 20).rotateZ(Math.PI / 2), m.dark, [0, -0.07, 0], undefined, mag);
  else if (md.mag === 'grip') add(box(0.024, 0.02 * ml, 0.04), m.dark, [0, -0.125 - (ml - 1) * 0.04, 0], undefined, mag);
  if (md.mag === 'tube') add(cyl(0.011, bar * 0.7), m.dark, [0, -0.035, front - bar * 0.35], undefined, mag);
  if (!lite && md.mag !== 'tube' && md.mag !== 'grip') add(new THREE.BoxGeometry(0.02, 0.006, 0.04), m.brass, [0, 0.004, -0.004], undefined, mag); // the top round
  mag.position.set(0, pistol ? -0.02 : -rh * 0.4, magZ);
  g.add(mag);
  // Iron sights (a hooded front post, a rear aperture), folded down under an optic; on a pistol they ride the slide.
  const optic = s.optic;
  const sightY = pistol ? rh * 0.5 + 0.01 : rh / 2 + 0.025;
  if (!optic || pistol) {
    const sp = pistol && boltCarrier ? boltCarrier : receiver;
    add(box(0.006, 0.02, 0.006, 0.001), m.dark, [0, sightY, pistol ? front + 0.01 : front - guardLen + 0.01], undefined, pistol ? sp : barrel);
    if (!pistol && !lite) for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.003, 0.024, 0.01), m.dark, [x * 0.008, sightY, front - guardLen + 0.01], undefined, barrel); // the post's hood
    add(box(0.022, 0.016, 0.008, 0.001), m.dark, [0, sightY - 0.002, pistol ? rear - 0.015 : rear - 0.03], undefined, sp);
    if (!lite) add(new THREE.BoxGeometry(0.004, 0.004, 0.004), new THREE.MeshBasicMaterial({ color: 0x9dff8a }), [0, sightY + 0.008, pistol ? front + 0.009 : front - guardLen + 0.007], undefined, pistol ? sp : barrel); // a tritium dot
  }
  // The eye point: behind the rear sight, on the bore line of the sights.
  const eye = new THREE.Object3D();
  let eyeY = sightY + 0.006, eyeZ = rear + (pistol ? 0.2 : 0.06), lens: THREE.Mesh | null = null, opticGroup: THREE.Group | null = null;
  if (optic && !pistol) {
    opticGroup = new THREE.Group(); opticGroup.name = 'Optic'; receiver.add(opticGroup);
    const O = opticGroup, oz = -0.02, top = rh / 2 + 0.012;
    if (optic === 'reddot') { add(box(0.034, 0.03, 0.05, 0.006), m.polymer, [0, top + 0.02, oz], undefined, O); add(new THREE.PlaneGeometry(0.028, 0.028), m.glass, [0, top + 0.032, oz - 0.021], undefined, O); lens = add(new THREE.PlaneGeometry(0.026, 0.026), reticleMat('dot'), [0, top + 0.032, oz - 0.022], undefined, O); eyeY = top + 0.032; }
    if (optic === 'holo') { add(box(0.04, 0.012, 0.07, 0.004), m.polymer, [0, top + 0.006, oz], undefined, O); add(box(0.004, 0.038, 0.004), m.polymer, [0.02, top + 0.03, oz - 0.03], undefined, O); add(box(0.004, 0.038, 0.004), m.polymer, [-0.02, top + 0.03, oz - 0.03], undefined, O); add(box(0.044, 0.004, 0.004), m.polymer, [0, top + 0.05, oz - 0.03], undefined, O); lens = add(new THREE.PlaneGeometry(0.036, 0.03), reticleMat('holo'), [0, top + 0.032, oz - 0.03], undefined, O); eyeY = top + 0.032; }
    if (optic === 'acog' || optic === 'scope8') {
      const big = optic === 'scope8', len = big ? 0.3 : 0.16, r = big ? 0.02 : 0.017, y = top + (big ? 0.045 : 0.035);
      add(cyl(r, len), m.dark, [0, y, oz], undefined, O); add(new THREE.CylinderGeometry(big ? 0.03 : 0.022, r, big ? 0.07 : 0.03, 16).rotateX(-Math.PI / 2), m.dark, [0, y, oz - len / 2 - (big ? 0.03 : 0.012)], undefined, O);
      add(new THREE.CylinderGeometry(0.024, r, 0.03, 16).rotateX(Math.PI / 2), m.dark, [0, y, oz + len / 2 + 0.012], undefined, O);
      add(box(0.02, y - top, 0.03), m.dark, [0, top + (y - top) / 2, oz - len * 0.25], undefined, O); add(box(0.02, y - top, 0.03), m.dark, [0, top + (y - top) / 2, oz + len * 0.25], undefined, O);
      if (big) { add(cyl(0.008, 0.02).rotateY(Math.PI / 2), m.dark, [0.03, y, oz], undefined, O); add(cyl(0.008, 0.02), m.dark, [0, y + 0.03, oz], undefined, O); }
      lens = add(new THREE.CircleGeometry(r * 0.92, 24), scopeTex ? scopeLensMat(scopeTex, big) : m.glass, [0, y, oz + len / 2 + 0.026], undefined, O);
      eyeY = y; eyeZ = oz + len / 2 + 0.09;
    }
  }
  eye.position.set(0, eyeY, eyeZ); g.add(eye);
  // Muzzle devices.
  if (gun.att.muzzle === 'suppressor') { add(cyl(pistol ? 0.014 : 0.019, pistol ? 0.13 : 0.18), m.dark, [0, 0.008, muzzleZ - (pistol ? 0.065 : 0.09)], undefined, barrel); muzzleZ -= pistol ? 0.13 : 0.18; }
  if (gun.att.muzzle === 'comp') { add(box(0.03, 0.026, 0.05, 0.004), body, [0, 0.008, muzzleZ - 0.025], undefined, barrel); muzzleZ -= 0.05; }
  if (gun.att.muzzle === 'flashhider') { for (let i = 0; i < 3; i++) add(box(0.006, 0.006, 0.05), m.dark, [Math.cos(i * 2.1) * 0.01, 0.008 + Math.sin(i * 2.1) * 0.01, muzzleZ - 0.025], undefined, barrel); muzzleZ -= 0.05; }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, pistol ? 0.012 : 0.008, muzzleZ); g.add(muzzle);
  // Underbarrel.
  let foreZ = front - guardLen * 0.55, foreY = -0.05, laser: THREE.Object3D | null = null;
  if (gun.att.under === 'vgrip' && guardLen) { add(box(0.025, 0.08, 0.03, 0.008), m.polymer, [0, -0.07, foreZ], undefined, barrel); foreY = -0.09; }
  if (gun.att.under === 'agrip' && guardLen) { add(box(0.026, 0.035, 0.07, 0.008), m.polymer, [0, -0.045, foreZ], [-0.6, 0, 0], barrel); foreY = -0.06; }
  if (gun.att.under === 'laser') {
    const lz = pistol ? front + 0.03 : foreZ - 0.04;
    add(box(0.024, 0.024, 0.05, 0.004), m.polymer, [0, pistol ? -0.035 : -0.04, lz], undefined, barrel);
    laser = new THREE.Object3D(); laser.position.set(0, pistol ? -0.035 : -0.04, lz - 0.026); g.add(laser);
    add(new THREE.SphereGeometry(0.004, 6, 4), m.red, [0, 0, 0], undefined, laser);
  }
  if (pistol) { foreZ = gripZ + 0.01; foreY = -0.08; }
  const fore = new THREE.Object3D(); fore.position.set(0, foreY, foreZ); g.add(fore);
  const grip = new THREE.Object3D(); grip.position.copy(gripMesh.position).add(new THREE.Vector3(0, -0.01, 0)); g.add(grip);
  const port = new THREE.Object3D(); port.position.set(rw / 2, 0.01, portZ); g.add(port);
  return { group: g, receiver, barrel, optic: opticGroup, muzzle, eye, port, mag, magHome: mag.position.clone(), fore, grip, boltCarrier, boltTravel, chargingHandle, handle, lens, pump, bolt, laser, zoom: s.zoom, tube: md.mag === 'tube', foregrip: gun.att.under === 'vgrip' && !pistol };
}

/* ── The detailed carbine (M4-pattern) for the first-person view ── */
let rifleMats: Record<string, THREE.Material> | null = null;
function RM(tint: number) {
  const base = rifleMats ?? (rifleMats = {
    steel: surface('gunmetal', { color: 0x6a6e74, metal: 0.9, rough: 0.28, bump: 0.4 }),
    dark: surface('gunmetal', { color: 0x2e3135, metal: 0.85, rough: 0.35, bump: 0.35 }),
    // The sight's hood: matte anodised (shiny metal there mirrored the sky white and the ground black).
    optic: surface('gunmetal', { color: 0x3a3d42, metal: 0.4, rough: 0.62, bump: 0.3 }),
    polymer: surface('polymer', { color: 0x2a2b2e, metal: 0.05, rough: 0.72, bump: 0.7 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.95 }),
    tan: surface('polymer', { color: 0xa48a64, metal: 0.05, rough: 0.7, bump: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd2a645, metalness: 1, roughness: 0.25 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb8673a, metalness: 1, roughness: 0.3 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc6d8, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false }),
    lensDark: new THREE.MeshStandardMaterial({ color: 0x0c1a22, metalness: 0.9, roughness: 0.1 }),
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.18), toneMapped: false }),
    beam: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.05, 0.05), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  });
  // The receiver and handguard: anodised aluminium in the gun's own colour (flat dark earth on the carbine).
  const ano = surface('gunmetal', { color: tint, metal: 0.55, rough: 0.45, bump: 0.45 });
  return { ...base, ano } as Record<string, THREE.Material>;
}

function buildRifle(gun: Gun, scopeTex: THREE.Texture | null): GunRig {
  const s = gunStats(gun), md = WEAPONS[gun.base].model, mt = RM(new THREE.Color(md.color).multiplyScalar(1.5).getHex());
  const g = new THREE.Group(), receiver = new THREE.Group(), barrel = new THREE.Group();
  receiver.name = 'Receiver'; barrel.name = 'Barrel'; g.add(receiver, barrel);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], rot?: [number, number, number], parent: THREE.Object3D = receiver) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...at); if (rot) mesh.rotation.set(...rot); parent.add(mesh); return mesh;
  };
  const rb = (w: number, h: number, d: number, r = 0.003) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2 - 0.0005));
  const cyl = (r0: number, r1: number, len: number, seg = 16) => new THREE.CylinderGeometry(r1, r0, len, seg).rotateX(Math.PI / 2);
  // Upper receiver (the bore runs along y = 0, the muzzle toward −z), its top rail with ridges.
  add(rb(0.034, 0.034, 0.23, 0.004), mt.ano, [0, 0.013, 0]);
  add(rb(0.022, 0.007, 0.23, 0.0015), mt.ano, [0, 0.0335, 0]);
  for (let i = 0; i < 14; i++) add(new THREE.BoxGeometry(0.024, 0.004, 0.0075), mt.ano, [0, 0.039, -0.108 + i * 0.0165]);
  // Lower receiver, the flared magazine well, trigger guard and trigger, selector, magazine release.
  add(rb(0.03, 0.034, 0.18, 0.004), mt.ano, [0, -0.02, 0.015]);
  const well = new THREE.BoxGeometry(0.036, 0.05, 0.058, 2, 2, 2), wp = well.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wp.count; i++) if (wp.getY(i) < 0) wp.setX(i, wp.getX(i) * 1.12);
  well.computeVertexNormals();
  add(well, mt.ano, [0, -0.03, -0.052]);
  add(new THREE.BoxGeometry(0.004, 0.004, 0.055), mt.ano, [0, -0.052, 0.025]); // guard
  add(new THREE.BoxGeometry(0.004, 0.016, 0.004), mt.ano, [0, -0.045, -0.002]);
  add(new THREE.BoxGeometry(0.003, 0.016, 0.004), mt.steel, [0, -0.043, 0.022], [0.35, 0, 0]); // trigger
  add(cyl(0.005, 0.005, 0.004, 12).rotateY(Math.PI / 2), mt.steel, [-0.0165, -0.016, 0.05]); // selector
  add(new THREE.BoxGeometry(0.003, 0.004, 0.016), mt.steel, [-0.0185, -0.016, 0.045], [0.5, 0, 0]);
  add(cyl(0.004, 0.004, 0.004, 10).rotateY(Math.PI / 2), mt.steel, [0.0165, -0.018, -0.03]); // magazine release
  // The ejection port (its bolt carrier showing), the dust cover hanging open, the brass deflector, the forward assist.
  add(new THREE.BoxGeometry(0.0012, 0.017, 0.062), mt.hole, [0.0172, 0.012, -0.005]);
  const boltCarrier = new THREE.Group(); boltCarrier.name = 'BoltCarrier'; boltCarrier.position.set(0.0158, 0.012, -0.005); receiver.add(boltCarrier);
  add(new THREE.BoxGeometry(0.004, 0.012, 0.05), mt.steel, [0, 0, 0], undefined, boltCarrier);
  add(cyl(0.003, 0.003, 0.006, 10), mt.steel, [0, 0, -0.027], undefined, boltCarrier);
  add(new THREE.BoxGeometry(0.0015, 0.02, 0.064), mt.ano, [0.0205, -0.006, -0.005], [0, 0, -1.15]);
  add(rb(0.006, 0.012, 0.012, 0.002), mt.ano, [0.019, 0.022, 0.034]);
  add(cyl(0.0055, 0.0055, 0.026, 12), mt.ano, [0.0185, 0.022, 0.07], [0, 0.12, 0]);
  add(cyl(0.0058, 0.0058, 0.004, 12), mt.steel, [0.0195, 0.022, 0.085], [0, 0.12, 0]);
  // The T-shaped charging handle at the back of the upper.
  const chargingHandle = new THREE.Group(); chargingHandle.name = 'ChargingHandle'; chargingHandle.position.set(0, 0.026, 0.118); receiver.add(chargingHandle);
  add(new THREE.BoxGeometry(0.01, 0.006, 0.03), mt.dark, [0, 0, -0.008], undefined, chargingHandle);
  add(rb(0.048, 0.007, 0.012, 0.002), mt.dark, [0, 0, 0.008], undefined, chargingHandle);
  // Buffer tube, the stock with its cheek rest and rubber butt pad, the pistol grip.
  add(cyl(0.0135, 0.0135, 0.16, 18), mt.dark, [0, 0.004, 0.195]);
  add(rb(0.04, 0.058, 0.11, 0.008), mt.polymer, [0, -0.006, 0.255]);
  add(rb(0.03, 0.016, 0.08, 0.005), mt.polymer, [0, 0.028, 0.25]);
  add(rb(0.043, 0.082, 0.014, 0.004), mt.rubber, [0, -0.012, 0.316]);
  add(rb(0.028, 0.092, 0.04, 0.007), mt.polymer, [0, -0.07, 0.07], [0.32, 0, 0]);
  // The octagonal M-LOK handguard, built face by face so its slots are real gaps you see the barrel and gas tube through.
  const HG0 = -0.115, HGL = 0.36, ap = 0.028, face = 2 * ap * Math.tan(Math.PI / 8) + 0.0006, cy = 0.004;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, nx = Math.cos(a), ny = Math.sin(a), slotted = i === 0 || i === 4 || i === 6 || i === 7 || i === 5;
    const piece = (z0: number, len: number) => add(new THREE.BoxGeometry(0.0028, face, len), mt.ano, [nx * ap, cy + ny * ap, z0 - len / 2], [0, 0, a], barrel);
    if (!slotted) { piece(HG0, HGL); continue; }
    // Solid rings at both ends, a row of slots between.
    piece(HG0, 0.03); piece(HG0 - HGL + 0.03, 0.03);
    const n = 7, span = HGL - 0.06, cell = span / n;
    for (let k = 0; k < n; k++) piece(HG0 - 0.03 - k * cell, cell * 0.55);
  }
  add(rb(0.02, 0.006, HGL, 0.0015), mt.ano, [0, cy + ap + 0.004, HG0 - HGL / 2], undefined, barrel);
  for (let i = 0; i < 22; i++) add(new THREE.BoxGeometry(0.022, 0.004, 0.0075), mt.ano, [0, cy + ap + 0.009, HG0 - 0.008 - i * (HGL / 22)], undefined, barrel);
  // Barrel, gas block and the silver gas tube inside the handguard; the three-prong flash hider (or another muzzle device).
  add(cyl(0.0095, 0.0095, 0.5, 18), mt.dark, [0, 0, -0.35], undefined, barrel);
  add(rb(0.02, 0.022, 0.024, 0.003), mt.dark, [0, 0.004, -0.39], undefined, barrel);
  add(cyl(0.0028, 0.0028, 0.27, 8), mt.steel, [0, 0.0145, -0.255], undefined, barrel);
  let muzzleZ = -0.6;
  if (gun.att.muzzle === 'suppressor') { add(cyl(0.019, 0.019, 0.17, 20), mt.dark, [0, 0, muzzleZ - 0.085], undefined, barrel); for (let i = 0; i < 3; i++) add(cyl(0.0195, 0.0195, 0.006, 20), mt.steel, [0, 0, muzzleZ - 0.03 - i * 0.055], undefined, barrel); muzzleZ -= 0.17; }
  else if (gun.att.muzzle === 'comp') { add(rb(0.03, 0.026, 0.05, 0.004), mt.dark, [0, 0, muzzleZ - 0.025], undefined, barrel); for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.002, 0.012, 0.03), mt.hole, [x * 0.0152, 0.004, muzzleZ - 0.025], undefined, barrel); muzzleZ -= 0.05; }
  else {
    add(cyl(0.011, 0.011, 0.018, 16), mt.dark, [0, 0, muzzleZ - 0.009], undefined, barrel);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 2; add(new THREE.BoxGeometry(0.004, 0.004, 0.036), mt.dark, [Math.cos(a) * 0.0085, Math.sin(a) * 0.0085, muzzleZ - 0.036], undefined, barrel); }
    muzzleZ -= 0.054;
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, muzzleZ - 0.004); g.add(muzzle);
  // The PEQ laser box on the front of the top rail at one o'clock, its faint beam.
  add(rb(0.034, 0.026, 0.062, 0.004), mt.tan, [0.012, cy + ap + 0.024, -0.42], undefined, barrel);
  for (const [x, y] of [[0.004, 0.006], [0.02, 0.004]] as const) add(new THREE.CircleGeometry(0.005, 14), mt.lensDark, [0.012 + x - 0.012, cy + ap + 0.024 + y - 0.004, -0.4515], [0, Math.PI, 0], barrel);
  add(rb(0.01, 0.006, 0.016, 0.002), mt.dark, [0.012, cy + ap + 0.039, -0.41], undefined, barrel);
  const laser = new THREE.Object3D(); laser.position.set(0.016, cy + ap + 0.026, -0.452); g.add(laser);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0012, 40, 6).rotateX(Math.PI / 2).translate(0, 0, -20), mt.beam); beam.name = 'Beam'; laser.add(beam);
  // The vertical foregrip.
  const foreZ = -0.27, gripTop = cy - ap - 0.002;
  add(cyl(0.0125, 0.0125, 0.012, 16).rotateX(-Math.PI / 2), mt.polymer, [0, gripTop - 0.006, foreZ], undefined, barrel);
  add(new THREE.CylinderGeometry(0.0125, 0.0115, 0.075, 16), mt.polymer, [0, gripTop - 0.045, foreZ], undefined, barrel);
  for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.0131, 0.0131, 0.003, 16), mt.polymer, [0, gripTop - 0.02 - i * 0.016, foreZ], undefined, barrel);
  // The curved 30-round magazine: three angled segments, ribbed sides, a tan base plate, the brass top round.
  const mag = new THREE.Group(); mag.name = 'Magazine';
  const segs: [number, number, number, number][] = [[0, -0.032, 0.002, 0], [0, -0.092, -0.006, 0.13], [0, -0.148, -0.021, 0.27]];
  for (const [x, y, z, rx] of segs) {
    add(rb(0.023, 0.062, 0.062, 0.004), mt.polymer, [x, y, z], [rx, 0, 0], mag);
    for (const side of [-1, 1]) for (let r = 0; r < 3; r++) add(new THREE.BoxGeometry(0.0016, 0.006, 0.042), mt.polymer, [side * 0.0122, y + 0.018 - r * 0.018, z], [rx, 0, 0], mag);
  }
  add(rb(0.027, 0.012, 0.07, 0.004), mt.tan, [0, -0.182, -0.032], [0.27, 0, 0], mag);
  add(cyl(0.0045, 0.0045, 0.042, 12), mt.brass, [0, 0.0045, 0.002], undefined, mag);
  add(new THREE.ConeGeometry(0.0045, 0.014, 12).rotateX(-Math.PI / 2), mt.copper, [0, 0.0045, -0.026], undefined, mag);
  mag.position.set(0, -0.03, -0.052); g.add(mag);
  // The sight: a thin holographic frame round clear glass with a glowing ring-and-dot (or a red dot, a magnified optic, or thin flip-up irons).
  const optic = s.optic, opticGroup = new THREE.Group(); opticGroup.name = 'Optic'; receiver.add(opticGroup);
  const top = 0.0425;
  let eyeY = 0.052, eyeZ = 0.16, lens: THREE.Mesh | null = null, zoomEye = false;
  if (optic === 'holo' || optic === 'reddot') {
    const W = optic === 'holo' ? 0.046 : 0.032, H = optic === 'holo' ? 0.042 : 0.03, wy = top + 0.012 + H / 2;
    add(rb(0.022, 0.007, 0.07, 0.002), mt.dark, [0, top + 0.004, -0.025], undefined, opticGroup); // a slim base on the rail
    for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.004, H, 0.034), mt.optic, [x * (W / 2), wy, -0.038], undefined, opticGroup);
    add(new THREE.BoxGeometry(W + 0.004, 0.004, 0.034), mt.optic, [0, wy + H / 2, -0.038], undefined, opticGroup);
    add(rb(0.012, 0.01, 0.012, 0.002), mt.dark, [W / 2 + 0.006, wy, -0.03], undefined, opticGroup); // the brightness buttons
    add(new THREE.PlaneGeometry(W - 0.002, H - 0.002), mt.glass, [0, wy, -0.054], undefined, opticGroup);
    lens = add(new THREE.RingGeometry(optic === 'holo' ? 0.0085 : 0.0001, optic === 'holo' ? 0.0098 : 0.0002, 40), mt.red, [0, wy, -0.0545], undefined, opticGroup);
    add(new THREE.CircleGeometry(0.0013, 14), mt.red, [0, wy, -0.0546], undefined, opticGroup);
    eyeY = wy; eyeZ = 0.05;
  } else if (optic === 'acog' || optic === 'scope8') {
    const big = optic === 'scope8', len = big ? 0.3 : 0.16, r = big ? 0.02 : 0.017, y = top + (big ? 0.045 : 0.035), oz = -0.02;
    add(cyl(r, r, len, 24), mt.dark, [0, y, oz], undefined, opticGroup);
    add(new THREE.CylinderGeometry(big ? 0.03 : 0.022, r, big ? 0.07 : 0.03, 24).rotateX(-Math.PI / 2), mt.dark, [0, y, oz - len / 2 - (big ? 0.03 : 0.012)], undefined, opticGroup);
    add(new THREE.CylinderGeometry(0.024, r, 0.03, 24).rotateX(Math.PI / 2), mt.dark, [0, y, oz + len / 2 + 0.012], undefined, opticGroup);
    for (const k of [-0.25, 0.25]) add(rb(0.02, y - top, 0.03), mt.dark, [0, top + (y - top) / 2, oz + len * k], undefined, opticGroup);
    lens = add(new THREE.CircleGeometry(r * 0.92, 32), scopeTex ? scopeLensMat(scopeTex, big) : mt.glass, [0, y, oz + len / 2 + 0.026], undefined, opticGroup);
    eyeY = y; eyeZ = oz + len / 2 + 0.09; zoomEye = true;
  } else {
    // Flip-up irons: a thin front post with protective ears, a rear aperture ring.
    add(rb(0.016, 0.008, 0.02, 0.002), mt.dark, [0, cy + ap + 0.012, -0.455], undefined, barrel);
    add(new THREE.BoxGeometry(0.0018, 0.016, 0.0018), mt.dark, [0, cy + ap + 0.022, -0.455], undefined, barrel);
    for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.002, 0.018, 0.008), mt.dark, [x * 0.007, cy + ap + 0.021, -0.455], undefined, barrel);
    add(rb(0.018, 0.008, 0.02, 0.002), mt.dark, [0, top + 0.004, 0.09], undefined, opticGroup);
    add(new THREE.TorusGeometry(0.0045, 0.0013, 8, 20), mt.dark, [0, top + 0.016, 0.092], undefined, opticGroup);
    add(new THREE.BoxGeometry(0.0016, 0.008, 0.002), mt.dark, [0, top + 0.009, 0.092], undefined, opticGroup);
    eyeY = top + 0.016; eyeZ = 0.2;
  }
  void zoomEye;
  const eye = new THREE.Object3D(); eye.position.set(0, eyeY, eyeZ); g.add(eye);
  const fore = new THREE.Object3D(); fore.name = 'ForegripSocket'; fore.position.set(0, gripTop - 0.045, foreZ); g.add(fore);
  const grip = new THREE.Object3D(); grip.position.set(0, -0.07, 0.07); g.add(grip);
  const port = new THREE.Object3D(); port.position.set(0.019, 0.012, -0.005); g.add(port);
  return { group: g, receiver, barrel, optic: opticGroup, muzzle, eye, port, mag, magHome: mag.position.clone(), fore, grip, boltCarrier, boltTravel: 0.022, chargingHandle, handle: 'top', lens, pump: null, bolt: null, laser, zoom: s.zoom, tube: false, foregrip: true };
}

/** A small, cheap copy of a gun for soldiers to carry and for loot on the ground. */
const liteCache = new Map<string, THREE.Object3D>();
export function liteGun(gun: Gun) {
  const key = `${gun.base}:${gun.rarity}:${Object.values(gun.att).join(',')}`;
  let g = liteCache.get(key);
  // Others' guns are drawn often and small: merged by material.
  if (!g) { g = mergeByMaterial(buildGun(gun, { lite: true }).group); liteCache.set(key, g); }
  return g.clone();
}

