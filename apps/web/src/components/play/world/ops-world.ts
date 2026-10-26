import { OPS_CELL, OPS_CELLS, OPS_SIZE, groundAt, type Block, type FoeKind, type OpsMap } from '@/lib/play/ops';
import { Avatar, RoundedBoxGeometry, THREE, glowSprite, type World } from './core';
import { surface } from './textures';

// Ridgeline Ops' island in three.js (rules and layout in src/lib/play/ops.ts): the terrain as one
// mesh coloured by height and slope, the sea, a sky that turns from afternoon to sunset, forests and
// rocks as instanced meshes (two draws for 640 trees), every outpost's walls, roofs, sandbags, tents
// and containers merged by material, crates, flags, landing pads, the soldiers and the helicopter.
// Solids go into a 16 m grid so walking, the camera and shots only test what's near.

const CELL = 16;
/** Solid boxes bucketed on a grid: `near` a point and `along` a shot return only those close by. */
export class SolidGrid {
  private cells = new Map<number, THREE.Box3[]>();
  private seen = new Set<THREE.Box3>();
  private key = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512);
  add(b: THREE.Box3) {
    for (let cx = Math.floor(b.min.x / CELL); cx <= Math.floor(b.max.x / CELL); cx++) for (let cz = Math.floor(b.min.z / CELL); cz <= Math.floor(b.max.z / CELL); cz++) {
      const k = this.key(cx, cz), list = this.cells.get(k);
      if (list) list.push(b); else this.cells.set(k, [b]);
    }
  }
  near(x: number, z: number, r: number, out: THREE.Box3[]) {
    out.length = 0; this.seen.clear();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
      for (const b of this.cells.get(this.key(cx, cz)) ?? []) if (!this.seen.has(b)) { this.seen.add(b); out.push(b); }
    }
    return out;
  }
  /** The boxes near a straight line (every 12 m along it, one cell either side). */
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
}

type RGB = [number, number, number];
const SAND: RGB = [0.78, 0.7, 0.5], GRASS: RGB = [0.33, 0.45, 0.2], MEADOW: RGB = [0.46, 0.55, 0.26], ROCK: RGB = [0.46, 0.44, 0.41], DIRT: RGB = [0.45, 0.37, 0.27], SEABED: RGB = [0.5, 0.48, 0.36];
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** The ground's colour at a height and slope, with a little variation (`n`, 0–1) and dirt near places. */
function groundColour(h: number, slope: number, n: number, dirt: number): RGB {
  let c: RGB = h < 0 ? SEABED : h < 1.8 ? mixRGB(SAND, GRASS, Math.max(0, (h - 1.1) / 0.7)) : mixRGB(GRASS, MEADOW, n);
  if (h > 24) c = mixRGB(c, ROCK, Math.min(1, (h - 24) / 8));
  c = mixRGB(c, ROCK, Math.min(1, Math.max(0, (slope - 0.55) * 2.2)));
  return mixRGB(c, DIRT, dirt);
}
const wobble = (x: number, z: number) => 0.5 + 0.25 * Math.sin(x * 0.07 + Math.sin(z * 0.05) * 2) + 0.25 * Math.sin(z * 0.09 - x * 0.03);

/** The terrain: one mesh over the height grid, triangles split the way `groundAt` reads them. */
export function terrain(m: OpsMap) {
  const row = OPS_CELLS + 1, N = row * row, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), uv = new Float32Array(N * 2), H = m.heights;
  const places = m.places.filter((p) => p.kind !== 'lz');
  for (let iz = 0; iz < row; iz++) for (let ix = 0; ix < row; ix++) {
    const i = iz * row + ix, x = ix * OPS_CELL - OPS_SIZE / 2, z = iz * OPS_CELL - OPS_SIZE / 2, h = H[i];
    const hx = H[iz * row + Math.min(row - 1, ix + 1)] - H[iz * row + Math.max(0, ix - 1)], hz = H[Math.min(row - 1, iz + 1) * row + ix] - H[Math.max(0, iz - 1) * row + ix];
    let dirt = 0;
    for (const p of places) dirt = Math.max(dirt, Math.max(0, 1 - Math.hypot(x - p.x, z - p.z) / (p.r + 5)) * 1.4);
    const c = groundColour(h, Math.hypot(hx, hz) / (2 * OPS_CELL), wobble(x, z), Math.min(0.85, dirt));
    // The palette is in screen (sRGB) colours; the renderer works in linear light.
    pos.set([x, h, z], i * 3); col.set([c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2], i * 3); uv.set([x / 7, z / 7], i * 2);
  }
  const idx: number[] = [];
  for (let iz = 0; iz < OPS_CELLS; iz++) for (let ix = 0; ix < OPS_CELLS; ix++) {
    const a = iz * row + ix, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = surface('ground', { bump: 0.7 });
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** The sea all round, a little glossy. */
export function sea() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x1f5f7a, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.9 }));
  m.rotation.x = -Math.PI / 2; m.position.y = -0.35;
  return m;
}

/** A sky dome: a gradient from the horizon up, and the sun's glow; follows the camera. */
export function sky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d7ec9) }, horizon: { value: new THREE.Color(0xcfe1ee) }, sunColor: { value: new THREE.Color(0xfff1c9) }, sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, horizon, sunColor, sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 c = mix(horizon, top, pow(max(d.y, 0.0), 0.5));
        float s = max(dot(d, sunDir), 0.0);
        c += sunColor * (pow(s, 900.0) * 4.0 + pow(s, 14.0) * 0.4);
        if (d.y < 0.0) c = mix(horizon, horizon * 0.75, min(1.0, -d.y * 5.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(360, 32, 16), mat);
  dome.renderOrder = -1;
  return { dome, mat };
}

/** Forests and rocks as instanced meshes; their trunks and rocks are solid. */
export function scenery(m: OpsMap, phone: boolean, grid: SolidGrid) {
  const group = new THREE.Group(), H = m.heights, mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.3, 3.2, 6).translate(0, 1.6, 0), new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }), m.trees.length);
  const crown = [new THREE.ConeGeometry(1.9, 3.6, 7).translate(0, 3.6, 0), new THREE.ConeGeometry(1.45, 3, 7).translate(0, 5.2, 0), new THREE.ConeGeometry(0.95, 2.2, 7).translate(0, 6.6, 0)];
  const leaves = new THREE.InstancedMesh(mergeAll(crown), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), m.trees.length);
  m.trees.forEach(([x, z, k], i) => {
    const y = groundAt(H, x, z) - 0.15;
    q.setFromAxisAngle(UP, (x * 13.7 + z) % 6.28);
    mat4.compose(p.set(x, y, z), q, s.set(k, k * (0.9 + ((x * 7) % 1 + 1) % 1 * 0.35), k));
    trunk.setMatrixAt(i, mat4); leaves.setMatrixAt(i, mat4);
    leaves.setColorAt(i, c.setRGB(0.16 + ((z * 3) % 1 + 1) % 1 * 0.08, 0.3 + ((x * 5) % 1 + 1) % 1 * 0.12, 0.13, THREE.SRGBColorSpace));
    grid.add(new THREE.Box3(new THREE.Vector3(x - 0.3, y, z - 0.3), new THREE.Vector3(x + 0.3, y + 3.2 * k, z + 0.3)));
  });
  const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), m.rocks.length);
  m.rocks.forEach(([x, z, k], i) => {
    const y = groundAt(H, x, z);
    q.setFromEuler(new THREE.Euler(k, x, z));
    mat4.compose(p.set(x, y + k * 0.25, z), q, s.set(k * 1.2, k * 0.7, k));
    rock.setMatrixAt(i, mat4);
    rock.setColorAt(i, c.setRGB(0.42 + (k % 0.2), 0.41 + (k % 0.2), 0.39 + (k % 0.2), THREE.SRGBColorSpace));
    grid.add(new THREE.Box3(new THREE.Vector3(x - k * 0.9, y - 1, z - k * 0.75), new THREE.Vector3(x + k * 0.9, y + k * 0.85, z + k * 0.75)));
  });
  for (const im of [trunk, leaves, rock]) { im.castShadow = !phone; im.receiveShadow = !phone; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; group.add(im); }
  return group;
}
const UP = new THREE.Vector3(0, 1, 0);
function mergeAll(geos: THREE.BufferGeometry[]) {
  // Cones share attributes, so their buffers can simply be joined (no helper import for three cones).
  const parts = geos.map((g) => g.toNonIndexed());
  const n = parts.reduce((k, g) => k + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array as Float32Array, o * 3); nor.set(g.attributes.normal.array as Float32Array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/** Every place's buildings, merged by material; returns the flags (they change colour when taken). */
export function outposts(w: World, m: OpsMap, grid: SolidGrid) {
  const mats = {
    wall: surface('concrete', { color: 0xc9bfa9, rough: 0.9 }),
    roof: surface('panels', { color: 0x6b5a48, metal: 0.4, rough: 0.8 }),
    sandbag: surface('stone', { color: 0xb59f74, rough: 1, bump: 1.6 }),
    tower: new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.95 }),
    deck: new THREE.MeshStandardMaterial({ color: 0x7a5b3c, roughness: 0.95 }),
  };
  const boxesOf = new Map<string, { at: [number, number, number]; size: [number, number, number] }[]>();
  const containers: [Block, number][] = [];
  const tents: Block[] = [];
  for (const p of m.places) for (const b of p.blocks) {
    if (b.kind === 'tent') { tents.push(b); continue; }
    if (b.kind === 'container') { containers.push([b, (Math.round(b.x * 7 + b.z) % 3 + 3) % 3]); continue; }
    const list = boxesOf.get(b.kind) ?? [];
    list.push({ at: [b.x, b.y + b.h / 2, b.z], size: [b.w, b.h, b.d] });
    boxesOf.set(b.kind, list);
  }
  const before = w.solids.length;
  for (const [kind, list] of boxesOf) w.boxes(list, mats[kind as keyof typeof mats], true, w.scene, { tile: kind === 'sandbag' ? 1.5 : 3, round: kind === 'sandbag' ? 0.3 : 0.04 });
  const tint = [0x9a3b2a, 0x2f5f8a, 0x4b6b3a].map((color) => surface('panels', { color, metal: 0.55, rough: 0.6 }));
  for (let k = 0; k < 3; k++) w.boxes(containers.filter(([, i]) => i === k).map(([b]) => ({ at: [b.x, b.y + b.h / 2, b.z] as [number, number, number], size: [b.w, b.h, b.d] as [number, number, number] })), tint[k], true, w.scene, { tile: 3 });
  // Tents: canvas ridges (a triangle drawn, a box to bump into).
  if (tents.length) {
    const geos = tents.map((b) => {
      const sh = new THREE.Shape();
      sh.moveTo(-b.w / 2, 0); sh.lineTo(b.w / 2, 0); sh.lineTo(0, b.h); sh.closePath();
      return new THREE.ExtrudeGeometry(sh, { depth: b.d, bevelEnabled: false }).translate(b.x, b.y, b.z - b.d / 2);
    });
    const tent = new THREE.Mesh(mergeAll(geos), new THREE.MeshStandardMaterial({ color: 0x5f6b3d, roughness: 1, side: THREE.DoubleSide }));
    tent.castShadow = tent.receiveShadow = !w.phone;
    w.scene.add(tent);
    for (const b of tents) w.solids.push(new THREE.Box3(new THREE.Vector3(b.x - b.w / 3, b.y, b.z - b.d / 2), new THREE.Vector3(b.x + b.w / 3, b.y + b.h * 0.8, b.z + b.d / 2)));
  }
  for (const b of w.solids.slice(before)) grid.add(b);

  // A flag on a pole at each outpost (red until taken), a pad with an H at each landing zone.
  const flags = new Map<number, THREE.MeshStandardMaterial>();
  const pole = new THREE.CylinderGeometry(0.06, 0.06, 7), cloth = new THREE.PlaneGeometry(1.8, 1.1);
  for (const p of m.places) {
    if (p.kind === 'lz') { w.scene.add(pad(p.x, p.y, p.z)); continue; }
    const fx = p.x + p.r * 0.3, fz = p.z - p.r * 0.3;
    const pm = new THREE.Mesh(pole, mats.tower); pm.position.set(fx, p.y + 3.5, fz); w.scene.add(pm);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x220000 });
    const f = new THREE.Mesh(cloth, mat); f.position.set(fx + 0.9, p.y + 6.4, fz); w.scene.add(f);
    flags.set(p.id, mat);
  }
  return flags;
}

let padTex: THREE.CanvasTexture | null = null;
function pad(x: number, y: number, z: number) {
  if (!padTex) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(40,40,40,0.9)'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#facc15'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 108, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f4f4f5'; g.font = '900 150px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 128, 136);
    padTex = new THREE.CanvasTexture(c); padTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.CircleGeometry(6, 40), new THREE.MeshStandardMaterial({ map: padTex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.04, z); m.receiveShadow = true;
  return m;
}

/** A supply crate whose lid swings open. */
export class CrateMesh {
  group = new THREE.Group();
  lid: THREE.Mesh;
  glow: THREE.Sprite;
  open = 0;
  static base = new RoundedBoxGeometry(1.3, 0.7, 0.85, 2, 0.06);
  static top = new RoundedBoxGeometry(1.34, 0.16, 0.89, 2, 0.05).translate(0, 0.08, 0.445);
  static mat: THREE.Material | null = null;
  constructor(x: number, y: number, z: number, turn: number) {
    CrateMesh.mat ??= surface('panels', { color: 0x5e6b3a, metal: 0.3, rough: 0.7 });
    const b = new THREE.Mesh(CrateMesh.base, CrateMesh.mat); b.position.y = 0.35; b.castShadow = b.receiveShadow = true;
    this.lid = new THREE.Mesh(CrateMesh.top, CrateMesh.mat); this.lid.position.set(0, 0.7, -0.445); this.lid.castShadow = true;
    this.glow = glowSprite(0xfef3c7, 1.6); this.glow.position.y = 1.1;
    this.group.add(b, this.lid, this.glow);
    this.group.position.set(x, y, z); this.group.rotation.y = turn;
  }
  update(dt: number) { if (this.open > 0 && this.open < 1) { this.open = Math.min(1, this.open + dt * 3); this.lid.rotation.x = -1.9 * (1 - Math.pow(1 - this.open, 3)); } }
}

/** Shared "?" and "!" pictures over soldiers (searching, then they've seen you). */
const marks = new Map<string, THREE.CanvasTexture>();
export function markSprite(kind: '?' | '!') {
  let tex = marks.get(kind);
  if (!tex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.font = '900 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(kind, 32, 34);
    g.fillStyle = kind === '!' ? '#ef4444' : '#facc15'; g.fillText(kind, 32, 34);
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; marks.set(kind, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.7, 0.7, 1); s.renderOrder = 9;
  return s;
}

const LOOK: Record<FoeKind, { shirt: number; legs: number; hat: 'helmet' | 'beret' | 'hood' }> = {
  rifleman: { shirt: 0x5c6142, legs: 0x3b3a2c, hat: 'helmet' },
  heavy: { shirt: 0x3f3f46, legs: 0x27272a, hat: 'helmet' },
  marksman: { shirt: 0x8a7b58, legs: 0x5c5240, hat: 'hood' },
  commander: { shirt: 0x7c2d12, legs: 0x292524, hat: 'beret' },
};
const SKINS = [0xf1c27d, 0xc68642, 0x8d5524, 0xe0ac69, 0xffdbac];
const gunGeo = new THREE.BoxGeometry(0.12, 0.17, 0.95), gunMat = new THREE.MeshStandardMaterial({ color: 0x1c1f22, metalness: 0.7, roughness: 0.4 });
/** A gun held at the shoulder, for the player and the soldiers. */
export function heldGun(color = 0x1c1f22) {
  const g = new THREE.Mesh(gunGeo, color === 0x1c1f22 ? gunMat : new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 }));
  g.position.set(0.3, 1.5, 0.5); g.castShadow = true;
  return g;
}
/** Arms up holding the gun (after Avatar.update swung them). */
export function aimPose(av: Avatar, raise = 1) {
  av.limbs[0].rotation.set(-1.5 * raise, 0, -0.25 * raise);
  av.limbs[1].rotation.set(-1.35 * raise, 0, 0.45 * raise);
}

/** An enemy soldier: a blocky figure in its kind's colours with a helmet, beret or hood and a gun. */
export function soldier(kind: FoeKind, n: number) {
  const look = LOOK[kind], av = new Avatar(look.shirt, { skin: SKINS[n % SKINS.length], legs: look.legs, face: false });
  const g = av.group;
  g.rotation.order = 'YXZ'; // falls backward from where it faces
  if (look.hat === 'helmet') { const h = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: kind === 'heavy' ? 0x27272a : 0x4d5233, roughness: 0.7 })); h.position.y = 2.2; h.castShadow = true; g.add(h); }
  if (look.hat === 'beret') { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.3, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.8 })); h.position.set(0.05, 2.3, 0); h.rotation.z = 0.2; g.add(h); }
  if (look.hat === 'hood') { const h = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.45, 0.62), new THREE.MeshStandardMaterial({ color: 0x6b5d3f, roughness: 1 })); h.position.y = 2.12; g.add(h); }
  // A dark visor where a face would be, and a vest.
  const visor = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.18), new THREE.MeshBasicMaterial({ color: 0x0f0f10 })); visor.position.set(0, 2.02, 0.28); g.add(visor);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.6, 0.52), new THREE.MeshStandardMaterial({ color: kind === 'heavy' ? 0x18181b : 0x3f4430, roughness: 0.9 })); vest.position.y = 1.32; vest.castShadow = true; g.add(vest);
  g.add(heldGun(kind === 'commander' ? 0x3f2a1d : 0x1c1f22));
  if (kind === 'heavy') g.scale.setScalar(1.12);
  return av;
}

/** The helicopter: a fuselage, glass, tail boom and fin, skids, and spinning rotors. */
export class Heli {
  group = new THREE.Group();
  private rotor = new THREE.Group();
  private tail = new THREE.Group();
  constructor() {
    const olive = surface('panels', { color: 0x4b5638, metal: 0.45, rough: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: 0x1f2124, metalness: 0.6, roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.08, envMapIntensity: 1.6 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], parent: THREE.Object3D = this.group) => { const m = new THREE.Mesh(geo, mat); m.position.set(...at); m.castShadow = true; parent.add(m); return m; };
    add(new RoundedBoxGeometry(2.5, 2.3, 5.6, 3, 0.7), olive, [0, 1.9, 0]);
    const nose = add(new THREE.SphereGeometry(1.25, 18, 12), glass, [0, 2.1, 2.55]); nose.scale.set(0.95, 0.85, 0.9);
    add(new THREE.BoxGeometry(0.55, 0.6, 6.4), olive, [0, 2.4, -5.6]);
    add(new THREE.BoxGeometry(0.15, 1.8, 1.2), olive, [0, 3.2, -8.6]);
    add(new THREE.BoxGeometry(2.2, 0.12, 0.7), olive, [0, 2.5, -7.6]);
    for (const x of [-1.2, 1.2]) { add(new THREE.BoxGeometry(0.12, 0.12, 4.6), dark, [x, 0.15, 0.3]); for (const z of [-1, 1.4]) add(new THREE.BoxGeometry(0.1, 0.75, 0.1), dark, [x, 0.5, z]); }
    // The open side doors (dark) and the engine housing.
    for (const x of [-1.26, 1.26]) add(new THREE.BoxGeometry(0.02, 1.3, 1.9), dark, [x, 1.9, 0.2]);
    add(new RoundedBoxGeometry(1.6, 0.7, 2.6, 2, 0.25), olive, [0, 3.3, -0.4]);
    this.rotor.position.set(0, 3.8, -0.2); this.group.add(this.rotor);
    for (let i = 0; i < 4; i++) { const b = add(new THREE.BoxGeometry(0.34, 0.05, 7.4).translate(0, 0, 3.7), dark, [0, 0, 0], this.rotor); b.rotation.y = (i * Math.PI) / 2; }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(7.4, 40), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; this.rotor.add(disc);
    this.tail.position.set(0.18, 3.3, -8.7); this.group.add(this.tail);
    for (let i = 0; i < 2; i++) { const b = add(new THREE.BoxGeometry(0.04, 1.7, 0.2), dark, [0, 0, 0], this.tail); b.rotation.x = (i * Math.PI) / 2; }
  }
  update(dt: number, spin = 1) { this.rotor.rotation.y += dt * 26 * spin; this.tail.rotation.x += dt * 40 * spin; }
}

/** The island as a picture (the map and the minimap): sea, beaches, grass, rock, shaded hills and
 *  each place's buildings. `px` is its size. */
export function islandImage(m: OpsMap, px = 320) {
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d')!, img = g.createImageData(px, px), k = OPS_SIZE / px;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const wx = x * k - OPS_SIZE / 2, wz = y * k - OPS_SIZE / 2, h = groundAt(m.heights, wx, wz);
    const shade = Math.max(0.55, Math.min(1.3, 1 + (groundAt(m.heights, wx - 2, wz - 2) - h) * 0.12));
    const rgb: RGB = h < -0.3 ? mixRGB([0.16, 0.42, 0.55], [0.07, 0.2, 0.32], Math.min(1, -h / 7)) : groundColour(h, 0, wobble(wx, wz), 0);
    const o = (y * px + x) * 4;
    img.data[o] = Math.min(255, rgb[0] * 255 * (h < -0.3 ? 1 : shade)); img.data[o + 1] = Math.min(255, rgb[1] * 255 * (h < -0.3 ? 1 : shade)); img.data[o + 2] = Math.min(255, rgb[2] * 255 * (h < -0.3 ? 1 : shade)); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(30,30,30,0.75)';
  for (const p of m.places) for (const b of p.blocks) if (b.kind !== 'deck') g.fillRect((b.x - b.w / 2 + OPS_SIZE / 2) / k, (b.z - b.d / 2 + OPS_SIZE / 2) / k, Math.max(1, b.w / k), Math.max(1, b.d / k));
  return c;
}
