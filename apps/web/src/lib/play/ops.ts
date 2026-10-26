import { hash, seeded } from '../seeded-shuffle';

// Ridgeline Ops (16+, UniVerse Play; the owner: "an open world tactical shooter… inspired by
// [Blackhawk Rescue Mission 5]… a looter shooter"): an island of hills, forests and enemy outposts.
// A helicopter drops you at a landing zone you pick; you raid outposts, search crates and fallen
// enemies for loot (five rarities: guns, armour plates, medkits, grenades and valuables), free the
// hostages, then call the helicopter at a landing zone and get out alive to bank what you carry.
// Go down and your backpack stays where you fell (go back for it). Only banked loot, kills and
// objectives score. Everything here is seeded, so a room's players get the same island and loot.
// Distances are metres; the island is centred on 0,0 with the sea all around.

export const OPS_SIZE = 480, OPS_CELLS = 120, OPS_CELL = OPS_SIZE / OPS_CELLS;
/** The edge of the playable land (beyond it, the sea pushes you back). */
export const OPS_EDGE = 214;

/* ── Scoring ── */
export const OPS_KILL = 60, OPS_HEADSHOT = 40, OPS_OUTPOST = 750, OPS_HQ = 2_000, OPS_HOSTAGE = 1_500, OPS_EXTRACT = 400;
/** The extraction bonus only counts for a run of at least this long with something to bank. */
export const OPS_EXTRACT_MIN_S = 40;
/** The helicopter needs this long to arrive after you call it (hold the landing zone). */
export const OPS_HELI_WAIT_S = 14;
/** Backpack slots for valuables (guns and gear are carried apart). */
export const OPS_PACK = 8;
/** Reinforcements: a squad of three from 90 s, then every 50 s, at most 36 soldiers in a round. */
export const OPS_REINFORCE_FROM_S = 90, OPS_REINFORCE_EVERY_S = 50, OPS_SQUAD = 3, OPS_REINFORCE_MAX = 36;
export const OPS_HP = 100, OPS_PLATE = 50, OPS_PLATES = 3, OPS_MEDS = 4, OPS_NADES = 3, OPS_AMMO_MAX = 480, OPS_AMMO_START = 240;
export const OPS_MED_HEAL = 60, OPS_MED_S = 1.6;
export const OPS_NADE_R = 7, OPS_NADE_DMG = 170, OPS_NADE_FUSE_S = 2.2;

/* ── Rarity ── */
export const RARITY = [
  { name: 'Common', color: '#a1a1aa', hex: 0xa1a1aa },
  { name: 'Uncommon', color: '#4ade80', hex: 0x4ade80 },
  { name: 'Rare', color: '#60a5fa', hex: 0x60a5fa },
  { name: 'Epic', color: '#c084fc', hex: 0xc084fc },
  { name: 'Legendary', color: '#fbbf24', hex: 0xfbbf24 },
] as const;
export type Rarity = 0 | 1 | 2 | 3 | 4;
/** What a valuable is worth when banked, and what it's called, by rarity. */
export const VALUABLES = [
  { name: 'Spare parts', value: 40 }, { name: 'Field radio', value: 90 }, { name: 'Intel folder', value: 180 },
  { name: 'Gold bar', value: 360 }, { name: 'Encrypted drive', value: 800 },
] as const;

/* ── Guns ── */
export type GunId = 'carbine' | 'smg' | 'dmr' | 'shotgun' | 'lmg' | 'pistol';
export interface Gun {
  name: string;
  /** Damage per bullet (a shotgun fires `pellets`). */
  dmg: number; pellets: number;
  /** Shots a minute; automatic guns fire while held. */
  rpm: number; auto: boolean;
  mag: number; reload: number;
  /** Spread when aiming (radians); from the hip it's 2.6× wider. */
  spread: number;
  /** Damage starts to fall off past this (to half at twice the range). */
  range: number;
  /** How far each shot kicks the view up. */
  kick: number;
  /** Zoom when aiming (degrees narrower). */
  zoom: number;
}
export const GUNS: Record<GunId, Gun> = {
  carbine: { name: 'Carbine', dmg: 24, pellets: 1, rpm: 720, auto: true, mag: 30, reload: 2.2, spread: 0.008, range: 110, kick: 0.009, zoom: 22 },
  smg: { name: 'SMG', dmg: 17, pellets: 1, rpm: 950, auto: true, mag: 35, reload: 1.8, spread: 0.014, range: 55, kick: 0.007, zoom: 16 },
  dmr: { name: 'Marksman rifle', dmg: 60, pellets: 1, rpm: 260, auto: false, mag: 12, reload: 2.6, spread: 0.002, range: 220, kick: 0.03, zoom: 38 },
  shotgun: { name: 'Shotgun', dmg: 14, pellets: 8, rpm: 90, auto: false, mag: 7, reload: 3, spread: 0.05, range: 22, kick: 0.05, zoom: 12 },
  lmg: { name: 'Light machine gun', dmg: 26, pellets: 1, rpm: 640, auto: true, mag: 80, reload: 4.2, spread: 0.014, range: 120, kick: 0.011, zoom: 20 },
  pistol: { name: 'Sidearm', dmg: 22, pellets: 1, rpm: 420, auto: false, mag: 15, reload: 1.5, spread: 0.01, range: 50, kick: 0.016, zoom: 14 },
};
/** The guns crates and soldiers can drop (the sidearm is everyone's second gun to start). */
export const LOOT_GUNS: GunId[] = ['carbine', 'smg', 'dmr', 'shotgun', 'lmg'];
/** Legendary guns get a name of their own. */
export const LEGEND_NAMES: Record<GunId, string> = { carbine: 'Tempest', smg: 'Hornet', dmr: 'Longshot', shotgun: 'Thunderclap', lmg: 'Avalanche', pistol: 'Viper' };
/** A gun at a rarity: each step adds 10% damage and magazine and loads 5% faster. */
export function gunAt(id: GunId, rarity: Rarity): Gun {
  const g = GUNS[id];
  return { ...g, name: rarity === 4 ? LEGEND_NAMES[id] : g.name, dmg: Math.round(g.dmg * (1 + 0.1 * rarity)), mag: Math.round(g.mag * (1 + 0.1 * rarity)), reload: +(g.reload * (1 - 0.05 * rarity)).toFixed(2) };
}
/** Damage at a distance: full up to the gun's range, then falling to half at twice it. */
export const falloff = (g: Gun, dist: number) => (dist <= g.range ? 1 : Math.max(0.5, 1 - 0.5 * ((dist - g.range) / g.range)));
/** The gun's rating, one number to compare two (damage a second, a little for the magazine). */
export const gunScore = (g: Gun) => Math.round((g.dmg * g.pellets * g.rpm) / 60 + g.mag * 2 + g.range * 0.4);

/* ── Items ── */
export type OpsItem =
  | { kind: 'valuable'; rarity: Rarity; name: string; value: number }
  | { kind: 'gun'; rarity: Rarity; gun: GunId }
  | { kind: 'plate' } | { kind: 'med' } | { kind: 'nade' } | { kind: 'ammo'; n: number };
export type Valuable = Extract<OpsItem, { kind: 'valuable' }>;
export const itemRarity = (it: OpsItem): Rarity => (it.kind === 'valuable' || it.kind === 'gun' ? it.rarity : 0);
export const itemName = (it: OpsItem) => it.kind === 'valuable' ? it.name : it.kind === 'gun' ? gunAt(it.gun, it.rarity).name : it.kind === 'plate' ? 'Armour plate' : it.kind === 'med' ? 'Medkit' : it.kind === 'nade' ? 'Grenade' : `${it.n} rounds`;

/** A rarity roll: `tier` 0 (the wild) to 2 (the headquarters) makes the good ones likelier; never above `cap`. */
export function rollRarity(r: () => number, tier: number, cap: Rarity = 4): Rarity {
  const w = [52, 27, 13, 6, 2].map((x, i) => x * Math.pow(1 + tier * 0.6, i)).slice(0, cap + 1);
  let roll = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { roll -= w[i]; if (roll < 0) return i as Rarity; }
  return cap;
}
function rollItem(r: () => number, tier: number, cap: Rarity = 4): OpsItem {
  const k = r();
  if (k < 0.46) { const rarity = rollRarity(r, tier, cap); return { kind: 'valuable', rarity, ...VALUABLES[rarity] }; }
  if (k < 0.64) return { kind: 'ammo', n: 60 + Math.floor(r() * 4) * 15 };
  if (k < 0.79) return { kind: 'gun', rarity: rollRarity(r, tier, cap), gun: LOOT_GUNS[Math.floor(r() * LOOT_GUNS.length)] };
  if (k < 0.89) return { kind: 'med' };
  if (k < 0.96) return { kind: 'plate' };
  return { kind: 'nade' };
}

/* ── Enemies ── */
export type FoeKind = 'rifleman' | 'heavy' | 'marksman' | 'commander';
export const FOES: Record<FoeKind, { hp: number; dmg: number; burst: number; gap: number; sight: number; speed: number; cap: Rarity; gun: GunId }> = {
  rifleman: { hp: 100, dmg: 7, burst: 4, gap: 1.3, sight: 70, speed: 3.4, cap: 2, gun: 'carbine' },
  heavy: { hp: 190, dmg: 6, burst: 8, gap: 1.8, sight: 60, speed: 2.6, cap: 3, gun: 'lmg' },
  marksman: { hp: 90, dmg: 24, burst: 1, gap: 2.6, sight: 140, speed: 3, cap: 3, gun: 'dmr' },
  commander: { hp: 360, dmg: 9, burst: 5, gap: 1.1, sight: 80, speed: 3, cap: 4, gun: 'carbine' },
};
/** Headshots do this much more. */
export const OPS_HEAD_X = 2.2;
/** What a soldier drops (the same for everyone in a room): the commander a legendary drive and gun. */
export function foeDrop(seed: number, id: number, kind: FoeKind): OpsItem[] {
  const r = seeded(hash(`${seed}:drop:${id}`));
  if (kind === 'commander') return [{ kind: 'valuable', rarity: 4, ...VALUABLES[4] }, { kind: 'gun', rarity: 4, gun: LOOT_GUNS[Math.floor(r() * LOOT_GUNS.length)] }];
  const out: OpsItem[] = [rollItem(r, kind === 'rifleman' ? 0 : 1, FOES[kind].cap)];
  if (r() < 0.35) out.push({ kind: 'ammo', n: 45 });
  return out;
}
/** The most a soldier's drop can be worth when banked. */
export const foeDropMax = (kind: FoeKind) => (kind === 'commander' ? VALUABLES[4].value : VALUABLES[FOES[kind].cap].value);

/* ── The island ── */
export type PlaceKind = 'lz' | 'hq' | 'compound' | 'camp' | 'tower' | 'depot';
/** A block of a building, wall, tent or container (solid). `y` is its bottom. */
export interface Block { x: number; y: number; z: number; w: number; h: number; d: number; kind: 'wall' | 'roof' | 'sandbag' | 'tent' | 'container' | 'tower' | 'deck' }
export interface Place { id: number; kind: PlaceKind; name: string; x: number; z: number; y: number; r: number; foes: FoeKind[]; hostage: boolean; blocks: Block[] }
export interface Crate { id: number; place: number; x: number; z: number; items: OpsItem[] }
export interface OpsMap { seed: number; heights: Float32Array; places: Place[]; crates: Crate[]; trees: [number, number, number][]; rocks: [number, number, number][] }

const PLACE_NAMES = ['Copperhead Camp', 'Basalt Ridge', 'Old Quarry', 'Signal Hill', 'Dry Creek Depot', 'Kestrel Post', 'Pine Hollow', 'Ash Valley', 'Fort Marrow', 'Eagle Rock'];
const LZ_NAMES = ['LZ Alpha', 'LZ Bravo', 'LZ Charlie', 'LZ Delta'];
const PLACE_KINDS: PlaceKind[] = ['compound', 'camp', 'tower', 'depot', 'compound', 'camp'];
const KIND_FOES: Record<Exclude<PlaceKind, 'lz'>, FoeKind[]> = {
  hq: ['commander', 'heavy', 'heavy', 'marksman', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'rifleman'],
  compound: ['heavy', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'rifleman'],
  camp: ['rifleman', 'rifleman', 'rifleman', 'rifleman', 'marksman'],
  tower: ['marksman', 'rifleman', 'rifleman', 'rifleman'],
  depot: ['heavy', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'rifleman'],
};
const CRATES_AT: Record<PlaceKind, number> = { lz: 0, hq: 6, compound: 4, camp: 3, tower: 3, depot: 5 };
const RADIUS: Record<PlaceKind, number> = { lz: 12, hq: 30, compound: 18, camp: 15, tower: 14, depot: 18 };
export const WILD_CRATES = 14;

/** Smooth noise from integer hashing (the same in every browser). */
function lattice(ix: number, iz: number, s: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, z: number, s: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = lattice(ix, iz, s), b = lattice(ix + 1, iz, s), c = lattice(ix, iz + 1, s), d = lattice(ix + 1, iz + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number, s: number, oct = 5) {
  let sum = 0, amp = 0.5, f = 1, tot = 0;
  for (let o = 0; o < oct; o++) { sum += noise(x * f, z * f, s + o * 31) * amp; tot += amp; amp *= 0.5; f *= 2; }
  return sum / tot;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The land before the places are levelled: hills and ridges inland, beaches and sea at the edge. */
function rawHeight(x: number, z: number, s: number) {
  const d = Math.hypot(x, z) / (OPS_SIZE / 2);
  const land = 1 - smooth(0.74, 0.98, d);
  const hills = fbm(x * 0.009 + 7, z * 0.009 - 3, s);
  const ridge = 1 - Math.abs(2 * fbm(x * 0.006 - 11, z * 0.006 + 5, s + 9, 4) - 1);
  const h = 2.5 + hills * 18 + ridge * ridge * 16;
  return h * land - 7 * (1 - land);
}

/** The ground's height at any point, from the height grid, matching the drawn terrain exactly
 *  (each grid square is two triangles split from its far-left to near-right corner). */
export function groundAt(heights: Float32Array, x: number, z: number) {
  const n = OPS_CELLS, gx = Math.max(0, Math.min(n - 1e-6, (x + OPS_SIZE / 2) / OPS_CELL)), gz = Math.max(0, Math.min(n - 1e-6, (z + OPS_SIZE / 2) / OPS_CELL));
  const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, row = n + 1;
  const h00 = heights[iz * row + ix], h10 = heights[iz * row + ix + 1], h01 = heights[(iz + 1) * row + ix], h11 = heights[(iz + 1) * row + ix + 1];
  return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

/** A house with a doorway (four walls and a roof) facing `face` (0 +z, 1 +x, 2 -z, 3 -x). */
function house(x: number, y: number, z: number, w: number, d: number, face: number, out: Block[]) {
  const h = 3.2, t = 0.35, door = 1.8;
  const walls: Block[] = [
    { x, y, z: z - d / 2, w, h, d: t, kind: 'wall' }, { x, y, z: z + d / 2, w, h, d: t, kind: 'wall' },
    { x: x - w / 2, y, z, w: t, h, d, kind: 'wall' }, { x: x + w / 2, y, z, w: t, h, d, kind: 'wall' },
  ];
  // The doorway: the facing wall in two halves with a gap in the middle.
  const i = [1, 3, 0, 2][face], wall = walls[i], along = i < 2 ? 'w' : 'd';
  const len = wall[along], half = (len - door) / 2;
  const a = { ...wall, [along]: half }, b = { ...wall, [along]: half };
  if (along === 'w') { a.x = x - door / 2 - half / 2; b.x = x + door / 2 + half / 2; } else { a.z = z - door / 2 - half / 2; b.z = z + door / 2 + half / 2; }
  walls.splice(i, 1, a, b);
  out.push(...walls, { x, y: y + h, z, w: w + 0.6, h: 0.3, d: d + 0.6, kind: 'roof' });
}
/** A square wall round a place with a gate in each side listed in `gates`. */
function perimeter(x: number, y: number, z: number, s: number, gates: number[], out: Block[]) {
  const h = 2.4, t = 0.5, gap = 5;
  for (let side = 0; side < 4; side++) {
    const horiz = side % 2 === 0, cx = horiz ? x : x + (side === 1 ? s : -s), cz = horiz ? z + (side === 0 ? s : -s) : z;
    const segs: [number, number][] = gates.includes(side) ? [[-s, -gap / 2], [gap / 2, s]] : [[-s, s]];
    for (const [a, b] of segs) {
      const len = b - a, mid = (a + b) / 2;
      out.push(horiz ? { x: cx + mid, y, z: cz, w: len, h, d: t, kind: 'wall' } : { x: cx, y, z: cz + mid, w: t, h, d: len, kind: 'wall' });
    }
  }
}
/** A watchtower: four legs and a deck six metres up (a marksman stands there). */
function tower(x: number, y: number, z: number, out: Block[]) {
  for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) out.push({ x: x + dx, y, z: z + dz, w: 0.3, h: 6, d: 0.3, kind: 'tower' });
  out.push({ x, y: y + 6, z, w: 3.6, h: 0.3, d: 3.6, kind: 'deck' }, { x, y: y + 6.3, z: z - 1.7, w: 3.6, h: 1, d: 0.15, kind: 'wall' }, { x, y: y + 6.3, z: z + 1.7, w: 3.6, h: 1, d: 0.15, kind: 'wall' });
}
const overlaps = (b: Block[], x: number, z: number, pad: number) => b.some((k) => k.kind !== 'roof' && k.kind !== 'deck' && Math.abs(k.x - x) < k.w / 2 + pad && Math.abs(k.z - z) < k.d / 2 + pad);

/** What stands at a place, from its own seed. */
function layout(p: Place, r: () => number): Block[] {
  const out: Block[] = [], { x, y, z } = p;
  const sandbags = (n: number, rad: number) => { for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, along = r() < 0.5; out.push({ x: x + Math.cos(a) * rad, y, z: z + Math.sin(a) * rad, w: along ? 3 : 0.8, h: 0.95, d: along ? 0.8 : 3, kind: 'sandbag' }); } };
  if (p.kind === 'hq') {
    perimeter(x, y, z, 24, [0, 2], out);
    house(x - 12, y, z - 10, 8, 6, 0, out); house(x + 12, y, z - 10, 8, 6, 0, out); house(x, y, z + 12, 10, 7, 2, out);
    tower(x + 19, y, z + 19, out); tower(x - 19, y, z - 19, out);
    for (const [dx, dz] of [[-14, 6], [14, 6]]) out.push({ x: x + dx, y, z: z + dz, w: 6, h: 2.6, d: 2.5, kind: 'container' });
    sandbags(6, 9);
  } else if (p.kind === 'compound') {
    perimeter(x, y, z, 14, [Math.floor(r() * 4)], out);
    house(x - 6, y, z - 4, 7, 6, Math.floor(r() * 4), out); house(x + 6, y, z + 5, 6, 6, Math.floor(r() * 4), out);
    sandbags(3, 9);
  } else if (p.kind === 'camp') {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + r(); out.push({ x: x + Math.cos(a) * 7, y, z: z + Math.sin(a) * 7, w: 3.6, h: 2.2, d: 4.4, kind: 'tent' }); }
    sandbags(6, 12);
  } else if (p.kind === 'tower') {
    tower(x, y, z, out); house(x + 7, y, z - 6, 6, 5, Math.floor(r() * 4), out); sandbags(4, 8);
  } else if (p.kind === 'depot') {
    for (let i = 0; i < 6; i++) out.push({ x: x - 9 + (i % 3) * 9, y, z: z - 5 + Math.floor(i / 3) * 10, w: 6, h: 2.6, d: 2.5, kind: 'container' });
    house(x, y, z + 12, 7, 5, 2, out); sandbags(3, 15);
  }
  return out;
}

/** The whole island for a seed: heights, places and what stands there, crates and their loot,
 *  trees and rocks. */
export function opsMap(seed: number): OpsMap {
  const s = hash(`${seed}:ops`) % 100_000, r = seeded(hash(`${seed}:ops:places`));
  const places: Place[] = [];
  const flat = (x: number, z: number) => Math.max(3, rawHeight(x, z, s));
  const add = (kind: PlaceKind, name: string, x: number, z: number) => {
    const foes = kind === 'lz' ? [] : [...KIND_FOES[kind]];
    places.push({ id: places.length, kind, name, x, z, y: flat(x, z), r: RADIUS[kind], foes, hostage: false, blocks: [] });
  };
  // Four landing zones round the coast, the headquarters near the middle, outposts between.
  const turn = r() * Math.PI * 2;
  for (let i = 0; i < 4; i++) { const a = turn + (i * Math.PI) / 2 + (r() - 0.5) * 0.4; add('lz', LZ_NAMES[i], Math.cos(a) * 168, Math.sin(a) * 168); }
  add('hq', 'Ridgeline HQ', (r() - 0.5) * 40, (r() - 0.5) * 40);
  const names = [...PLACE_NAMES];
  for (let i = 0, tries = 0; i < PLACE_KINDS.length && tries < 600; tries++) {
    const a = r() * Math.PI * 2, d = 60 + r() * 115, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (places.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + RADIUS[PLACE_KINDS[i]] + 38)) continue;
    add(PLACE_KINDS[i], names.splice(Math.floor(r() * names.length), 1)[0], x, z);
    i++;
  }
  // Three of the outposts hold a hostage.
  const outposts = places.filter((p) => p.kind !== 'lz' && p.kind !== 'hq');
  for (let k = 0; k < 3 && outposts.length; k++) outposts.splice(Math.floor(r() * outposts.length), 1)[0].hostage = true;

  // Heights, with each place levelled.
  const row = OPS_CELLS + 1, heights = new Float32Array(row * row);
  for (let iz = 0; iz < row; iz++) for (let ix = 0; ix < row; ix++) {
    const x = ix * OPS_CELL - OPS_SIZE / 2, z = iz * OPS_CELL - OPS_SIZE / 2;
    let h = rawHeight(x, z, s);
    for (const p of places) { const t = smooth(p.r + 16, p.r + 2, Math.hypot(x - p.x, z - p.z)); if (t > 0) h += (p.y - h) * t; }
    heights[iz * row + ix] = h;
  }
  for (const p of places) p.blocks = layout(p, seeded(hash(`${seed}:ops:place:${p.id}`)));

  // Crates: in the places (clear of what stands there), and a few out in the wild.
  const crates: Crate[] = [], cr = seeded(hash(`${seed}:ops:crates`));
  for (const p of places) {
    const tier = p.kind === 'hq' ? 2 : 1;
    for (let i = 0, tries = 0; i < CRATES_AT[p.kind] && tries < 80; tries++) {
      const a = cr() * Math.PI * 2, d = 2 + cr() * (p.r - 4), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (overlaps(p.blocks, x, z, 1.2) || crates.some((c) => Math.hypot(c.x - x, c.z - z) < 3)) continue;
      crates.push({ id: crates.length, place: p.id, x, z, items: Array.from({ length: 2 + (cr() < 0.45 ? 1 : 0) }, () => rollItem(cr, tier)) });
      i++;
    }
  }
  for (let i = 0, tries = 0; i < WILD_CRATES && tries < 400; tries++) {
    const a = cr() * Math.PI * 2, d = 30 + cr() * 170, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (groundAt(heights, x, z) < 1.5 || places.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 22)) continue;
    crates.push({ id: crates.length, place: -1, x, z, items: Array.from({ length: 2 }, () => rollItem(cr, 0)) });
    i++;
  }

  // Trees and rocks on the dry land away from the places (scenery; trunks and rocks are solid).
  const tr = seeded(hash(`${seed}:ops:trees`)), trees: [number, number, number][] = [], rocks: [number, number, number][] = [];
  const clear = (x: number, z: number, pad: number) => !places.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + pad) && !crates.some((c) => Math.hypot(c.x - x, c.z - z) < 3);
  for (let i = 0; i < 2600 && trees.length < 640; i++) {
    const x = (tr() - 0.5) * OPS_EDGE * 2, z = (tr() - 0.5) * OPS_EDGE * 2, h = groundAt(heights, x, z);
    // Forests: thick where a slow noise is high, a few lone trees elsewhere.
    if (h < 1.8 || h > 30 || Math.hypot(x, z) > OPS_EDGE - 6 || (fbm(x * 0.012, z * 0.012, s + 77, 3) < 0.5 && tr() > 0.12) || !clear(x, z, 6)) continue;
    trees.push([x, z, 0.8 + tr() * 0.7]);
  }
  for (let i = 0; i < 600 && rocks.length < 90; i++) {
    const x = (tr() - 0.5) * OPS_EDGE * 2, z = (tr() - 0.5) * OPS_EDGE * 2;
    if (groundAt(heights, x, z) < 0.5 || Math.hypot(x, z) > OPS_EDGE - 4 || !clear(x, z, 4)) continue;
    rocks.push([x, z, 0.6 + tr() * 1.8]);
  }
  return { seed, heights, places, crates, trees, rocks };
}

/** Every soldier the round can have: each outpost's, then the reinforcements. */
export const opsFoeCount = (m: OpsMap) => m.places.reduce((n, p) => n + p.foes.length, 0) + OPS_REINFORCE_MAX;

/** The most a round on this island could ever score (the game's cap must stay above it). */
export function opsCeiling(m: OpsMap, seconds: number) {
  const loot = m.crates.reduce((n, c) => n + c.items.reduce((k, it) => k + (it.kind === 'valuable' ? it.value : 0), 0), 0);
  const foes = m.places.flatMap((p) => p.foes);
  const drops = foes.reduce((n, f) => n + foeDropMax(f), 0) + OPS_REINFORCE_MAX * foeDropMax('rifleman');
  const kills = opsFoeCount(m) * (OPS_KILL + OPS_HEADSHOT);
  const posts = m.places.filter((p) => p.kind !== 'lz').reduce((n, p) => n + (p.kind === 'hq' ? OPS_HQ : OPS_OUTPOST), 0);
  const hostages = m.places.filter((p) => p.hostage).length * OPS_HOSTAGE;
  return loot + drops + kills + posts + hostages + Math.floor(seconds / OPS_EXTRACT_MIN_S) * OPS_EXTRACT;
}

/** A valuable into the backpack: when it's full, the cheapest makes room for a better one. */
export function packAdd(pack: Valuable[], it: Valuable): { pack: Valuable[]; dropped: Valuable | null } {
  if (pack.length < OPS_PACK) return { pack: [...pack, it], dropped: null };
  const low = pack.reduce((m, x, i) => (x.value < pack[m].value ? i : m), 0);
  if (pack[low].value >= it.value) return { pack, dropped: it };
  const next = [...pack];
  const [out] = next.splice(low, 1, it);
  return { pack: next, dropped: out };
}
export const packValue = (pack: { value: number }[]) => pack.reduce((n, x) => n + x.value, 0);

/** Armour soaks damage first (each plate 50); returns what's left of each. */
export function takeHit(hp: number, armour: number, dmg: number) {
  const soak = Math.min(armour, dmg * 0.8);
  return { hp: Math.max(0, hp - (dmg - soak)), armour: armour - soak };
}
