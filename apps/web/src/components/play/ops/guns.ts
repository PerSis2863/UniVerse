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
  return { group: g, receiver, barrel, optic: opticGroup, muzzle, eye, port, mag, magHome: mag.position.clone(), fore, grip, boltCarrier, boltTravel, chargingHandle, handle, lens, pump, bolt, laser, zoom: s.zoom, tube: md.mag === 'tube' };
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

