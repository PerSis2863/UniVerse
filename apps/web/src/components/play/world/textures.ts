import { THREE } from './core';

// Realistic surfaces for the 3D worlds (M39), made in the browser (no image files to download):
// fractal noise gives each surface its grain, and a bump (normal) map made from the same pattern
// catches the light the way real stone, metal, tiles and plastic do. Each is made once and shared.
// Boxes get UVs in world units (core.ts `worldUv`), so the grain is the same size on every block.

type Maps = { map: THREE.CanvasTexture; normal: THREE.CanvasTexture; rough: THREE.CanvasTexture };
const cache = new Map<string, Maps>();
type RGB = [number, number, number];

/** Smooth random noise on a grid that wraps (so textures tile without seams). */
function noise(size: number, cells: number, seed: number) {
  const g = new Float32Array(cells * cells);
  let s = seed >>> 0;
  for (let i = 0; i < g.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; g[i] = s / 4294967296; }
  const out = new Float32Array(size * size), k = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * k, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), r0 = (y0 % cells) * cells, r1 = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const fx = x * k, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), c0 = x0 % cells, c1 = (x0 + 1) % cells;
      const a = g[r0 + c0] + (g[r0 + c1] - g[r0 + c0]) * sx, b = g[r1 + c0] + (g[r1 + c1] - g[r1 + c0]) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  }
  return out;
}
/** Several octaves of noise: big shapes and fine grain together. */
function fbm(size: number, seed: number, base = 4, octaves = 5) {
  const out = new Float32Array(size * size);
  let amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = noise(size, base << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

type Paint = (x: number, y: number, n: number) => { rgb: RGB; h: number; r: number };

function canvasTex(data: Uint8ClampedArray, size: number, srgb: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Builds the colour, bump and roughness maps from a painter that sees each pixel and its noise. */
function make(key: string, size: number, seed: number, paint: Paint, bump = 2.5): Maps {
  const hit = cache.get(key);
  if (hit) return hit;
  const n = fbm(size, seed);
  const col = new Uint8ClampedArray(size * size * 4), rough = new Uint8ClampedArray(size * size * 4), height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, p = paint(x, y, n[i]);
    col[i * 4] = p.rgb[0]; col[i * 4 + 1] = p.rgb[1]; col[i * 4 + 2] = p.rgb[2]; col[i * 4 + 3] = 255;
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = Math.max(0, Math.min(1, p.r)) * 255; rough[i * 4 + 3] = 255;
    height[i] = p.h;
  }
  // Normal map from the height: the slope across and down at each pixel (wrapping at the edges).
  const nor = new Uint8ClampedArray(size * size * 4), m = size - 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (height[y * size + ((x + 1) & m)] - height[y * size + ((x + m) & m)]) * bump;
    const dy = (height[((y + 1) & m) * size + x] - height[((y + m) & m) * size + x]) * bump;
    const len = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
    nor[o] = (-dx / len * 0.5 + 0.5) * 255; nor[o + 1] = (-dy / len * 0.5 + 0.5) * 255; nor[o + 2] = (1 / len * 0.5 + 0.5) * 255; nor[o + 3] = 255;
  }
  const out = { map: canvasTex(col, size, true), normal: canvasTex(nor, size, false), rough: canvasTex(rough, size, false) };
  cache.set(key, out);
  return out;
}

const mix = (a: readonly number[], b: readonly number[], t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dim = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

const SURFACES = {
  /** Weathered stone with cracks (the sky islands). */
  stone: () => make('stone', 256, 7, (x, _y, n) => {
    const crack = Math.abs(Math.sin((x * 0.11 + n * 9) * 1.3)) < 0.04 ? 0.35 : 0;
    return { rgb: dim(mix([150, 146, 140], [230, 226, 218], n), 1 - crack), h: n - crack, r: 0.72 + n * 0.2 };
  }, 3.5),
  /** Soil and grass grain, near white so the terrain's own colours show through (Ridgeline Ops). */
  ground: () => make('ground', 256, 91, (x, y, n) => {
    const blade = Math.sin(x * 2.1 + n * 20) * Math.sin(y * 1.7 - n * 14) * 0.08;
    return { rgb: mix([196, 196, 190], [255, 255, 250], n + blade), h: n + blade * 2, r: 0.8 + n * 0.2 };
  }, 2.2),
  /** Polished concrete with soft mottling (arenas, ceilings). */
  concrete: () => make('concrete', 256, 21, (_x, _y, n) => ({ rgb: mix([150, 152, 158], [215, 217, 222], n), h: n * 0.4, r: 0.3 + n * 0.45 }), 1.2),
  /** Brushed metal panels with seams and rivets (the station, cover blocks). */
  panels: () => make('panels', 256, 33, (x, y, n) => {
    const seam = x % 128 < 3 || y % 128 < 3, rivet = Math.hypot((x % 64) - 8, (y % 64) - 8) < 3;
    const brush = Math.sin(y * 0.9 + n * 6) * 0.04;
    return { rgb: dim(mix([170, 176, 188], [225, 230, 238], n * 0.6 + brush + 0.2), seam ? 0.5 : 1), h: (seam ? -0.6 : 0) + (rivet ? 0.5 : 0) + n * 0.1, r: 0.3 + n * 0.25 + (seam ? 0.3 : 0) };
  }, 4),
  /** Old school-hall floor tiles: checkered, scuffed, with grout lines. */
  tiles: () => make('tiles', 256, 45, (x, y, n) => {
    const grout = x % 64 < 2 || y % 64 < 2, dark = (Math.floor(x / 64) + Math.floor(y / 64)) % 2;
    const base: RGB = dark ? [52, 50, 46] : [190, 182, 160];
    return { rgb: grout ? [34, 32, 29] : mix(base, dim(base, 0.72), n), h: grout ? -0.5 : n * 0.15, r: grout ? 0.95 : 0.22 + n * 0.4 };
  }, 3),
  /** Painted metal lockers: doors, vents, handles, chipped paint. */
  lockers: () => make('lockers', 256, 57, (x, y, n) => {
    const door = x % 64, row = y % 128, gap = door < 3;
    const vent = door > 14 && door < 50 && row > 12 && row < 40 && y % 6 < 2, handle = door > 52 && door < 56 && row > 60 && row < 76;
    const chip = n > 0.72 ? 15 : 0;
    const paint = dim(mix([62, 84, 76], [86, 108, 96], n), gap ? 0.3 : vent ? 0.4 : 1);
    return { rgb: handle ? [180, 185, 190] : [paint[0] + chip, paint[1] + chip, paint[2] + chip], h: gap ? -0.6 : vent ? -0.3 : handle ? 0.4 : n * 0.08, r: handle ? 0.2 : 0.45 + n * 0.3 };
  }, 3),
  /* Ridgeline Ops' ground and building surfaces (the terrain blends the first five). */
  /** Wet meadow grass: blades in two greens over dark soil. */
  grass: () => make('grass', 256, 101, (x, y, n) => {
    const blade = Math.abs(Math.sin(x * 1.9 + n * 25) * Math.cos(y * 2.3 - n * 17));
    return { rgb: mix(mix([52, 66, 30], [96, 112, 48], n), [128, 140, 70], blade * 0.35), h: n * 0.6 + blade * 0.4, r: 0.85 - blade * 0.15 };
  }, 2.6),
  /** Mud and packed dirt with puddle-smooth patches and pebbles. */
  mud: () => make('mud', 256, 113, (x, y, n) => {
    const pebble = Math.hypot((x * 7) % 23 - 11, (y * 5) % 19 - 9) < 2.5 && n > 0.55;
    const wet = n < 0.38;
    return { rgb: pebble ? [120, 112, 98] : mix([62, 48, 34], [112, 92, 66], n), h: pebble ? 0.9 : n * 0.5, r: wet ? 0.35 : 0.9 };
  }, 2.4),
  /** Rock cliffs: layered strata, cracks and lichen. */
  rock: () => make('rock', 256, 127, (x, y, n) => {
    const strata = Math.sin(y * 0.18 + n * 8) * 0.5 + 0.5, crack = Math.abs(Math.sin((x * 0.07 + n * 6) * 2.1)) < 0.05;
    const lichen = n > 0.68 ? 0.3 : 0;
    const base = mix([92, 88, 82], [150, 144, 134], strata * 0.6 + n * 0.4);
    return { rgb: dim(mix(base, [96, 110, 62], lichen), crack ? 0.55 : 1), h: strata * 0.5 + n * 0.5 - (crack ? 0.6 : 0), r: 0.75 + n * 0.2 };
  }, 3.2),
  /** Beach sand with ripples. */
  sand: () => make('sand', 256, 139, (x, y, n) => {
    const ripple = Math.sin(x * 0.25 + Math.sin(y * 0.05) * 3 + n * 4) * 0.5 + 0.5;
    return { rgb: mix([176, 158, 116], [214, 196, 152], n * 0.6 + ripple * 0.4), h: ripple * 0.5 + n * 0.3, r: 0.92 };
  }, 1.6),
  /** Worn asphalt: aggregate grain, cracks, tar patches. */
  asphalt: () => make('asphalt', 256, 151, (x, y, n) => {
    const grit = ((x * 73 + y * 151) % 7) / 7, crack = Math.abs(Math.sin(x * 0.05 + n * 9) + Math.cos(y * 0.04 - n * 7)) < 0.04;
    return { rgb: dim(mix([44, 44, 46], [78, 78, 80], n * 0.5 + grit * 0.5), crack ? 0.6 : 1), h: grit * 0.4 + n * 0.2 - (crack ? 0.5 : 0), r: 0.72 + grit * 0.2 };
  }, 2),
  /** Weathered wooden planks. */
  wood: () => make('wood', 256, 163, (x, y, n) => {
    const plank = Math.floor(y / 32), seam = y % 32 < 2, grain = Math.sin(x * 0.12 + Math.sin(y * 0.3 + plank) * 2 + n * 6) * 0.5 + 0.5;
    return { rgb: dim(mix([88, 64, 42], [140, 106, 72], grain * 0.6 + n * 0.4), seam ? 0.45 : 1 - (plank % 3) * 0.06), h: seam ? -0.6 : grain * 0.3, r: 0.85 };
  }, 2.6),
  /** Corrugated sheet metal with rust streaks. */
  corrugated: () => make('corrugated', 256, 175, (x, y, n) => {
    const rib = Math.sin(x * 0.4) * 0.5 + 0.5, rust = n > 0.62 ? (n - 0.62) * 2.4 : 0;
    return { rgb: mix(mix([150, 156, 160], [190, 196, 200], rib), [134, 74, 40], Math.min(1, rust + (y / 256) * rust)), h: rib, r: 0.45 + rust * 0.5 };
  }, 3),
  /** Woven sandbag fabric. */
  fabric: () => make('fabric', 256, 187, (x, y, n) => {
    const weave = (x % 4 < 2) !== (y % 4 < 2) ? 1 : 0;
    return { rgb: mix([150, 132, 96], [186, 168, 126], n * 0.7 + weave * 0.3), h: weave * 0.4 + n * 0.3, r: 0.95 };
  }, 1.8),
  /** Pine bark: deep vertical fissures. */
  bark: () => make('bark', 256, 199, (x, y, n) => {
    const fissure = Math.abs(Math.sin(x * 0.18 + Math.sin(y * 0.03) * 2 + n * 3));
    return { rgb: dim(mix([54, 40, 30], [96, 74, 56], n), 0.55 + fissure * 0.45), h: fissure, r: 0.95 };
  }, 3.4),
};
export type Surface = keyof typeof SURFACES;
/** A surface's colour, bump and roughness pictures (for custom shaders, like the blended terrain). */
export const surfaceMaps = (kind: Surface) => SURFACES[kind]();

/** A physically lit material wearing one of the surfaces, tinted by `color`. */
export function surface(kind: Surface, { color = 0xffffff, metal = 0, rough = 1, bump = 1, emissive = 0x000000, glow = 0, emissiveMap }: { color?: number; metal?: number; rough?: number; bump?: number; emissive?: number; glow?: number; emissiveMap?: THREE.Texture } = {}) {
  const t = SURFACES[kind]();
  return new THREE.MeshStandardMaterial({ color, map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(bump, bump), roughnessMap: t.rough, roughness: rough, metalness: metal, emissive, emissiveIntensity: glow, emissiveMap });
}

/** Molten rock: dark crust with bright cracks (scroll its offset to make it flow). */
export function lava() {
  return make('lava', 256, 81, (_x, _y, n) => {
    const hot = Math.max(0, 1 - Math.abs(n - 0.5) * 9);
    return { rgb: mix([40, 8, 4], [255, 170, 60], Math.min(1, hot * 1.4 + n * 0.25)), h: -hot, r: 0.9 };
  }, 2).map;
}

/** A planet's surface: oceans, land and ice caps from the same noise (wraps around the sphere). */
export function planet(key: string, sea: RGB, land: RGB, seed: number) {
  return make(`planet-${key}`, 512, seed, (_x, y, n) => {
    const lat = Math.abs(y / 256 - 1), ice = lat > 0.86 - n * 0.1;
    const rgb = ice ? mix([220, 230, 240], [255, 255, 255], n) : n > 0.54 ? mix(land, dim(land, 0.6), (n - 0.54) * 4) : mix(dim(sea, 0.7), sea, n * 1.6);
    return { rgb, h: n > 0.54 ? n : 0.54, r: n > 0.54 ? 0.85 : 0.35 };
  }, 3).map;
}

let cloudTex: THREE.CanvasTexture | null = null;
/** A soft, lumpy cloud made of overlapping puffs (a sprite, so it always faces the camera). */
export function cloud(size: number, opacity = 0.9) {
  if (!cloudTex) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d')!;
    for (const [x, y, r] of [[70, 80, 42], [120, 62, 54], [178, 78, 44], [100, 92, 40], [150, 94, 40], [210, 92, 30], [44, 96, 28]]) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.6, 'rgba(250,250,255,0.6)'); grad.addColorStop(1, 'rgba(240,240,250,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    cloudTex = new THREE.CanvasTexture(c);
    cloudTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity, depthWrite: false }));
  s.scale.set(size, size / 2, 1);
  return s;
}
