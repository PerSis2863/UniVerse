import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundAt, type Block, type ContainerKind, type OpsMap } from '@/lib/play/ops';
import { RoundedBoxGeometry, THREE, worldUv } from '../world/core';
import { surface } from '../world/textures';
import type { SolidGrid } from './grid';
import type { OpsRenderer } from './render';

// What stands on the island (the owner: "electrical towers, ruined concrete buildings, sandbag
// bunkers, watchtowers, and smoking vehicle wrecks… loot containers… buy stations"): every place's
// blocks merged into one mesh per material (concrete, ruins, wood, sheet metal, sandbags as rows of
// bags, shipping containers in four colours, domes, fuel tanks, cranes, chain-link fences, glass,
// earth-covered roofs), lamp posts that light at night, flags, landing pads, the SAM launchers,
// power pylons with sagging wires, burnt-out wrecks (they smoke), the buy kiosks, and the loot
// containers with lids and doors that open.

type BoxSpec = { at: [number, number, number]; size: [number, number, number] };
function merged(list: BoxSpec[], tile: number, round = 0): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const geos = list.map(({ at, size }) => {
    const r = Math.min(round, Math.min(...size) / 2 - 0.01);
    const g = (r > 0.01 ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, r) : new THREE.BoxGeometry(...size)).translate(...at);
    return tile ? worldUv(g, tile) : g;
  });
  const out = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return out;
}
/** Sandbags: three staggered rows of soft bags along the block. */
function bagRows(b: Block): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [], along = b.w >= b.d, len = along ? b.w : b.d, rows = Math.max(2, Math.round(b.h / 0.33));
  for (let row = 0; row < rows; row++) {
    const n = Math.max(1, Math.round(len / 0.62)), off = row % 2 ? 0.31 : 0, bagLen = len / n;
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + bagLen * (i + 0.5) + off;
      if (Math.abs(t) > len / 2 - 0.15) continue;
      const g = new RoundedBoxGeometry(along ? bagLen * 0.96 : Math.min(b.d, 0.7), 0.33, along ? Math.min(b.d, 0.7) : bagLen * 0.96, 1, 0.13);
      g.translate(along ? b.x + t : b.x, b.y + 0.165 + row * 0.31, along ? b.z : b.z + t);
      out.push(worldUv(g, 0.9));
    }
  }
  return out;
}

let chain: THREE.CanvasTexture | null = null;
function chainLink() {
  if (chain) return chain;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(170,175,180,0.95)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.moveTo(32, -32); g.lineTo(96, 32); g.stroke();
  chain = new THREE.CanvasTexture(c); chain.wrapS = chain.wrapT = THREE.RepeatWrapping;
  return chain;
}

const SURFACE_OF: Partial<Record<Block['kind'], string>> = { wood: 'wood', deck: 'wood', tower: 'wood', metal: 'metal', container: 'metal', roof: 'metal', crane: 'metal', tank: 'metal', earth: 'grass', sandbag: 'sand' };

export interface Lamp { x: number; y: number; z: number }
export interface Smoke { x: number; y: number; z: number; big: boolean }

export function buildPlaces(r: OpsRenderer, m: OpsMap, grid: SolidGrid) {
  const group = new THREE.Group();
  const mats: Record<string, THREE.Material> = {
    concrete: surface('concrete', { color: 0xb3ab9c, rough: 0.92 }),
    ruin: surface('concrete', { color: 0x8a8174, rough: 1, bump: 2 }),
    wood: surface('wood', { color: 0xd9cbb5, rough: 0.9 }),
    roof: surface('corrugated', { color: 0x8f8476, metal: 0.55, rough: 0.6 }),
    metal0: surface('corrugated', { color: 0x9aa0a6, metal: 0.6, rough: 0.5 }),
    metal1: surface('corrugated', { color: 0x6f7a5e, metal: 0.5, rough: 0.55 }),
    metal2: surface('corrugated', { color: 0x7a6a52, metal: 0.5, rough: 0.6 }),
    metal3: surface('corrugated', { color: 0x2a2724, metal: 0.4, rough: 0.9 }),
    sandbag: surface('fabric', { color: 0xc9b48c, rough: 1, bump: 1.4 }),
    container0: surface('corrugated', { color: 0x9b3a26, metal: 0.55, rough: 0.55 }),
    container1: surface('corrugated', { color: 0x2c5b8c, metal: 0.55, rough: 0.55 }),
    container2: surface('corrugated', { color: 0x4f6b38, metal: 0.55, rough: 0.55 }),
    container3: surface('corrugated', { color: 0xb88a32, metal: 0.55, rough: 0.55 }),
    tower: surface('wood', { color: 0x8a6e52, rough: 0.95 }),
    deck: surface('wood', { color: 0xa88e70, rough: 0.9 }),
    crane: surface('panels', { color: 0xd8a422, metal: 0.6, rough: 0.5 }),
    wall: surface('concrete', { color: 0xc2bba9, rough: 0.9 }),
    earth: surface('mud', { color: 0x9a9a78, rough: 1 }),
    rock: surface('rock', { color: 0xffffff, rough: 0.95 }),
    tank: surface('panels', { color: 0xd8d8d2, metal: 0.7, rough: 0.35 }),
    dome: surface('panels', { color: 0xf1f1ec, metal: 0.2, rough: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8fb4c4, metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.35 }),
    fence: new THREE.MeshStandardMaterial({ map: chainLink(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 }),
    tent: new THREE.MeshStandardMaterial({ color: 0x5a6638, roughness: 1, side: THREE.DoubleSide }),
  };
  const buckets = new Map<string, BoxSpec[]>(), bags: THREE.BufferGeometry[] = [], domes: THREE.BufferGeometry[] = [], tanks: THREE.BufferGeometry[] = [], fences: THREE.BufferGeometry[] = [], posts: BoxSpec[] = [];
  const lamps: Lamp[] = [], smokes: Smoke[] = [];
  const put = (key: string, b: Block) => { const list = buckets.get(key) ?? []; list.push({ at: [b.x, b.y + b.h / 2, b.z], size: [b.w, b.h, b.d] }); buckets.set(key, list); };
  for (const p of m.places) for (const b of p.blocks) {
    // Everything is solid (tents a little smaller than drawn, domes as their box).
    grid.add(new THREE.Box3(new THREE.Vector3(b.x - b.w / 2, b.y, b.z - b.d / 2), new THREE.Vector3(b.x + b.w / 2, b.y + b.h, b.z + b.d / 2)), SURFACE_OF[b.kind]);
    switch (b.kind) {
      case 'sandbag': bags.push(...bagRows(b)); break;
      case 'dome': domes.push(new THREE.SphereGeometry(b.w / 2, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.62).translate(b.x, b.y + b.h * 0.25, b.z)); break;
      case 'tank': tanks.push(new THREE.CylinderGeometry(b.w / 2, b.w / 2, b.h, 20).translate(b.x, b.y + b.h / 2, b.z)); break;
      case 'fence': {
        const along = b.w >= b.d, len = along ? b.w : b.d, g = new THREE.PlaneGeometry(len, b.h);
        const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.6, uv.getY(i) * b.h / 0.6);
        if (!along) g.rotateY(Math.PI / 2);
        fences.push(g.translate(b.x, b.y + b.h / 2, b.z));
        for (let t = -len / 2; t <= len / 2 + 0.01; t += 3) posts.push({ at: [along ? b.x + t : b.x, b.y + b.h / 2, along ? b.z : b.z + t], size: [0.08, b.h + 0.1, 0.08] });
        break;
      }
      case 'metal': put(`metal${b.color ?? 0}`, b); if (b.color === 3) smokes.push({ x: b.x, y: b.y + b.h, z: b.z, big: false }); break;
      case 'container': put(`container${b.color ?? 0}`, b); break;
      default: put(b.kind, b);
    }
  }
  for (const [key, list] of buckets) {
    const geo = merged(list, key.startsWith('container') ? 2.6 : key === 'sandbag' ? 1 : 3, key === 'earth' ? 0.8 : key === 'concrete' || key === 'ruin' ? 0.03 : 0);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mats[key] ?? mats.concrete);
    mesh.castShadow = mesh.receiveShadow = !r.phone;
    group.add(mesh);
  }
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    if (!geos.length) return;
    const g = mergeGeometries(geos); geos.forEach((x) => x.dispose());
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = shadow && !r.phone; mesh.receiveShadow = !r.phone; group.add(mesh);
  };
  add(bags, mats.sandbag); add(domes, mats.dome); add(tanks, mats.tank); add(fences, mats.fence, false);
  const postGeo = merged(posts, 0); if (postGeo) group.add(new THREE.Mesh(postGeo, mats.metal0));

  // Lamp posts round the big places (their bulbs glow at night; the nearest few cast real light).
  const bulbs: THREE.BufferGeometry[] = [], poles: THREE.BufferGeometry[] = [];
  for (const p of m.places.filter((x) => !['ruin', 'wreck', 'lz'].includes(x.kind))) {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.6, x = p.x + Math.cos(a) * (p.r - 4), z = p.z + Math.sin(a) * (p.r - 4), y = groundAt(m.heights, x, z);
      poles.push(new THREE.CylinderGeometry(0.07, 0.1, 6, 6).translate(x, y + 3, z), new THREE.BoxGeometry(1.2, 0.08, 0.08).translate(x + 0.55, y + 6, z));
      bulbs.push(new THREE.BoxGeometry(0.5, 0.12, 0.3).translate(x + 1.05, y + 5.92, z));
      lamps.push({ x: x + 1.05, y: y + 5.8, z });
    }
  }
  add(poles, mats.metal3);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0 });
  add(bulbs, bulbMat, false);

  // Flags at the places soldiers hold (red until taken), landing pads, SAM launchers.
  const flags = new Map<number, THREE.MeshStandardMaterial>();
  const cloth = new THREE.PlaneGeometry(1.9, 1.15), pole = new THREE.CylinderGeometry(0.05, 0.05, 8);
  for (const p of m.places) {
    if (p.kind === 'lz') { group.add(pad(p.x, groundAt(m.heights, p.x, p.z), p.z)); continue; }
    if (['ruin', 'wreck'].includes(p.kind)) continue;
    const fx = p.x + 4, fz = p.z - 4, fy = groundAt(m.heights, fx, fz);
    const pm = new THREE.Mesh(pole, mats.metal0); pm.position.set(fx, fy + 4, fz); group.add(pm);
    const fm = new THREE.MeshStandardMaterial({ color: 0x9f1d1d, roughness: 0.9, side: THREE.DoubleSide });
    const f = new THREE.Mesh(cloth, fm); f.position.set(fx + 0.95, fy + 7.3, fz); group.add(f);
    flags.set(p.id, fm);
    if (p.kind === 'sam') {
      const tubes: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) tubes.push(new THREE.CylinderGeometry(0.32, 0.32, 5, 12).rotateX(Math.PI / 2 - 0.6).translate(p.x - 0.8 + (i % 2) * 1.6, p.y + 3.6 + Math.floor(i / 2) * 0.75, p.z));
      add(tubes, mats.metal1);
    }
  }

  // Power pylons: one lattice tower shape, instanced, and wires that sag between them.
  if (m.pylons.length) {
    const im = new THREE.InstancedMesh(pylon(), mats.metal0, m.pylons.length), mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    m.pylons.forEach((py, i) => { q.setFromAxisAngle(up, -py.turn); im.setMatrixAt(i, mat4.compose(new THREE.Vector3(py.x, py.y, py.z), q, new THREE.Vector3(1, 1, 1))); grid.add(new THREE.Box3(new THREE.Vector3(py.x - 3, py.y, py.z - 3), new THREE.Vector3(py.x + 3, py.y + 8, py.z + 3))); });
    im.castShadow = !r.phone; group.add(im);
    const pts: number[] = [];
    for (let i = 0; i < m.pylons.length - 1; i++) {
      const a = m.pylons[i], b = m.pylons[i + 1];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 90) continue;
      for (const off of [-5.5, 0, 5.5]) {
        const ax = a.x + Math.sin(a.turn) * off, az = a.z - Math.cos(a.turn) * off, bx = b.x + Math.sin(b.turn) * off, bz = b.z - Math.cos(b.turn) * off;
        for (let k = 0; k < 12; k++) {
          const t0 = k / 12, t1 = (k + 1) / 12, sag = (t: number) => -4 * t * (1 - t) * 2.2;
          pts.push(ax + (bx - ax) * t0, a.y + 24 + (b.y - a.y) * t0 + sag(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, a.y + 24 + (b.y - a.y) * t1 + sag(t1), az + (bz - az) * t1);
        }
      }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
  }
  // Wrecks by the roads: burnt car bodies (they smoke).
  const wr = (k: number) => (Math.sin(k * 91.7 + m.seed) + 1) / 2, wrecks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const rd = m.roads[Math.floor(wr(i) * m.roads.length)], pt = rd.pts[Math.floor(wr(i + 9) * rd.pts.length)];
    const x = pt[0] + 5, z = pt[1] + 2, y = groundAt(m.heights, x, z), turn = wr(i + 3) * 6.28;
    const car: THREE.BufferGeometry[] = [new RoundedBoxGeometry(4.4, 0.9, 1.9, 2, 0.25).translate(0, 0.75, 0), new RoundedBoxGeometry(2.3, 0.75, 1.75, 2, 0.25).translate(-0.2, 1.5, 0)];
    for (const [wx, wz] of [[1.4, 0.9], [-1.4, 0.9], [1.4, -0.9]]) car.push(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12).rotateX(Math.PI / 2).translate(wx, 0.38, wz));
    const cg = mergeGeometries(car.map((g) => g.toNonIndexed())).rotateY(turn).translate(x, y, z);
    car.forEach((g) => g.dispose());
    wrecks.push(cg);
    grid.add(new THREE.Box3(new THREE.Vector3(x - 2, y, z - 2), new THREE.Vector3(x + 2, y + 1.8, z + 2)));
    smokes.push({ x, y: y + 1.6, z, big: i % 3 === 0 });
  }
  add(wrecks, mats.metal3);
  for (const b of group.children) r.prep(b);
  return { group, flags, lamps, smokes, bulbMat };
}

/** A lattice pylon: four tapered legs, braces, and the cross-arms for three wires. */
function pylon() {
  const parts: THREE.BufferGeometry[] = [], H = 26;
  const beam = (a: THREE.Vector3, b: THREE.Vector3, t = 0.14) => {
    const len = a.distanceTo(b), g = new THREE.BoxGeometry(t, len, t), mid = a.clone().add(b).multiplyScalar(0.5);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))).translate(mid.x, mid.y, mid.z);
    parts.push(g.toNonIndexed());
  };
  const w = (y: number) => 3 - (y / H) * 2.3;
  const corners = (y: number) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => new THREE.Vector3(sx * w(y), y, sz * w(y)));
  for (let k = 0; k < 4; k++) beam(corners(0)[k], corners(H)[k], 0.22);
  for (let y = 4; y < H; y += 4.4) { const a = corners(y), b = corners(y + 4.4); for (let k = 0; k < 4; k++) { beam(a[k], a[(k + 1) % 4], 0.1); beam(a[k], b[(k + 1) % 4], 0.08); } }
  beam(new THREE.Vector3(0, H - 2, -6), new THREE.Vector3(0, H - 2, 6), 0.3);
  beam(new THREE.Vector3(0, H + 1, -3), new THREE.Vector3(0, H + 1, 3), 0.25);
  return mergeGeometries(parts);
}

let padTex: THREE.CanvasTexture | null = null;
function pad(x: number, y: number, z: number) {
  if (!padTex) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(48,48,46,0.95)'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e8e4d8'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 108, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e8e4d8'; g.font = '900 140px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 128, 136);
    padTex = new THREE.CanvasTexture(c); padTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshStandardMaterial({ map: padTex, transparent: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.05, z); m.receiveShadow = true;
  return m;
}

/** A loot container: its body, a lid or doors that swing open, and a faint glow until searched. */
export class ContainerMesh {
  group = new THREE.Group();
  private lid: THREE.Object3D | null = null;
  private swing: 'lid' | 'door' | 'drawer' = 'lid';
  private open = 0;
  opened = false;
  constructor(kind: ContainerKind, x: number, y: number, z: number, turn: number) {
    const g = this.group, add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], parent: THREE.Object3D = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(...at); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const olive = surface('panels', { color: 0x56603a, metal: 0.4, rough: 0.7 }), steel = surface('panels', { color: 0x3b3e42, metal: 0.8, rough: 0.35 }), white = surface('panels', { color: 0xe6e6e0, metal: 0.2, rough: 0.5 });
    if (kind === 'weapons' || kind === 'supply') {
      const big = kind === 'supply' ? 1.3 : 1;
      add(new RoundedBoxGeometry(1.5 * big, 0.6 * big, 0.6 * big, 2, 0.05), olive, [0, 0.3 * big, 0]);
      const pivot = new THREE.Group(); pivot.position.set(0, 0.6 * big, -0.3 * big); g.add(pivot);
      add(new RoundedBoxGeometry(1.54 * big, 0.12, 0.64 * big, 2, 0.04).translate(0, 0.06, 0.32 * big), olive, [0, 0, 0], pivot);
      this.lid = pivot;
      if (kind === 'supply') add(new THREE.BoxGeometry(0.3, 0.05, 0.62 * big), new THREE.MeshStandardMaterial({ color: 0xffd14a, emissive: 0x6b4a00 }), [0.5, 0.79, 0]);
    } else if (kind === 'medical') {
      add(new THREE.BoxGeometry(0.8, 1.1, 0.35), white, [0, 0.95, 0]);
      const cross = new THREE.MeshStandardMaterial({ color: 0xc81e1e });
      const pivot = new THREE.Group(); pivot.position.set(-0.4, 0.95, 0.18); g.add(pivot);
      add(new THREE.BoxGeometry(0.8, 1.1, 0.04).translate(0.4, 0, 0), white, [0, 0, 0], pivot);
      add(new THREE.BoxGeometry(0.3, 0.08, 0.01), cross, [0.4, 0, 0.025], pivot); add(new THREE.BoxGeometry(0.08, 0.3, 0.01), cross, [0.4, 0, 0.025], pivot);
      this.lid = pivot; this.swing = 'door';
    } else if (kind === 'register') {
      add(new THREE.BoxGeometry(1.4, 0.95, 0.6), surface('wood', { color: 0x9c8466 }), [0, 0.475, 0]);
      add(new THREE.BoxGeometry(0.42, 0.22, 0.38), steel, [0, 1.06, 0]);
      const drawer = new THREE.Group(); drawer.position.set(0, 0.98, 0.1); g.add(drawer);
      add(new THREE.BoxGeometry(0.4, 0.08, 0.32), steel, [0, 0, 0], drawer);
      this.lid = drawer; this.swing = 'drawer';
    } else if (kind === 'duffel') {
      add(new THREE.CapsuleGeometry(0.22, 0.6, 6, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f3426, roughness: 0.95 }), [0, 0.22, 0]);
    } else if (kind === 'safe') {
      add(new RoundedBoxGeometry(0.8, 0.9, 0.7, 2, 0.04), steel, [0, 0.45, 0]);
      const pivot = new THREE.Group(); pivot.position.set(-0.4, 0.45, 0.36); g.add(pivot);
      add(new THREE.BoxGeometry(0.8, 0.88, 0.06).translate(0.4, 0, 0), steel, [0, 0, 0], pivot);
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 1, roughness: 0.2 }), [0.55, 0.05, 0.05], pivot);
      this.lid = pivot; this.swing = 'door';
    }
    g.position.set(x, y, z); g.rotation.y = turn;
  }
  /** Opens it (the lid swings over half a second). */
  openUp() { this.opened = true; this.open = Math.max(this.open, 0.001); }
  update(dt: number) {
    if (!this.lid || this.open <= 0 || this.open >= 1) return;
    this.open = Math.min(1, this.open + dt * 2.2);
    const e = 1 - Math.pow(1 - this.open, 3);
    if (this.swing === 'drawer') this.lid.position.z = 0.1 + e * 0.28;
    else if (this.swing === 'door') this.lid.rotation.y = -e * 1.9;
    else this.lid.rotation.x = -e * 1.7;
  }
}

/** A buy station: a rugged kiosk with a lit screen. */
let kioskTex: THREE.CanvasTexture | null = null;
export function kiosk(x: number, y: number, z: number, turn: number) {
  if (!kioskTex) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 320;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 320); grad.addColorStop(0, '#0d2b1f'); grad.addColorStop(1, '#04120c'); g.fillStyle = grad; g.fillRect(0, 0, 256, 320);
    g.fillStyle = '#4ade80'; g.font = '800 34px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('BUY', 128, 70); g.fillText('STATION', 128, 112);
    g.font = '600 20px system-ui, sans-serif'; g.fillStyle = '#a7f3d0';
    ['UAV · AMMO', 'PLATES · REVIVE', 'MORTAR · EXFIL'].forEach((t, i) => g.fillText(t, 128, 170 + i * 36));
    g.strokeStyle = '#4ade80'; g.lineWidth = 4; g.strokeRect(10, 10, 236, 300);
    kioskTex = new THREE.CanvasTexture(c); kioskTex.colorSpace = THREE.SRGBColorSpace;
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.1, 2.1, 0.7, 2, 0.06), surface('panels', { color: 0x3c4232, metal: 0.6, rough: 0.5 }));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1), new THREE.MeshStandardMaterial({ map: kioskTex, emissive: 0xffffff, emissiveMap: kioskTex, emissiveIntensity: 1.2 }));
  screen.position.set(0, 1.35, 0.36); g.add(screen);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
  light.position.set(0, 2.18, 0); g.add(light);
  g.position.set(x, y, z); g.rotation.y = turn;
  return g;
}
