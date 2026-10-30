import { MAP_EDGE, groundAt, roadAt, type OpsMap } from '@/lib/play/ops';
import { THREE } from '../world/core';
import type { OpsRenderer } from './render';
import { U } from './terrain';
import type { SolidGrid } from './grid';
import { broadleaf, bush, farLeafy, farPine, foliageAtlas, grassClump, keepNormals, pine, rock } from './trees';
import { surfaceMaps } from '../world/textures';

// Trees, bushes and tall grass (the owner: "dense foliage (wind-swaying trees, bushes for stealth,
// tall grass)"). Each kind is one instanced mesh (shapes and the painted atlas in `trees.ts`), so
// 1,500 trees are two draws per tile. The wind bends crowns and grass tips in the vertex shader (stronger in rain).
// Grass is a field of clumps laid out round the player and re-laid as they move; it shrinks away
// with distance so it never pops. Trunks and rocks are solid; bushes aren't, but soldiers see you
// less inside one.

const WIND = (strength: number) => `
  vec4 windW = instanceMatrix * vec4(transformed, 1.0);
  float windK = max(0.0, position.y - ${strength.toFixed(2)}) * uWind;
  transformed.x += (sin(uTime * 1.6 + windW.x * 0.11 + windW.z * 0.07) * 0.6 + sin(uTime * 3.7 + windW.z * 0.31) * 0.18) * windK * 0.05;
  transformed.z += (cos(uTime * 1.3 + windW.z * 0.09) * 0.4) * windK * 0.04;`;

/** Instances split into square tiles (100–160 m), each its own mesh: the camera's view leaves out the tiles it
 *  can't see, far tiles swap to a few-triangle shape (or hide), and tiles past the fog are hidden. */
function tiled<T extends [number, number, number]>(list: T[], geo: THREE.BufferGeometry, mat: THREE.Material, place: (it: T, m: THREE.Matrix4, c: THREE.Color) => void, shadow: boolean, TILE: number) {
  const tiles = new Map<string, T[]>();
  for (const it of list) { const k = `${Math.floor(it[0] / TILE)},${Math.floor(it[1] / TILE)}`; const t = tiles.get(k); if (t) t.push(it); else tiles.set(k, [it]); }
  const out: THREE.InstancedMesh[] = [], m = new THREE.Matrix4(), c = new THREE.Color();
  for (const items of tiles.values()) {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { place(it, m, c); im.setMatrixAt(i, m); im.setColorAt(i, c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = shadow; im.receiveShadow = shadow;
    out.push(im);
  }
  return out;
}

export class Foliage {
  group = new THREE.Group();
  private tiles: { im: THREE.InstancedMesh; near: THREE.BufferGeometry; far: THREE.BufferGeometry | null }[] = [];
  /** Up to `lod` metres the full shape, then the far one, hidden past `hide` (by quality). */
  private lod: number;
  private hide: number;
  private grass: THREE.InstancedMesh;
  private grassAt = new THREE.Vector2(1e9, 1e9);
  private grassN: number;
  private bushes: [number, number, number][];
  constructor(private r: OpsRenderer, private m: OpsMap, grid: SolidGrid) {
    const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const leafMat = (key: string, base: number) => {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: foliageAtlas(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
      r.patch(mat, (sh) => { sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind; sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + WIND(base)); keepNormals(sh); }, key);
      return mat;
    };
    const pines = m.trees.filter((_, i) => i % 4 !== 0), leafy = m.trees.filter((_, i) => i % 4 === 0);
    const solidTrunk = (x: number, y: number, z: number, k: number) => grid.add(new THREE.Box3(new THREE.Vector3(x - 0.35, y, z - 0.35), new THREE.Vector3(x + 0.35, y + 4 * k, z + 0.35)), 'wood');
    this.lod = r.quality === 'high' ? 170 : r.quality === 'medium' ? 130 : 90;
    this.hide = r.quality === 'high' ? 420 : r.quality === 'medium' ? 340 : 260;
    // Bigger tiles on lower quality: fewer draws, a little less left out behind you.
    const T = r.quality === 'high' ? 100 : 160;
    const add = (list: THREE.InstancedMesh[], far: THREE.BufferGeometry | null) => { for (const im of list) this.tiles.push({ im, near: im.geometry, far }); };
    for (const [list, geo, far, key, base] of [[pines, pine(), farPine(), 'ops-pine', 2.6], [leafy, broadleaf(), farLeafy(), 'ops-leafy', 3]] as const) {
      add(tiled(list, geo, leafMat(key, base), ([x, z, k], mm, cc) => {
        const y = groundAt(m.heights, x, z) - 0.2;
        q.setFromAxisAngle(up, (x * 1.37 + z) % 6.28);
        mm.compose(p.set(x, y, z), q, s.set(k, k * (0.85 + (Math.abs(x * 7.1) % 1) * 0.35), k));
        cc.setRGB(0.85 + (Math.abs(z * 3.3) % 1) * 0.3, 0.9 + (Math.abs(x * 2.7) % 1) * 0.2, 0.85, THREE.SRGBColorSpace);
        solidTrunk(x, y, z, k);
      }, !r.phone, T), far);
    }
    this.bushes = m.bushes;
    add(tiled(m.bushes, bush(), leafMat('ops-bush', 0.2), ([x, z, k], mm, cc) => {
      q.setFromAxisAngle(up, x + z);
      mm.compose(p.set(x, groundAt(m.heights, x, z) - 0.15, z), q, s.set(k * 1.2, k, k * 1.2));
      cc.setRGB(0.8 + (Math.abs(x) % 1) * 0.4, 0.9 + (Math.abs(z) % 1) * 0.2, 0.8, THREE.SRGBColorSpace);
    }, !r.phone, T), null);
    // Rocks: lumpy boulders in stone with moss on top, solid (they turn only round the upright, so
    // the moss stays on top).
    const stone = surfaceMaps('stone');
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stone.map, normalMap: stone.normal, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.95 });
    add(tiled(m.rocks, rock(2), rockMat, ([x, z, k], mm, cc) => {
      const y = groundAt(m.heights, x, z);
      q.setFromEuler(new THREE.Euler((k % 0.3) - 0.15, x, (z % 0.3) - 0.15));
      mm.compose(p.set(x, y + k * 0.2, z), q, s.set(k * 1.3, k * 0.75, k));
      cc.setRGB(0.75 + (k % 0.3), 0.73 + (k % 0.3), 0.7 + (k % 0.3), THREE.SRGBColorSpace);
      grid.add(new THREE.Box3(new THREE.Vector3(x - k, y - 1, z - k * 0.8), new THREE.Vector3(x + k, y + k * 0.9, z + k * 0.8)), 'concrete');
    }, !r.phone, T), rock(1));
    for (const t of this.tiles) this.group.add(t.im);
    void c; void mat4;

    // Grass round the player; shrinks to nothing between 30 and 46 m from the camera.
    this.grassN = r.phone ? 2200 : r.quality === 'high' ? 9000 : 5000;
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    r.patch(gm, (sh) => {
      sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind;
      sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 gw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float gd = distance(gw.xz, cameraPosition.xz);
        transformed *= 1.0 - smoothstep(30.0, 46.0, gd);
        float gk = position.y * uWind;
        transformed.x += sin(uTime * 2.2 + gw.x * 0.35 + gw.z * 0.2) * gk * 0.16;
        transformed.z += cos(uTime * 1.9 + gw.z * 0.3) * gk * 0.1;`);
      keepNormals(sh);
    }, 'ops-grass');
    this.grass = new THREE.InstancedMesh(grassClump(), gm, this.grassN);
    this.grass.frustumCulled = false; this.grass.receiveShadow = !r.phone;
    this.group.add(this.grass);
  }

  /** Tiles past the fog are hidden; the grass is re-laid when the player has moved 8 m. */
  update(at: THREE.Vector3, eye: THREE.Vector3 = at) {
    for (const t of this.tiles) {
      const bs = t.im.boundingSphere; if (!bs) continue;
      const d = bs.center.distanceTo(eye) - bs.radius, near = d < this.lod;
      t.im.visible = d < this.hide && (near || !!t.far);
      if (t.far) t.im.geometry = near ? t.near : t.far;
    }
    if (Math.hypot(at.x - this.grassAt.x, at.z - this.grassAt.y) < 8) return;
    this.grassAt.set(at.x, at.z);
    const m = this.m, mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    // A fixed world grid of 1.1 m cells with a hashed jitter, so the same spot always has the same clump.
    const step = 1.1, R = 46, cx = Math.round(at.x / step), cz = Math.round(at.z / step), span = Math.ceil(R / step);
    let n = 0;
    for (let ring = 0; ring <= span && n < this.grassN; ring++) for (let dx = -ring; dx <= ring && n < this.grassN; dx++) for (let dz = -ring; dz <= ring && n < this.grassN; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
      const gx = cx + dx, gz = cz + dz, h1 = Math.sin(gx * 127.1 + gz * 311.7) * 43758.5453, h2 = Math.sin(gx * 269.5 + gz * 183.3) * 43758.5453;
      const jx = h1 - Math.floor(h1), jz = h2 - Math.floor(h2);
      if (jx < 0.25) continue; // gaps between clumps
      const x = gx * step + (jx - 0.5) * step, z = gz * step + (jz - 0.5) * step, y = groundAt(m.heights, x, z);
      if (y < 2.2 || y > 44 || Math.hypot(x, z) > MAP_EDGE || roadAt(m, x, z) < 5) continue;
      const slope = Math.abs(groundAt(m.heights, x + 1, z) - groundAt(m.heights, x - 1, z)) + Math.abs(groundAt(m.heights, x, z + 1) - groundAt(m.heights, x, z - 1));
      if (slope > 1.4 || m.places.some((pl) => pl.kind !== 'lz' && Math.abs(pl.x - x) < pl.r + 4 && Math.abs(pl.z - z) < pl.r + 4 && Math.hypot(pl.x - x, pl.z - z) < pl.r + 4)) continue;
      q.setFromAxisAngle(up, jx * 6.28);
      const k = 0.7 + jz * 0.8;
      this.grass.setMatrixAt(n, mat4.compose(p.set(x, y - 0.03, z), q, s.set(k, k * (0.8 + jx * 0.6), k)));
      this.grass.setColorAt(n, c.setRGB(0.8 + jx * 0.35, 0.85 + jz * 0.3, 0.7, THREE.SRGBColorSpace));
      n++;
    }
    this.grass.count = n;
    this.grass.instanceMatrix.needsUpdate = true;
    if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
  }

  /** Whether a point is inside a bush (harder to see). */
  inBush(x: number, z: number) { return this.bushes.some(([bx, bz, k]) => Math.abs(bx - x) < k * 1.2 && Math.abs(bz - z) < k * 1.2); }
}
