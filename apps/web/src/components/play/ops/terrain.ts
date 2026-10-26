import { MAP_CELL, MAP_CELLS, MAP_SIZE, groundAt, type OpsMap } from '@/lib/play/ops';
import { THREE } from '../world/core';
import { surfaceMaps } from '../world/textures';
import type { OpsRenderer } from './render';

// The ground (the owner: "multi-layered procedural splatmap textures (mud, rocky cliffs, wet grass,
// asphalt roads)"): one mesh over the height grid whose shader blends five surfaces by weights kept
// per vertex (sand by the sea, rock on steep slopes and high up, mud round the places, asphalt under
// roads, grass everywhere else), with a large-scale tint so the tiling doesn't show and wetness
// (darker, glossier) when it rains. Roads are their own strips on top (lines painted), the runway
// too, and the sea and the dam's lake are glossy water with moving ripples.

export const U = { time: { value: 0 }, wet: { value: 0 }, wind: { value: 1 } };

const SPLAT_VERT_PARS = 'attribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWorld;\n';
const SPLAT_FRAG_PARS = `varying vec4 vSplat; varying vec3 vWorld; uniform float uWet;
  uniform sampler2D tMud, tRock, tSand, tAsphalt, nRock;
  // Most of the ground is one or two surfaces: a surface with no weight here isn't sampled at all
  // (the slopes are taken outside the branches, so the texture filtering stays right).
  vec4 splatColor(vec2 uv) {
    vec2 dx = dFdx(uv), dy = dFdy(uv), ru = vWorld.xz * 0.06 + vWorld.y * 0.03, rx = dFdx(ru), ry = dFdy(ru);
    vec4 grass = texture2D(map, uv), mud = vec4(0.0), rock = vec4(0.0), sand = vec4(0.0), asph = vec4(0.0);
    if (vSplat.x > 0.004) mud = textureGrad(tMud, uv * 0.9, dx * 0.9, dy * 0.9);
    if (vSplat.y > 0.004) rock = textureGrad(tRock, ru, rx, ry);
    if (vSplat.z > 0.004) sand = textureGrad(tSand, uv * 0.7, dx * 0.7, dy * 0.7);
    if (vSplat.w > 0.004) asph = textureGrad(tAsphalt, uv * 0.8, dx * 0.8, dy * 0.8);
    float wg = max(0.0, 1.0 - vSplat.x - vSplat.y - vSplat.z - vSplat.w);
    vec4 c = grass * wg + mud * vSplat.x + rock * vSplat.y + sand * vSplat.z + asph * vSplat.w;
    // Big soft patches of lighter and darker ground (no visible tiling from afar).
    float macro = texture2D(map, vWorld.xz * 0.004).g * 1.6 + 0.2;
    c.rgb *= mix(1.0, macro, 0.35);
    c.rgb *= 1.0 - uWet * 0.28;
    return c;
  }`;

export function terrain(r: OpsRenderer, m: OpsMap) {
  const row = MAP_CELLS + 1, N = row * row, H = m.heights;
  const pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), splat = new Float32Array(N * 4);
  const muddy = m.places.filter((p) => !['ruin', 'wreck'].includes(p.kind));
  for (let iz = 0; iz < row; iz++) for (let ix = 0; ix < row; ix++) {
    const i = iz * row + ix, x = ix * MAP_CELL - MAP_SIZE / 2, z = iz * MAP_CELL - MAP_SIZE / 2, h = H[i];
    const hx = H[iz * row + Math.min(row - 1, ix + 1)] - H[iz * row + Math.max(0, ix - 1)], hz = H[Math.min(row - 1, iz + 1) * row + ix] - H[Math.max(0, iz - 1) * row + ix];
    const slope = Math.hypot(hx, hz) / (2 * MAP_CELL);
    let mud = 0;
    for (const p of muddy) mud = Math.max(mud, 1 - Math.hypot(x - p.x, z - p.z) / (p.r + 10));
    mud = Math.min(0.9, mud * 1.5);
    const rock = Math.min(1, Math.max(0, (slope - 0.45) * 2.6) + Math.max(0, (h - 46) / 10));
    const sand = h < 2.6 ? Math.min(1, (2.6 - h) / 1.4) : 0;
    const road = Math.max(0, Math.min(1, (6 - m.roadDist[i]) / 2.5));
    // Normalise so the weights never add past one (grass takes what's left).
    let a = mud * (1 - rock) * (1 - road), b = rock * (1 - road), c = sand * (1 - rock) * (1 - road), d = road;
    const sum = a + b + c + d; if (sum > 1) { a /= sum; b /= sum; c /= sum; d /= sum; }
    pos.set([x, h, z], i * 3); uv.set([x / 5, z / 5], i * 2); splat.set([a, b, c, d], i * 4);
  }
  // Low quality draws every other vertex (a quarter of the triangles; the ground's shape barely changes).
  const st = r.quality === 'low' ? 2 : 1, cells = MAP_CELLS / st, idx = new Uint32Array(cells * cells * 6);
  let k = 0;
  for (let iz = 0; iz < MAP_CELLS; iz += st) for (let ix = 0; ix < MAP_CELLS; ix += st) {
    const a = iz * row + ix, b = a + st, c = a + row * st, d = c + st;
    idx.set([a, c, b, b, c, d], k); k += 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const grass = surfaceMaps('grass'), mud = surfaceMaps('mud'), rock = surfaceMaps('rock'), sand = surfaceMaps('sand'), asphalt = surfaceMaps('asphalt');
  const mat = new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, metalness: 0 });
  r.patch(mat, (s) => {
    Object.assign(s.uniforms, { tMud: { value: mud.map }, tRock: { value: rock.map }, tSand: { value: sand.map }, tAsphalt: { value: asphalt.map }, nRock: { value: rock.normal }, uWet: U.wet });
    s.vertexShader = SPLAT_VERT_PARS + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = splat;\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\n' + SPLAT_FRAG_PARS)
      .replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = splatColor(vMapUv);\ndiffuseColor *= sampledDiffuseColor;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * (1.0 - vSplat.w * 0.2) * (1.0 - uWet * 0.6);')
      .replace('#include <normal_fragment_maps>', 'vec2 nu = vWorld.xz * 0.06 + vWorld.y * 0.03, nx = dFdx(nu), ny = dFdy(nu);\nvec3 mapN = texture2D(normalMap, vNormalMapUv).xyz;\nif (vSplat.y > 0.004) mapN = mix(mapN, textureGrad(nRock, nu, nx, ny).xyz, vSplat.y);\nmapN = mapN * 2.0 - 1.0;\nmapN.xy *= normalScale;\nnormal = normalize(tbn * mapN);');
  }, 'ops-terrain');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Asphalt strips along the roads, with white edges and a dashed centre line. */
let roadTex: THREE.CanvasTexture | null = null;
function roadTexture() {
  if (roadTex) return roadTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 512);
  for (let i = 0; i < img.data.length; i += 4) { const v = 52 + Math.random() * 26; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v + 2; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(220,220,210,0.75)'; g.fillRect(6, 0, 4, 512); g.fillRect(118, 0, 4, 512);
  g.fillStyle = 'rgba(214,170,40,0.8)'; for (let y = 0; y < 512; y += 128) g.fillRect(62, y, 4, 64);
  // Wear: dark tyre tracks and cracks.
  g.fillStyle = 'rgba(20,20,20,0.18)'; g.fillRect(28, 0, 18, 512); g.fillRect(82, 0, 18, 512);
  roadTex = new THREE.CanvasTexture(c); roadTex.colorSpace = THREE.SRGBColorSpace; roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.anisotropy = 8;
  return roadTex;
}
export function roads(m: OpsMap) {
  const group = new THREE.Group(), W = 3.4;
  const mat = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  for (const rd of m.roads) {
    const n = rd.pts.length;
    if (n < 2) continue;
    const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx: number[] = [];
    let along = 0;
    for (let i = 0; i < n; i++) {
      const [x, z] = rd.pts[i], [ax, az] = rd.pts[Math.max(0, i - 1)], [bx, bz] = rd.pts[Math.min(n - 1, i + 1)];
      const tx = bx - ax, tz = bz - az, tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
      if (i > 0) along += Math.hypot(x - rd.pts[i - 1][0], z - rd.pts[i - 1][1]);
      const lx = x + nx * W, lz = z + nz * W, rx = x - nx * W, rz = z - nz * W;
      pos.set([lx, groundAt(m.heights, lx, lz) + 0.07, lz, rx, groundAt(m.heights, rx, rz) + 0.07, rz], i * 6);
      uv.set([0, along / 14, 1, along / 14], i * 4);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true;
    group.add(mesh);
  }
  // The runway: 280 × 24 m with threshold stripes and centre dashes.
  const air = m.places.find((p) => p.kind === 'airfield');
  if (air) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 2048;
    const g = c.getContext('2d')!;
    g.fillStyle = '#3a3b3d'; g.fillRect(0, 0, 256, 2048);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},0.05)`; g.fillRect(Math.random() * 256, Math.random() * 2048, 2, 2); }
    g.fillStyle = 'rgba(230,230,225,0.85)';
    for (let y = 120; y < 1928; y += 110) g.fillRect(124, y, 8, 60);
    for (const y0 of [20, 1948]) for (let x = 16; x < 240; x += 26) g.fillRect(x, y0, 14, 80);
    g.fillRect(6, 0, 5, 2048); g.fillRect(245, 0, 5, 2048);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(24, 280, 1, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    strip.rotation.order = 'YXZ'; strip.rotation.x = -Math.PI / 2; strip.rotation.y = -air.dir + Math.PI / 2;
    // Follow the ground under it, vertex by vertex.
    strip.updateMatrixWorld();
    const p = strip.geometry.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    strip.position.set(air.x, 0, air.z); strip.updateMatrixWorld();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(strip.matrixWorld); p.setZ(i, groundAt(m.heights, v.x, v.z) + 0.08); }
    strip.geometry.computeVertexNormals();
    strip.receiveShadow = true;
    group.add(strip);
  }
  return group;
}

/** Ripples for the water (made once). */
let waterNormal: THREE.CanvasTexture | null = null;
function ripples() {
  if (waterNormal) return waterNormal;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!, img = g.createImageData(S, S);
  const h = (x: number, y: number) => Math.sin(x * 0.098) * 0.5 + Math.sin(y * 0.073 + x * 0.03) * 0.4 + Math.sin((x + y) * 0.21) * 0.2 + Math.sin(x * 0.4 - y * 0.33) * 0.08;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1), l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  waterNormal = new THREE.CanvasTexture(c); waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
  return waterNormal;
}
export class Water {
  group = new THREE.Group();
  private mats: THREE.MeshStandardMaterial[] = [];
  constructor(m: OpsMap) {
    const n = ripples();
    const make = (color: number, rep: number) => {
      const t = n.clone(); t.repeat.set(rep, rep); t.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0.15, normalMap: t, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.9 });
      this.mats.push(mat);
      return mat;
    };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), make(0x173f4f, 160));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.2;
    const lake = new THREE.Mesh(new THREE.CircleGeometry(m.lake.r + 14, 48), make(0x1d4a4a, 12));
    lake.rotation.x = -Math.PI / 2; lake.position.set(m.lake.x, m.lake.y, m.lake.z);
    this.group.add(sea, lake);
  }
  update(t: number) { for (const [i, mt] of this.mats.entries()) { mt.normalMap!.offset.set(t * 0.004 * (i + 1), t * 0.0025); } }
}
