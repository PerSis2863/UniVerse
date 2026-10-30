import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { THREE } from '../world/core';

// Ridgeline Ops' trees, bushes, rocks and grass with real shapes (M41c; the owner: "realistic
// graphics… like Call of Duty"). One picture (an atlas, painted once on a canvas: bark, a pine
// branch, a leaf cluster and two far-tree pictures) is shared by every tree kind, so each kind is
// still one mesh and one material and costs one draw per tile. Pines: a barked trunk that tapers,
// with whorls of drooping branches (each a crossed pair of needle cards, bent in two); broadleaf
// trees: a trunk that forks into branches ending in leaf clusters; bushes: leaf clusters; far trees:
// two crossed pictures. Leaves are lit as one rounded crown (their normals point out from its
// middle), so cards don't flash light and dark as they turn. Rocks are lumpy, mossy on top; grass
// blades curve.

type Rect = readonly [number, number, number, number];
const S = 1024;
/** An atlas area in canvas pixels [x, y, w, h] as uv [u0, v0, u1, v1] (v up, as textures are flipped). */
const uvOf = ([x, y, w, h]: Rect): Rect => [x / S, 1 - (y + h) / S, (x + w) / S, 1 - y / S];
const PX = { bark: [0, 0, 128, 512], needles: [128, 0, 384, 256], leaves: [512, 0, 512, 512], farPine: [128, 512, 256, 512], farLeafy: [384, 512, 256, 512] } as const;
const UV = { bark: uvOf(PX.bark), needles: uvOf(PX.needles), leaves: uvOf(PX.leaves), farPine: uvOf(PX.farPine), farLeafy: uvOf(PX.farLeafy) };

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

let atlas: THREE.CanvasTexture | null = null;
/** The painted atlas (made once). */
export function foliageAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!, r = rng(9);
  const green = (k: number, a = 1) => `hsla(${88 + r() * 30}, ${26 + r() * 18}%, ${12 + k * 22 + r() * 6}%, ${a})`;
  // Pine needles: darker and bluer than leaves.
  const needle = (k: number) => `hsl(${118 + r() * 26}, ${20 + r() * 16}%, ${9 + k * 17 + r() * 5}%)`;
  // Bark: dark brown with long fissures, lighter ridges and a few lichen spots.
  { const [x, y, w, h] = PX.bark;
    g.fillStyle = '#4a3a2c'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 90; i++) {
      const fx = x + r() * w, len = 40 + r() * 160, fy = y + r() * h;
      g.strokeStyle = r() < 0.6 ? `rgba(28,20,14,${0.5 + r() * 0.4})` : `rgba(120,98,76,${0.3 + r() * 0.3})`;
      g.lineWidth = 1 + r() * 4; g.beginPath(); g.moveTo(fx, fy);
      g.bezierCurveTo(fx + (r() - 0.5) * 10, fy + len * 0.33, fx + (r() - 0.5) * 10, fy + len * 0.66, fx + (r() - 0.5) * 8, fy + len); g.stroke();
    }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${120 + r() * 40},${130 + r() * 30},${90 + r() * 20},${0.25 + r() * 0.3})`; g.beginPath(); g.ellipse(x + r() * w, y + r() * h, 3 + r() * 8, 2 + r() * 6, r() * 3, 0, Math.PI * 2); g.fill(); }
  }
  // A pine branch: a twig from the left, drooping a little, thick with needles on both sides.
  { const [x, y, w, h] = PX.needles, mid = y + h / 2;
    const twig = (x0: number, y0: number, x1: number, y1: number, width: number) => { g.strokeStyle = '#3b2c20'; g.lineWidth = width; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 6, x1, y1); g.stroke(); };
    const sprays: [number, number, number, number][] = [[x + 4, mid, x + w - 8, mid + 14]];
    for (let i = 0; i < 9; i++) { const t = 0.15 + i * 0.09, sx = x + 4 + (w - 12) * t, sy = mid + 14 * t * t, side = i % 2 ? 1 : -1; sprays.push([sx, sy, sx + 50 + r() * 60 - t * 30, sy + side * (40 + r() * 34) * (1 - t * 0.6)]); }
    for (const [x0, y0, x1, y1] of sprays) twig(x0, y0, x1, y1, x0 === x + 4 ? 5 : 2.5);
    for (const [x0, y0, x1, y1] of sprays) {
      const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.4);
      for (let k = 0; k < n; k++) {
        const t = k / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t, a = Math.atan2(y1 - y0, x1 - x0), len = 16 + r() * 12 - t * 6;
        for (const side of [-1, 1]) {
          const na = a + side * (0.55 + r() * 0.5);
          g.strokeStyle = needle(0.3 + r() * 0.7); g.lineWidth = 1.1 + r() * 0.9;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(na) * len, py + Math.sin(na) * len); g.stroke();
        }
      }
    }
  }
  // A leaf cluster: many oval leaves, denser and darker in the middle, a few twigs.
  { const [x, y, w, h] = PX.leaves, cx = x + w / 2, cy = y + h / 2;
    g.strokeStyle = '#3d2e22'; g.lineWidth = 4;
    for (let i = 0; i < 7; i++) { const a = r() * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * w * 0.38, cy + Math.sin(a) * h * 0.38); g.stroke(); }
    for (let i = 0; i < 1100; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * w * 0.44, lx = cx + Math.cos(a) * d, ly = cy + Math.sin(a) * d * 0.92;
      const shade = 0.25 + (d / (w * 0.44)) * 0.45 + r() * 0.25;
      g.fillStyle = green(shade); g.beginPath(); g.ellipse(lx, ly, 6 + r() * 6, 3 + r() * 3, r() * Math.PI, 0, Math.PI * 2); g.fill();
      if (r() < 0.25) { g.fillStyle = `rgba(210,230,150,0.35)`; g.beginPath(); g.ellipse(lx - 1, ly - 1, 3, 1.5, r() * 3, 0, Math.PI * 2); g.fill(); }
    }
  }
  // Far pine: a trunk and tiers of ragged branches, widest at the bottom.
  { const [x, y, w, h] = PX.farPine, cx = x + w / 2;
    g.fillStyle = '#3d2e22'; g.fillRect(cx - 5, y + h * 0.25, 10, h * 0.75);
    for (let t = 0; t < 14; t++) {
      const k = t / 13, ty = y + h * (0.92 - k * 0.86), half = (w * 0.47) * (1 - k * 0.85);
      for (let i = 0; i < 70; i++) {
        const side = r() < 0.5 ? -1 : 1, d = r() * half, px = cx + side * d, py = ty + d * 0.35 + (r() - 0.5) * 14;
        g.strokeStyle = needle(0.25 + k * 0.4 + r() * 0.2); g.lineWidth = 2.5 + r() * 2.5;
        g.beginPath(); g.moveTo(cx + side * d * 0.4, ty - 4); g.lineTo(px, py); g.stroke();
      }
    }
  }
  // Far broadleaf: a trunk and a big round crown of leaf blobs.
  { const [x, y, w, h] = PX.farLeafy, cx = x + w / 2;
    g.fillStyle = '#3d2e22'; g.fillRect(cx - 7, y + h * 0.5, 14, h * 0.5);
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()), lx = cx + Math.cos(a) * d * w * 0.46, ly = y + h * 0.36 + Math.sin(a) * d * h * 0.3;
      g.fillStyle = green(0.3 + (1 - Math.sin(a) * d) * 0.25 + r() * 0.15); g.beginPath(); g.arc(lx, ly, 5 + r() * 7, 0, Math.PI * 2); g.fill();
    }
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  return atlas;
}

/** Collects triangles with their normals, atlas uvs and shades (vertex colours), then builds one geometry. */
class Builder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = [];
  /** A quad a-b-c-d (counter-clockwise), its uvs, a normal per corner, a shade per corner. */
  quad(p: THREE.Vector3[], u: [number, number][], n: THREE.Vector3[], shade: number[]) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(p[i].x, p[i].y, p[i].z); this.nor.push(n[i].x, n[i].y, n[i].z); this.uv.push(u[i][0], u[i][1]);
      this.col.push(shade[i], shade[i], shade[i]);
    }
  }
  /** A tapering, slightly bent cylinder from `a` to `b` in bark. */
  limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, sides = 7, rings = 3, bend = 0) {
    const axis = b.clone().sub(a), len = axis.length(), dir = axis.clone().normalize();
    const side = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const e1 = side.clone().cross(dir).normalize(), e2 = dir.clone().cross(e1).normalize();
    const [u0, v0, u1, v1] = UV.bark;
    const ring = (j: number) => {
      const t = j / rings, c = a.clone().addScaledVector(axis, t).addScaledVector(e2, Math.sin(t * Math.PI) * bend), rr = r0 + (r1 - r0) * t;
      return Array.from({ length: sides + 1 }, (_, i) => { const ang = (i / sides) * Math.PI * 2, n = e1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(e2, Math.sin(ang)); return { p: c.clone().addScaledVector(n, rr), n, u: u0 + (u1 - u0) * (i / sides), v: v0 + (v1 - v0) * Math.min(1, t * len / 9) }; });
    };
    let prev = ring(0);
    for (let j = 1; j <= rings; j++) {
      const cur = ring(j);
      for (let i = 0; i < sides; i++) {
        const q = [prev[i], prev[i + 1], cur[i + 1], cur[i]];
        this.quad(q.map((x) => x.p), q.map((x) => [x.u, x.v] as [number, number]), q.map((x) => x.n), q.map((x) => 0.55 + 0.45 * Math.min(1, x.p.y / 3)));
      }
      prev = cur;
    }
    return len;
  }
  /** A card from `root` along `dir`, `len` long and `width` wide, drooping by `droop`, its texture
   *  area `rect` laid with u along its length; `up` tips it (its flat side faces `up`). Lit as part of a
   *  crown round `centre`; two segments, so it bends. */
  card(root: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3, len: number, width: number, droop: number, rect: Rect, centre: THREE.Vector3, shadeBase = 0.75) {
    const across = dir.clone().cross(up).normalize().multiplyScalar(width / 2);
    const pts = [0, 0.5, 1].map((t) => root.clone().addScaledVector(dir, len * t).add(new THREE.Vector3(0, -droop * t * t, 0)));
    const [u0, v0, u1, v1] = rect;
    const nrm = (p: THREE.Vector3) => p.clone().sub(centre).normalize().add(new THREE.Vector3(0, 0.35, 0)).normalize();
    for (let s = 0; s < 2; s++) {
      const a = pts[s], b = pts[s + 1], ta = s / 2, tb = (s + 1) / 2;
      const q = [a.clone().sub(across), b.clone().sub(across), b.clone().add(across), a.clone().add(across)];
      const uu = u0 + (u1 - u0) * ta, ub = u0 + (u1 - u0) * tb;
      this.quad(q, [[uu, v0], [ub, v0], [ub, v1], [uu, v1]], q.map(nrm), q.map((p) => shadeBase + (1 - shadeBase) * Math.min(1, Math.max(0, (p.y - centre.y) / 4 + 0.5))));
    }
  }
  /** A leaf cluster: three cards crossing at their middles (a star), `size` across. */
  cluster(at: THREE.Vector3, size: number, rect: Rect, centre: THREE.Vector3, spin: number) {
    const [u0, v0, u1, v1] = rect, h = size / 2;
    const nrm = (p: THREE.Vector3) => p.clone().sub(centre).normalize().add(new THREE.Vector3(0, 0.3, 0)).normalize();
    for (let k = 0; k < 3; k++) {
      const a = spin + (k * Math.PI) / 3, tilt = k === 2 ? 1 : 0.25;
      const ax = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(h), ay = new THREE.Vector3(-Math.sin(a) * tilt, 1 - tilt * 0.5, Math.cos(a) * tilt).normalize().multiplyScalar(h);
      const q = [at.clone().sub(ax).sub(ay), at.clone().add(ax).sub(ay), at.clone().add(ax).add(ay), at.clone().sub(ax).add(ay)];
      this.quad(q, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], q.map(nrm), q.map((p) => 0.7 + 0.3 * Math.min(1, Math.max(0, (p.y - centre.y) / size + 0.5))));
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/** A pine about 10 m tall: a tapering trunk with eight whorls of drooping branches, a spire on top. */
export function pine() {
  const b = new Builder(), r = rng(31);
  b.limb(V(0, -0.3, 0), V(0, 9.6, 0), 0.34, 0.06, 7, 4);
  for (let t = 0; t < 8; t++) {
    const k = t / 7, y = 2.3 + k * 6.6, len = 3.3 - k * 2.5, n = 7 - Math.round(k * 2), centre = V(0, y - 0.3, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 2.39 + r() * 0.3, dir = V(Math.cos(a), 0.12 - k * 0.1, Math.sin(a)).normalize();
      // A flat card (seen from below and above) and an upright one (seen from the side).
      const flat = V(0, 1, 0), side = dir.clone().cross(UP).normalize();
      b.card(V(0, y, 0), dir, flat, len, 1.25 - k * 0.45, 0.55 + (1 - k) * 0.5, UV.needles, centre);
      b.card(V(0, y + 0.05, 0), dir, side, len * 0.92, 0.9 - k * 0.3, 0.5 + (1 - k) * 0.45, UV.needles, centre);
    }
  }
  b.card(V(0, 9.1, 0), UP, V(1, 0, 0), 1.3, 0.55, 0, UV.needles, V(0, 9, 0), 0.9);
  b.card(V(0, 9.1, 0), UP, V(0, 0, 1), 1.3, 0.55, 0, UV.needles, V(0, 9, 0), 0.9);
  return b.build();
}

/** A broadleaf tree about 8 m tall: a trunk that forks into five branches, a crown of leaf clusters. */
export function broadleaf() {
  const b = new Builder(), r = rng(57), crown = V(0, 5.6, 0);
  b.limb(V(0, -0.3, 0), V(0, 3.4, 0), 0.36, 0.24, 7, 3, 0.15);
  const tips: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.5, up = 1.6 + r() * 1.4, out = 1.5 + r() * 1.2;
    const from = V(0, 2.9 + r() * 0.6, 0), to = V(Math.cos(a) * out, from.y + up, Math.sin(a) * out);
    b.limb(from, to, 0.16, 0.06, 5, 2, 0.25);
    tips.push(to);
  }
  for (const [i, tip] of tips.entries()) { b.cluster(tip, 2.6 + r() * 0.8, UV.leaves, crown, i); b.cluster(tip.clone().lerp(crown, 0.45).add(V(0, 0.4, 0)), 2.3, UV.leaves, crown, i + 0.7); }
  b.cluster(V(0, 7, 0), 2.8, UV.leaves, crown, 0.3);
  b.cluster(V(0.4, 6.2, -0.5), 2.5, UV.leaves, crown, 1.9);
  return b.build();
}

/** A bush: five leaf clusters close to the ground. */
export function bush() {
  const b = new Builder(), centre = V(0, 0.55, 0);
  for (const [x, y, z, s, k] of [[0, 0.65, 0, 1.6, 0], [0.6, 0.5, 0.35, 1.2, 1], [-0.55, 0.5, -0.3, 1.25, 2], [0.15, 0.95, -0.4, 1.05, 3], [-0.2, 0.45, 0.55, 1.1, 4]]) b.cluster(V(x, y, z), s, UV.leaves, centre, k * 1.3);
  return b.build();
}

/** Far trees: two crossed pictures each (four triangles). */
function crossed(rect: Rect, w: number, h: number) {
  const b = new Builder(), centre = V(0, h * 0.55, 0), [u0, v0, u1, v1] = rect;
  for (const a of [0, Math.PI / 2]) {
    const ax = V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(w / 2);
    const q = [V(0, -0.2, 0).sub(ax), V(0, -0.2, 0).add(ax), V(0, h, 0).add(ax), V(0, h, 0).sub(ax)];
    b.quad(q, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], q.map((p) => p.clone().sub(centre).normalize().add(V(0, 0.6, 0)).normalize()), [0.75, 0.75, 1, 1]);
  }
  return b.build();
}
export const farPine = () => crossed(UV.farPine, 6.8, 10);
export const farLeafy = () => crossed(UV.farLeafy, 7, 8.4);

/** Smooth 3D noise for lumpy rocks. */
function noise3(x: number, y: number, z: number) {
  const h = (i: number, j: number, k: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v), l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
/** A boulder: a lumpy ball, flatter underneath, grey with moss where it faces the sky. */
export function rock(detail = 2) {
  // Shared corners (three's ball repeats them per face), so the shape bends smoothly instead of in facets.
  const ball = new THREE.IcosahedronGeometry(1, detail);
  ball.deleteAttribute('normal'); ball.deleteAttribute('uv');
  const g = mergeVertices(ball), p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  ball.dispose();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.72 + noise3(v.x * 1.6 + 3, v.y * 1.6, v.z * 1.6) * 0.45 + noise3(v.x * 4, v.y * 4, v.z * 4) * 0.12;
    v.multiplyScalar(k); if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.35;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal as THREE.BufferAttribute, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const moss = Math.max(0, Math.min(1, (n.getY(i) - 0.35) * 2.2 + (noise3(v.x * 3, v.y * 3, v.z * 3) - 0.5) * 0.9));
    const grey = 0.62 + noise3(v.x * 6, v.y * 6, v.z * 6) * 0.25;
    col.set([grey * (1 - moss) + 0.32 * moss, grey * (1 - moss) + 0.42 * moss, grey * (1 - moss) + 0.18 * moss], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // Stone laid on from the side each face looks to most (not wrapped round like a globe, which stretched it).
  const uv = new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
  g.setAttribute('uv', uv);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, v.x * 0.9, v.z * 0.9); else if (ax >= az) uv.setXY(i, v.z * 0.9, v.y * 0.9); else uv.setXY(i, v.x * 0.9, v.y * 0.9);
  }
  return g;
}

/** A grass clump: twelve thin blades that curve outward and taper to a point, dark at the root, light (some
 *  dry) at the tip. Lit from above, not by the blades' sides. */
export function grassClump() {
  const pos: number[] = [], col: number[] = [], r = rng(77);
  for (let b = 0; b < 12; b++) {
    const a = (b / 12) * Math.PI * 2 + r(), rad = 0.03 + r() * 0.13, h = 0.3 + r() * 0.38, w = 0.011 + r() * 0.008, lean = 0.08 + r() * 0.2;
    const dir = [Math.cos(a), Math.sin(a)], perp = [-dir[1] * w, dir[0] * w], dry = r() < 0.15;
    const at = (t: number) => [Math.cos(a) * rad + dir[0] * lean * t * t, h * t, Math.sin(a) * rad + dir[1] * lean * t * t] as const;
    const p0 = at(0), p1 = at(0.55), p2 = at(1), m = 0.7;
    const root = [0.05, 0.08, 0.03], mid = dry ? [0.36, 0.34, 0.17] : [0.15, 0.23, 0.07], tip = dry ? [0.52, 0.48, 0.26] : [0.3, 0.4, 0.14];
    const push = (pt: readonly number[], dx: number, dz: number, c: number[]) => { pos.push(pt[0] + dx, pt[1], pt[2] + dz); col.push(...c); };
    push(p0, -perp[0], -perp[1], root); push(p0, perp[0], perp[1], root); push(p1, perp[0] * m, perp[1] * m, mid);
    push(p0, -perp[0], -perp[1], root); push(p1, perp[0] * m, perp[1] * m, mid); push(p1, -perp[0] * m, -perp[1] * m, mid);
    push(p1, -perp[0] * m, -perp[1] * m, mid); push(p1, perp[0] * m, perp[1] * m, mid); push(p2, 0, 0, tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
  return g;
}

/** Leaves and needles keep their crown's normal on both sides (three flips it on the back faces). */
export const keepNormals = (sh: THREE.WebGLProgramParametersWithUniforms) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
};
