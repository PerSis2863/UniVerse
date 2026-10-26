import { hash, seeded } from '../../seeded-shuffle';
import { rollContainer, soldierLoot, type ContainerKind, type Item, type Role } from './items';

// Ridgeline Ops' island (the owner: "6 distinct named POIs: Pine Hollow Outpost, Radar Dome Summit,
// Harbor Cargo Docks, Abandoned Airfield, Hydroelectric Dam, and Bunker 07… electrical towers, ruined
// concrete buildings, sandbag bunkers, watchtowers, smoking vehicle wrecks… roads… buy stations… SAM
// sites"): an 800 m island shaped from seeded noise, the places levelled into it (a hill for the
// radar, a lake behind the dam, a runway, a harbour on the shore), roads between them, power lines,
// what stands at each place (solid blocks), its containers and their loot, its soldiers and what
// they carry, vehicles, buy stations, and the round's events. The same seed builds the same island
// in every browser (integer hashing, seeded numbers), so a room shares it.

export const MAP_SIZE = 800, MAP_CELLS = 200, MAP_CELL = MAP_SIZE / MAP_CELLS;
/** How far out you can go (boats a little further). */
export const MAP_EDGE = 372;
export const SEA = 0;
/** Soldiers the round can send beyond the places' own (squads at the landing zone, trucks, helicopters). */
export const REINFORCEMENTS = 48;

export type PoiId = 'pine' | 'radar' | 'harbor' | 'airfield' | 'dam' | 'bunker' | 'village';
export type PlaceKind = PoiId | 'lz' | 'sam' | 'ruin' | 'wreck';
export interface Block {
  x: number; y: number; z: number; w: number; h: number; d: number;
  /** Turned about y (radians), for the look only; collisions use the box as is (turn 0 or π/2). */
  kind: 'concrete' | 'ruin' | 'wood' | 'roof' | 'metal' | 'sandbag' | 'container' | 'tower' | 'deck' | 'tent' | 'dome' | 'tank' | 'crane' | 'wall' | 'fence' | 'rock' | 'earth' | 'glass';
  color?: number;
}
export interface Spot { x: number; y: number; z: number }
export interface Container { id: number; kind: ContainerKind; place: number; x: number; y: number; z: number; turn: number; items: Item[]; key?: string }
export interface FoeSpawn { id: number; role: Role; place: number; x: number; y: number; z: number; perch: boolean; loot: Item[] }
export interface Place {
  id: number; kind: PlaceKind; name: string; x: number; z: number; y: number; r: number;
  /** Which way it faces (radians): the runway's line, the dam's lake, the pier's direction. */
  dir: number;
  tier: number; hostage: boolean; blocks: Block[];
  /** Where its hostage is held, if it has one. */
  held?: Spot;
}
export interface Vehicle { id: number; kind: 'ltv' | 'bike' | 'boat'; x: number; z: number; turn: number }
export interface Kiosk { id: number; x: number; y: number; z: number; turn: number }
export interface Road { pts: [number, number][] }
export interface Pylon { x: number; y: number; z: number; turn: number }
export interface OpsMap {
  seed: number; heights: Float32Array; roadDist: Float32Array;
  places: Place[]; containers: Container[]; foes: FoeSpawn[]; vehicles: Vehicle[]; kiosks: Kiosk[]; roads: Road[]; pylons: Pylon[];
  trees: [number, number, number][]; bushes: [number, number, number][]; rocks: [number, number, number][];
  /** The reservoir behind the dam: its centre, radius and water level. */
  lake: { x: number; z: number; r: number; y: number };
  /** Supply drops: when (s into the round), where, and what's inside. */
  drops: { at: number; x: number; z: number; items: Item[] }[];
  /** An armoured convoy along a road loop, starting at `at` s. */
  convoy: { at: number; road: [number, number][]; foes: FoeSpawn[] };
  /** Reinforcements, in the order they're sent (where they arrive is decided in play): roles and kit. */
  reserves: FoeSpawn[];
}

const POIS: { id: PoiId; name: string; tier: number; r: number; dist: number }[] = [
  { id: 'pine', name: 'Pine Hollow Outpost', tier: 1, r: 34, dist: 170 },
  { id: 'radar', name: 'Radar Dome Summit', tier: 2, r: 32, dist: 135 },
  { id: 'harbor', name: 'Harbor Cargo Docks', tier: 2, r: 44, dist: 0 },
  { id: 'airfield', name: 'Abandoned Airfield', tier: 2, r: 46, dist: 190 },
  { id: 'dam', name: 'Hydroelectric Dam', tier: 2, r: 36, dist: 205 },
  { id: 'bunker', name: 'Bunker 07', tier: 3, r: 28, dist: 235 },
];
export const POI_NAMES: Record<PoiId, string> = { ...Object.fromEntries(POIS.map((p) => [p.id, p.name])) as Record<Exclude<PoiId, 'village'>, string>, village: 'Ridgeline Village' };
const LZ_NAMES = ['LZ Alpha', 'LZ Bravo', 'LZ Charlie', 'LZ Delta'];

/* ── Noise (integer hashing: the same everywhere) ── */
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
export function fbm(x: number, z: number, s: number, oct = 5) {
  let sum = 0, amp = 0.5, f = 1, tot = 0;
  for (let o = 0; o < oct; o++) { sum += noise(x * f, z * f, s + o * 31) * amp; tot += amp; amp *= 0.5; f *= 2; }
  return sum / tot;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rawHeight(x: number, z: number, s: number) {
  const d = Math.hypot(x, z) / (MAP_SIZE / 2);
  // A wobbly coast (noise on the radius), hills and ridges inland.
  const coast = 0.8 + (fbm(Math.atan2(z, x) * 1.6 + 9, 3, s + 5, 3) - 0.5) * 0.22;
  const land = 1 - smooth(coast - 0.1, coast + 0.08, d);
  const hills = fbm(x * 0.006 + 7, z * 0.006 - 3, s);
  const ridge = 1 - Math.abs(2 * fbm(x * 0.004 - 11, z * 0.004 + 5, s + 9, 4) - 1);
  const h = 3 + hills * 22 + ridge * ridge * 24;
  return h * land - 9 * (1 - land);
}

/** The ground's height anywhere, matching the drawn terrain (two triangles per grid square). */
export function groundAt(heights: Float32Array, x: number, z: number) {
  const n = MAP_CELLS, gx = Math.max(0, Math.min(n - 1e-6, (x + MAP_SIZE / 2) / MAP_CELL)), gz = Math.max(0, Math.min(n - 1e-6, (z + MAP_SIZE / 2) / MAP_CELL));
  const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, row = n + 1;
  const h00 = heights[iz * row + ix], h10 = heights[iz * row + ix + 1], h01 = heights[(iz + 1) * row + ix], h11 = heights[(iz + 1) * row + ix + 1];
  return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}
/** How far a point is from the nearest road (the grid stores it per vertex). */
export function roadAt(m: Pick<OpsMap, 'roadDist'>, x: number, z: number) {
  const row = MAP_CELLS + 1, ix = Math.round((x + MAP_SIZE / 2) / MAP_CELL), iz = Math.round((z + MAP_SIZE / 2) / MAP_CELL);
  return m.roadDist[Math.max(0, Math.min(row - 1, iz)) * row + Math.max(0, Math.min(row - 1, ix))];
}

/* ── Building kits (blocks with y at their base) ── */
type Kit = Block[];
const rot = (dx: number, dz: number, a: number): [number, number] => [dx * Math.cos(a) - dz * Math.sin(a), dx * Math.sin(a) + dz * Math.cos(a)];
/** A building with a doorway in the wall facing `face` (0 +z, 1 +x, 2 −z, 3 −x), walls, a roof, maybe a second floor. */
function building(out: Kit, x: number, y: number, z: number, w: number, d: number, face: number, kind: Block['kind'] = 'concrete', h = 3.4, roof = true, window = true) {
  const t = 0.3, door = 1.6;
  const walls: Block[] = [
    { x, y, z: z - d / 2, w, h, d: t, kind }, { x, y, z: z + d / 2, w, h, d: t, kind },
    { x: x - w / 2, y, z, w: t, h, d, kind }, { x: x + w / 2, y, z, w: t, h, d, kind },
  ];
  const cut = (i: number, gap: number, low: number, high: number) => {
    const wall = walls[i], along = i < 2 ? 'w' : 'd', len = wall[along], half = (len - gap) / 2;
    const a = { ...wall, [along]: half }, b = { ...wall, [along]: half };
    if (along === 'w') { a.x = wall.x - gap / 2 - half / 2; b.x = wall.x + gap / 2 + half / 2; } else { a.z = wall.z - gap / 2 - half / 2; b.z = wall.z + gap / 2 + half / 2; }
    const parts: Block[] = [a, b];
    if (low > 0) parts.push({ ...wall, [along]: gap, h: low });
    if (high < wall.h) parts.push({ ...wall, [along]: gap, y: wall.y + high, h: wall.h - high });
    return parts;
  };
  const doorWall = [1, 3, 0, 2][face], windowWall = [0, 2, 1, 3][face];
  const parts: Block[] = [];
  walls.forEach((wl, i) => {
    if (i === doorWall) parts.push(...cut(i, door, 0, 2.3));
    else if (window && i === windowWall && (i < 2 ? w : d) > 4) parts.push(...cut(i, 1.4, 1.05, 2.1)); // a window to vault through
    else parts.push(wl);
  });
  out.push(...parts);
  if (roof) out.push({ x, y: y + h, z, w: w + 0.5, h: 0.25, d: d + 0.5, kind: kind === 'wood' ? 'wood' : 'roof' });
}
/** A ruined building: broken walls of different heights, no roof. */
function ruin(out: Kit, x: number, y: number, z: number, w: number, d: number, r: () => number) {
  const t = 0.35;
  const sides: Block[] = [
    { x, y, z: z - d / 2, w, h: 1, d: t, kind: 'ruin' }, { x, y, z: z + d / 2, w, h: 1, d: t, kind: 'ruin' },
    { x: x - w / 2, y, z, w: t, h: 1, d, kind: 'ruin' }, { x: x + w / 2, y, z, w: t, h: 1, d, kind: 'ruin' },
  ];
  for (const s of sides) {
    const along = s.w > s.d ? 'w' : 'd', len = s[along], n = 2 + Math.floor(r() * 2), seg = len / n;
    for (let i = 0; i < n; i++) {
      if (r() < 0.25) continue; // a hole
      const h = 0.8 + r() * 2.6, off = -len / 2 + seg * (i + 0.5);
      out.push(along === 'w' ? { ...s, x: s.x + off, w: seg * 0.92, h } : { ...s, z: s.z + off, d: seg * 0.92, h });
    }
  }
}
function watchtower(out: Kit, x: number, y: number, z: number, h = 6) {
  for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) out.push({ x: x + dx, y, z: z + dz, w: 0.28, h, d: 0.28, kind: 'tower' });
  out.push({ x, y: y + h, z, w: 3.6, h: 0.25, d: 3.6, kind: 'deck' });
  for (const [dx, dz, w, d] of [[0, -1.7, 3.6, 0.12], [0, 1.7, 3.6, 0.12], [-1.7, 0, 0.12, 3.6], [1.7, 0, 0.12, 3.6]]) out.push({ x: x + dx, y: y + h + 0.25, z: z + dz, w, h: 1, d, kind: 'wood' });
  out.push({ x, y: y + h + 2.4, z, w: 4, h: 0.15, d: 4, kind: 'roof' });
}
function sandbags(out: Kit, x: number, y: number, z: number, a: number, len = 3.2) {
  const [dx, dz] = rot(len / 2, 0, a);
  const along = Math.abs(dx) > Math.abs(dz);
  out.push({ x, y, z, w: along ? len : 0.8, h: 1.05, d: along ? 0.8 : len, kind: 'sandbag' });
}
function fenceRing(out: Kit, x: number, y: number, z: number, s: number, gates: number[], kind: Block['kind'] = 'fence', h = 1.6) {
  for (let side = 0; side < 4; side++) {
    const horiz = side % 2 === 0, cx = horiz ? x : x + (side === 1 ? s : -s), cz = horiz ? z + (side === 0 ? s : -s) : z;
    const segs: [number, number][] = gates.includes(side) ? [[-s, -3], [3, s]] : [[-s, s]];
    for (const [a, b] of segs) {
      const len = b - a, mid = (a + b) / 2;
      out.push(horiz ? { x: cx + mid, y, z: cz, w: len, h, d: 0.25, kind } : { x: cx, y, z: cz + mid, w: 0.25, h, d: len, kind });
    }
  }
}

/** The places' buildings, containers' spots and soldiers' spots, by kind. */
interface Layout { blocks: Kit; spots: { kind: ContainerKind; at: Spot; turn: number }[]; posts: { role: Role; at: Spot; perch?: boolean }[]; hostage?: Spot }
function layout(p: Place, r: () => number): Layout {
  const L: Layout = { blocks: [], spots: [], posts: [] }, { x, y, z } = p, b = L.blocks;
  const at = (dx: number, dz: number, dy = 0): Spot => { const [rx, rz] = rot(dx, dz, p.dir); return { x: x + rx, y: y + dy, z: z + rz }; };
  const spot = (kind: ContainerKind, dx: number, dz: number, dy = 0) => L.spots.push({ kind, at: at(dx, dz, dy), turn: p.dir + r() * 0.6 });
  const post = (role: Role, dx: number, dz: number, dy = 0, perch = false) => L.posts.push({ role, at: at(dx, dz, dy), perch });
  // Rotated buildings: only quarter turns keep the solid boxes exact, so places face in quarter turns.
  const q = Math.round(p.dir / (Math.PI / 2)) & 3, P = (dx: number, dz: number) => at(dx, dz);
  const bld = (dx: number, dz: number, w: number, d: number, face: number, kind: Block['kind'] = 'concrete', h = 3.4) => { const c = P(dx, dz); building(b, c.x, y, c.z, q % 2 ? d : w, q % 2 ? w : d, (face + q) & 3, kind, h); };
  switch (p.kind) {
    case 'pine': {
      fenceRing(b, x, y, z, 26, [0, 2], 'wood', 1.4);
      bld(-12, -9, 7, 6, 0, 'wood', 3); bld(12, -9, 7, 6, 0, 'wood', 3); bld(-12, 10, 6, 6, 2, 'wood', 3); bld(11, 10, 8, 6, 2, 'wood', 3);
      const t1 = P(-20, 20), t2 = P(20, -20); watchtower(b, t1.x, y, t1.z); watchtower(b, t2.x, y, t2.z);
      for (const [dx, dz, a] of [[0, 8, 0], [-4, -2, 1.57], [5, 2, 1.57]]) { const c = P(dx, dz); sandbags(b, c.x, y, c.z, a); }
      spot('weapons', -12, -9); spot('weapons', 11, 10); spot('medical', 12, -9); spot('duffel', -12, 10); spot('duffel', 0, -18);
      post('sniper', -20, 20, 6.25, true); post('sniper', 20, -20, 6.25, true);
      for (const [dx, dz] of [[0, 4], [-6, 0], [6, -3], [-3, 15], [8, 16], [-16, -2]]) post('rifleman', dx, dz);
      post('medic', 2, -4); post('officer', 11, 10);
      L.hostage = P(-12, 10);
      break;
    }
    case 'radar': {
      fenceRing(b, x, y, z, 28, [0], 'fence', 2.2);
      for (const dx of [-11, 11]) { const c = P(dx, -8); b.push({ x: c.x, y, z: c.z, w: 2.4, h: 4, d: 2.4, kind: 'tower' }, { x: c.x, y: y + 4, z: c.z, w: 8, h: 7, d: 8, kind: 'dome' }); }
      bld(0, 10, 12, 8, 2, 'concrete', 3.6);
      const m = P(18, 14); b.push({ x: m.x, y, z: m.z, w: 0.6, h: 22, d: 0.6, kind: 'tower' });
      for (const [dx, dz] of [[-18, 12], [-6, -18]]) { const c = P(dx, dz); b.push({ x: c.x, y, z: c.z, w: 3, h: 2.2, d: 2, kind: 'metal' }); }
      for (const [dx, dz, a] of [[0, 0, 0], [-10, 4, 0], [10, 4, 0]]) { const c = P(dx, dz); sandbags(b, c.x, y, c.z, a); }
      spot('weapons', -3, 10); spot('weapons', -18, -12); spot('register', 4, 12); spot('duffel', 18, -6); spot('duffel', -20, 4);
      L.spots.push({ kind: 'safe', at: P(4, 8), turn: p.dir });
      post('sniper', 0, 10, 3.85, true); post('breacher', 2, 6); post('officer', -2, 12);
      for (const [dx, dz] of [[0, -4], [-14, 0], [14, 0], [-8, -14], [8, -14], [0, 20], [-20, 20]]) post('rifleman', dx, dz);
      L.hostage = P(-4, 12);
      break;
    }
    case 'harbor': {
      // The quay along the shore, a pier out to sea, containers stacked two high, two cranes, a warehouse.
      const quay = P(0, 22); b.push({ x: quay.x, y: -4, z: quay.z, w: q % 2 ? 10 : 80, h: y + 4, d: q % 2 ? 80 : 10, kind: 'concrete' });
      for (let i = 0; i < 3; i++) { const c = P(-6, 32 + i * 10); b.push({ x: c.x, y: -4, z: c.z, w: q % 2 ? 10 : 6, h: y + 4, d: q % 2 ? 6 : 10, kind: 'concrete' }); }
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
        const c = P(-24 + i * 8, -14 + row * 9), two = (row + i) % 3 !== 0;
        b.push({ x: c.x, y, z: c.z, w: q % 2 ? 2.5 : 6, h: 2.6, d: q % 2 ? 6 : 2.5, kind: 'container', color: (row * 4 + i) % 4 });
        if (two) b.push({ x: c.x, y: y + 2.6, z: c.z, w: q % 2 ? 2.5 : 6, h: 2.6, d: q % 2 ? 6 : 2.5, kind: 'container', color: (row * 4 + i + 2) % 4 });
      }
      for (const dx of [-14, 14]) {
        const c = P(dx, 16);
        for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) b.push({ x: c.x + ox, y, z: c.z + oz, w: 0.5, h: 16, d: 0.5, kind: 'crane' });
        b.push({ x: c.x, y: y + 16, z: c.z, w: q % 2 ? 7 : 7, h: 1.2, d: 7, kind: 'crane' });
        const jib = P(dx, 26); b.push({ x: jib.x, y: y + 16.2, z: jib.z, w: q % 2 ? 22 : 1.2, h: 1, d: q % 2 ? 1.2 : 22, kind: 'crane' });
      }
      bld(22, -10, 14, 12, 3, 'metal', 6);
      spot('duffel', -20, -5); spot('duffel', 4, -5); spot('duffel', 22, -14); spot('weapons', 22, -6); spot('weapons', -28, 6); spot('register', 18, -14);
      post('sniper', -14, 16, 17.2, true); post('breacher', 20, -10); post('breacher', -4, 4); post('medic', 6, 0);
      for (const [dx, dz] of [[-20, 0], [-10, -18], [0, 10], [10, 14], [-26, 14], [26, 6], [14, -20], [-30, -10]]) post('rifleman', dx, dz);
      L.hostage = P(24, -14);
      break;
    }
    case 'airfield': {
      // The runway runs along `dir` (painted as road); hangars, a control tower, a wrecked plane, fuel tanks.
      bld(-16, -26, 18, 14, 0, 'metal', 7); bld(10, -26, 18, 14, 0, 'metal', 7);
      const t = P(30, -18); building(b, t.x, y, t.z, 6, 6, (2 + q) & 3, 'concrete', 3.4); b.push({ x: t.x, y: y + 3.4, z: t.z, w: 4.4, h: 4, d: 4.4, kind: 'concrete' }, { x: t.x, y: y + 7.4, z: t.z, w: 7, h: 0.3, d: 7, kind: 'deck' }, { x: t.x, y: y + 7.7, z: t.z, w: 5.4, h: 2, d: 5.4, kind: 'glass' }, { x: t.x, y: y + 9.7, z: t.z, w: 6.4, h: 0.3, d: 6.4, kind: 'roof' });
      for (const dx of [-34, -28]) { const c = P(dx, -14); b.push({ x: c.x, y, z: c.z, w: 5, h: 5, d: 5, kind: 'tank' }); }
      const plane = P(-4, 14); b.push({ x: plane.x, y, z: plane.z, w: q % 2 ? 4 : 18, h: 3.6, d: q % 2 ? 18 : 4, kind: 'metal', color: 1 });
      for (const [dx, dz, a] of [[-6, -10, 0], [24, -6, 1.57], [-24, 6, 0]]) { const c = P(dx, dz); sandbags(b, c.x, y, c.z, a); }
      spot('weapons', -16, -26); spot('weapons', 10, -30); spot('weapons', 30, -18); spot('medical', 14, -22); spot('duffel', -4, 18); spot('duffel', -30, -10);
      post('sniper', 30, -18, 7.7, true); post('sniper', -16, -26, 7.25, true); post('breacher', 8, -24); post('medic', -14, -22); post('officer', 30, -16);
      for (const [dx, dz] of [[0, -14], [-20, -12], [20, -12], [-30, 0], [32, 2], [6, 8], [-12, 10], [16, 20]]) post('rifleman', dx, dz);
      L.hostage = P(10, -28);
      break;
    }
    case 'dam': {
      // The dam wall between this place and the lake (toward `dir`), a turbine hall, a control room, a transformer yard.
      const wall = P(0, 18); b.push({ x: wall.x, y: y - 2, z: wall.z, w: q % 2 ? 6 : 84, h: 14, d: q % 2 ? 84 : 6, kind: 'concrete' });
      bld(-12, 2, 18, 10, 2, 'concrete', 6); bld(14, -8, 8, 7, 3, 'concrete', 3.4);
      fenceRing(b, P(-14, -18).x, y, P(-14, -18).z, 8, [1], 'fence', 2.2);
      for (const [dx, dz] of [[-17, -20], [-11, -16]]) { const c = P(dx, dz); b.push({ x: c.x, y, z: c.z, w: 2.4, h: 3, d: 2, kind: 'metal' }); }
      for (const [dx, dz, a] of [[2, -6, 0], [-2, -16, 1.57]]) { const c = P(dx, dz); sandbags(b, c.x, y, c.z, a); }
      spot('weapons', -16, 2); spot('weapons', 0, -20); spot('medical', -6, 4); spot('register', 14, -10);
      L.spots.push({ kind: 'safe', at: P(16, -6), turn: p.dir });
      post('sniper', 0, 18, 12.1, true); post('breacher', 12, -8); post('breacher', -10, 0); post('medic', 4, -2); post('officer', 15, -7);
      for (const [dx, dz] of [[-24, 8], [-20, -4], [8, 6], [24, 0], [20, -18], [-6, -24], [6, -28], [-28, -14]]) post('rifleman', dx, dz);
      L.hostage = P(-16, 0);
      break;
    }
    case 'bunker': {
      // Thick concrete walls with an earth roof, an entrance trench, two rooms inside and a blast door.
      const c = P(0, 0), W = q % 2 ? 14 : 22, D = q % 2 ? 22 : 14;
      building(b, c.x, y, c.z, W, D, q & 3, 'concrete', 3.6, false, false);
      b.push({ x: c.x, y: y + 3.6, z: c.z, w: W + 6, h: 1.6, d: D + 6, kind: 'earth' });
      const inner = P(0, -2); b.push(q % 2 ? { x: inner.x, y, z: inner.z, w: 0.6, h: 3.6, d: 7, kind: 'concrete' } : { x: inner.x, y, z: inner.z, w: 7, h: 3.6, d: 0.6, kind: 'concrete' });
      for (const [dx, dz, a] of [[-5, 10, 0], [5, 10, 0], [-9, 14, 1.57], [9, 14, 1.57]]) { const s = P(dx, dz); sandbags(b, s.x, y, s.z, a); }
      const t1 = P(-16, 14); watchtower(b, t1.x, y, t1.z, 5);
      spot('weapons', -6, -4); spot('weapons', 6, -4); spot('duffel', 4, 4); spot('medical', -8, 3);
      L.spots.push({ kind: 'safe', at: P(0, -5), turn: p.dir });
      post('boss', 0, -4); post('juggernaut', -4, 2); post('juggernaut', 6, 12); post('medic', 2, 3); post('sniper', -16, 14, 5.25, true);
      for (const [dx, dz] of [[-6, 14], [6, 16], [0, 20], [-12, 6]]) post('rifleman', dx, dz);
      break;
    }
    case 'village': {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + r() * 0.3, d = 12 + r() * 14, c = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d };
        if (i % 3 === 0) building(b, c.x, y, c.z, 6 + r() * 3, 6 + r() * 2, Math.floor(r() * 4), 'concrete', 3.2);
        else ruin(b, c.x, y, c.z, 6 + r() * 4, 6 + r() * 3, r);
        if (i < 2) L.spots.push({ kind: 'register', at: { x: c.x, y, z: c.z }, turn: a });
        else if (i < 4) L.spots.push({ kind: 'duffel', at: { x: c.x, y, z: c.z }, turn: a });
        else if (i === 4) L.spots.push({ kind: 'medical', at: { x: c.x, y, z: c.z }, turn: a });
      }
      for (const [dx, dz] of [[0, 6], [-18, -4], [16, -10]]) post('rifleman', dx, dz);
      break;
    }
    case 'sam': {
      const c = P(0, 0); b.push({ x: c.x, y, z: c.z, w: 4, h: 1.2, d: 4, kind: 'metal' }, { x: c.x, y: y + 1.2, z: c.z, w: 2.6, h: 1.6, d: 4.4, kind: 'metal', color: 2 });
      const tr = P(7, -3); b.push({ x: tr.x, y, z: tr.z, w: q % 2 ? 5.5 : 2.4, h: 2.6, d: q % 2 ? 2.4 : 5.5, kind: 'metal', color: 1 });
      for (let i = 0; i < 4; i++) { const s = P(Math.cos(i * 1.57) * 8, Math.sin(i * 1.57) * 8); sandbags(b, s.x, y, s.z, i * 1.57 + 1.57); }
      spot('weapons', -4, 4);
      for (const [dx, dz] of [[4, 6], [-6, -4], [8, 4]]) post('rifleman', dx, dz);
      break;
    }
    case 'ruin': {
      ruin(b, x, y, z, 6 + r() * 4, 5 + r() * 3, r);
      spot('duffel', 0, 0);
      break;
    }
    case 'wreck': {
      const c = P(0, 0); b.push({ x: c.x, y, z: c.z, w: q % 2 ? 2.2 : 4.6, h: 1.5, d: q % 2 ? 4.6 : 2.2, kind: 'metal', color: 3 });
      break;
    }
    case 'lz':
      break;
  }
  return L;
}

/** The whole island for a seed. */
export function opsMap(seed: number): OpsMap {
  const s = hash(`${seed}:ridgeline`) % 100_000, r = seeded(hash(`${seed}:ridgeline:places`));
  const places: Place[] = [];
  const add = (kind: PlaceKind, name: string, x: number, z: number, rad: number, tier: number, dir: number) => {
    const p: Place = { id: places.length, kind, name, x, z, y: Math.max(3, rawHeight(x, z, s)), r: rad, dir, tier, hostage: false, blocks: [] };
    places.push(p);
    return p;
  };
  // The six places round the island in their own sixths, in a seeded order; the village in the middle.
  const turn = r() * Math.PI * 2, order = [...POIS];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const angleOf: Partial<Record<PoiId, number>> = {};
  order.forEach((poi, i) => {
    const a = turn + (i * Math.PI) / 3 + (r() - 0.5) * 0.25;
    angleOf[poi.id] = a;
    let d = poi.dist;
    // The harbour sits where the land meets the sea along its angle.
    if (poi.id === 'harbor') { d = 360; while (d > 150 && rawHeight(Math.cos(a) * d, Math.sin(a) * d, s) < 2) d -= 4; d -= 30; }
    // Each faces a quarter turn, its local +z outward (to the sea, the dam's lake); the runway (local x) along the island.
    const out = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
    add(poi.id, poi.name, Math.cos(a) * d, Math.sin(a) * d, poi.r, poi.tier, poi.id === 'airfield' ? out + Math.PI / 2 : out - Math.PI / 2);
  });
  const village = add('village', POI_NAMES.village, (r() - 0.5) * 30, (r() - 0.5) * 30, 34, 0, 0);
  // Four landing zones on the coast between places (not by the harbour), two SAM sites inland.
  const lzAngles = [0.5, 1.5, 3.5, 4.5].map((k) => turn + (k * Math.PI) / 3);
  lzAngles.forEach((a, i) => add('lz', LZ_NAMES[i], Math.cos(a) * 262, Math.sin(a) * 262, 14, 0, 0));
  for (const k of [2.5, 5.5]) { const a = turn + (k * Math.PI) / 3; add('sam', `SAM Site ${k < 3 ? 'North' : 'South'}`, Math.cos(a) * 140, Math.sin(a) * 140, 14, 1, Math.round(a / (Math.PI / 2)) * (Math.PI / 2) - Math.PI / 2); }
  // Ruins and wrecks scattered where there's room.
  for (let i = 0, tries = 0; i < 8 && tries < 400; tries++) {
    const a = r() * Math.PI * 2, d = 60 + r() * 220, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (rawHeight(x, z, s) < 3 || places.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 30)) continue;
    add('ruin', 'Ruins', x, z, 8, 0, 0); i++;
  }
  // Three outposts hold a hostage.
  const holders = places.filter((p) => ['pine', 'radar', 'harbor', 'airfield', 'dam'].includes(p.kind));
  for (let k = 0; k < 3; k++) holders.splice(Math.floor(r() * holders.length), 1)[0].hostage = true;

  // The lake: behind the dam, held in by a raised rim; its level above the dam's foot.
  const dam = places.find((p) => p.kind === 'dam')!;
  const [ldx, ldz] = rot(0, 66, dam.dir), lake = { x: dam.x + ldx, z: dam.z + ldz, r: 46, y: dam.y + 7 };
  // Raise the radar's hill.
  const radar = places.find((p) => p.kind === 'radar')!;
  radar.y = Math.max(radar.y, rawHeight(radar.x, radar.z, s) + 22);

  // Roads: spokes from the village to each place, a ring between neighbours, landing zones and SAM sites to the nearest.
  const majors = order.map((poi) => places.find((p) => p.kind === poi.id)!);
  const roads: Road[] = [];
  const road = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const rr = seeded(hash(`${seed}:road:${Math.round(a.x)}:${Math.round(b.x)}`));
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len;
    const c1 = { x: a.x + dx / 3 + nx * (rr() - 0.5) * 30, z: a.z + dz / 3 + nz * (rr() - 0.5) * 30 }, c2 = { x: a.x + (2 * dx) / 3 + nx * (rr() - 0.5) * 30, z: a.z + (2 * dz) / 3 + nz * (rr() - 0.5) * 30 };
    // Keep off the lake: push any control point inside it out to its edge.
    for (const c of [c1, c2]) { const ld = Math.hypot(c.x - lake.x, c.z - lake.z); if (ld < lake.r + 22) { c.x = lake.x + ((c.x - lake.x) / ld) * (lake.r + 22); c.z = lake.z + ((c.z - lake.z) / ld) * (lake.r + 22); } }
    const pts: [number, number][] = [];
    const ctrl = [a, a, c1, c2, b, b];
    for (let k = 1; k < ctrl.length - 2; k++) {
      const p0 = ctrl[k - 1], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[k + 2], segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z), n = Math.max(2, Math.ceil(segLen / 3));
      for (let i = 0; i < n; i++) {
        const t = i / n, t2 = t * t, t3 = t2 * t;
        const f = (v0: number, v1: number, v2: number, v3: number) => 0.5 * (2 * v1 + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
        pts.push([f(p0.x, p1.x, p2.x, p3.x), f(p0.z, p1.z, p2.z, p3.z)]);
      }
    }
    pts.push([b.x, b.z]);
    roads.push({ pts });
  };
  majors.forEach((p, i) => { road(village, p); road(p, majors[(i + 1) % majors.length]); });
  for (const p of places.filter((x) => x.kind === 'lz' || x.kind === 'sam')) {
    const nearest = [...majors, village].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    road(p, nearest);
  }

  // Heights: noise, then the places levelled (the runway as a long strip), the radar's hill, the lake's basin and rim.
  const row = MAP_CELLS + 1, N = row * row, heights = new Float32Array(N), roadDist = new Float32Array(N).fill(999);
  const air = places.find((p) => p.kind === 'airfield')!, ax = Math.cos(air.dir), az = Math.sin(air.dir), harbor0 = places.find((p) => p.kind === 'harbor')!;
  let heightsCut = false;
  for (let iz = 0; iz < row; iz++) for (let ix = 0; ix < row; ix++) {
    const x = ix * MAP_CELL - MAP_SIZE / 2, z = iz * MAP_CELL - MAP_SIZE / 2;
    let h = rawHeight(x, z, s);
    // The radar's hill (a smooth dome up to the summit).
    const dr = Math.hypot(x - radar.x, z - radar.z);
    h = Math.max(h, radar.y - Math.pow(Math.max(0, dr - radar.r) / 70, 1.6) * 22);
    // The lake: a basin below the water, a rim above it all round.
    const dl = Math.hypot(x - lake.x, z - lake.z);
    if (dl < lake.r + 34) {
      const rim = lake.y + 3;
      if (dl < lake.r) h = Math.min(h, lake.y - 4 - (1 - dl / lake.r) * 3);
      else { const k = smooth(lake.r + 34, lake.r + 6, dl); h = Math.max(h, h + (rim - h) * k); }
    }
    // The harbour: deep water right off the quay (local z beyond 27 m, within 60 m either side).
    { const ux = x - harbor0.x, uz = z - harbor0.z, lx = ux * Math.cos(harbor0.dir) + uz * Math.sin(harbor0.dir), lz = -ux * Math.sin(harbor0.dir) + uz * Math.cos(harbor0.dir);
      if (lz > 27 && Math.abs(lx) < 60 && lz < 120) { heightsCut = true; } else heightsCut = false; }
    for (const p of places) {
      if (p.kind === 'airfield') {
        // The runway: a 300 × 70 m strip along the place's direction.
        const ux = x - p.x, uz = z - p.z, along = ux * ax + uz * az, across = Math.abs(-ux * az + uz * ax);
        const dd = Math.hypot(Math.max(0, Math.abs(along) - 150), Math.max(0, across - 40));
        const t = smooth(26, 0, dd);
        if (t > 0) h += (p.y - h) * t;
        continue;
      }
      const t = smooth(p.r + 18, p.r + 2, Math.hypot(x - p.x, z - p.z));
      if (t > 0) h += (p.y - h) * t;
    }
    if (heightsCut) h = Math.min(h, -4);
    heights[iz * row + ix] = h;
  }
  // Roads: distance from each vertex to the nearest road point (bucketed), and the ground eased under them.
  // Each road point keeps the average height of its neighbours along the road, so the road runs smooth.
  const B = 16, buckets = new Map<number, [number, number, number][]>();
  for (const rd of roads) {
    const hs = rd.pts.map(([px, pz]) => groundAt(heights, px, pz));
    rd.pts.forEach(([px, pz], i) => {
      let sum = 0, n = 0;
      for (let k = Math.max(0, i - 4); k <= Math.min(hs.length - 1, i + 4); k++) { sum += hs[k]; n++; }
      const k = Math.floor(px / B) * 4096 + Math.floor(pz / B), list = buckets.get(k) ?? [];
      list.push([px, pz, sum / n]);
      buckets.set(k, list);
    });
  }
  for (let iz = 0; iz < row; iz++) for (let ix = 0; ix < row; ix++) {
    const x = ix * MAP_CELL - MAP_SIZE / 2, z = iz * MAP_CELL - MAP_SIZE / 2, bx = Math.floor(x / B), bz = Math.floor(z / B);
    let best = 999, bh = 0;
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) for (const [px, pz, ph] of buckets.get((bx + ox) * 4096 + bz + oz) ?? []) {
      const d = Math.hypot(px - x, pz - z);
      if (d < best) { best = d; bh = ph; }
    }
    const i = iz * row + ix;
    roadDist[i] = best;
    if (best < 10 && bh > 0.5) { const t = smooth(10, 3.5, best); heights[i] += (bh - heights[i]) * t * 0.85; }
  }
  // The runway is painted like a road.
  for (let iz = 0; iz < row; iz++) for (let ix = 0; ix < row; ix++) {
    const x = ix * MAP_CELL - MAP_SIZE / 2, z = iz * MAP_CELL - MAP_SIZE / 2, ux = x - air.x, uz = z - air.z;
    const along = ux * ax + uz * az, across = Math.abs(-ux * az + uz * ax);
    if (Math.abs(along) < 140 && across < 12) roadDist[iz * row + ix] = Math.min(roadDist[iz * row + ix], across * 0.18);
  }

  // What stands at each place, its containers and soldiers.
  const containers: Container[] = [], foes: FoeSpawn[] = [];
  const KEYS: Partial<Record<PlaceKind, { key: string; name: string; opens: PlaceKind }>> = {
    pine: { key: 'radar', name: 'Radar office key', opens: 'radar' },
    airfield: { key: 'dam', name: 'Dam control room key', opens: 'dam' },
    dam: { key: 'bunker', name: 'Bunker 07 vault key', opens: 'bunker' },
  };
  for (const p of places) {
    const lr = seeded(hash(`${seed}:ridgeline:place:${p.id}`)), L = layout(p, lr);
    p.blocks = L.blocks;
    if (p.hostage && L.hostage) p.held = L.hostage;
    for (const sp of L.spots) {
      const id = containers.length, cr = seeded(hash(`${seed}:ridgeline:box:${id}`));
      const keyFor = sp.kind === 'safe' ? (Object.values(KEYS).find((k) => k!.opens === p.kind)?.key ?? 'safe') : undefined;
      containers.push({ id, kind: sp.kind, place: p.id, x: sp.at.x, y: Math.max(sp.at.y, groundAt(heights, sp.at.x, sp.at.z)), z: sp.at.z, turn: sp.turn, items: rollContainer(sp.kind, p.tier, cr), key: keyFor });
    }
    for (const fp of L.posts) {
      const id = foes.length, fr = seeded(hash(`${seed}:ridgeline:foe:${id}`));
      const loot = soldierLoot(fp.role, fr), k = KEYS[p.kind];
      if (fp.role === 'officer' && k) loot.push({ kind: 'key', key: k.key, name: k.name });
      foes.push({ id, role: fp.role, place: p.id, x: fp.at.x, y: fp.perch ? fp.at.y : groundAt(heights, fp.at.x, fp.at.z), z: fp.at.z, perch: !!fp.perch, loot });
    }
  }

  // Buy stations: the village, the airfield, the harbour and two landing zones.
  const kiosks: Kiosk[] = [];
  for (const kind of ['village', 'airfield', 'harbor'] as PlaceKind[]) { const p = places.find((x) => x.kind === kind)!; const [dx, dz] = rot(p.r - 6, -p.r * 0.4, p.dir); kiosks.push({ id: kiosks.length, x: p.x + dx, y: groundAt(heights, p.x + dx, p.z + dz), z: p.z + dz, turn: p.dir }); }
  for (const p of places.filter((x) => x.kind === 'lz').slice(0, 2)) kiosks.push({ id: kiosks.length, x: p.x + 9, y: groundAt(heights, p.x + 9, p.z), z: p.z, turn: 0 });

  // Vehicles: trucks at the airfield and village, bikes at the landing zones, boats at the harbour.
  const vehicles: Vehicle[] = [];
  const veh = (kind: Vehicle['kind'], x: number, z: number, t: number) => vehicles.push({ id: vehicles.length, kind, x, z, turn: t });
  { const [dx, dz] = rot(-22, 14, air.dir); veh('ltv', air.x + dx, air.z + dz, air.dir); const [ex, ez] = rot(-26, 14, air.dir); veh('ltv', air.x + ex, air.z + ez, air.dir); }
  veh('ltv', village.x + 20, village.z - 18, 0.6);
  for (const p of places.filter((x) => x.kind === 'lz')) veh('bike', p.x - 7, p.z + 5, r() * 6);
  const harbor = places.find((p) => p.kind === 'harbor')!;
  for (const k of [0, 1]) { const [dx, dz] = rot(10 + k * 6, 46, harbor.dir); veh('boat', harbor.x + dx, harbor.z + dz, harbor.dir); }

  // Power lines: pylons every 55 m from the dam to the radar and on to the airfield.
  const pylons: Pylon[] = [];
  for (const [a, b] of [[dam, radar], [radar, air]] as const) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.floor(len / 55), t = Math.atan2(b.z - a.z, b.x - a.x);
    for (let i = 1; i < n; i++) { const x = a.x + ((b.x - a.x) * i) / n + Math.sin(t) * 14, z = a.z + ((b.z - a.z) * i) / n - Math.cos(t) * 14; pylons.push({ x, y: groundAt(heights, x, z), z, turn: t }); }
  }

  // Scenery: forests (thicker round Pine Hollow), bushes to hide in, rocks; never on roads or places.
  const tr = seeded(hash(`${seed}:ridgeline:trees`)), trees: [number, number, number][] = [], bushes: [number, number, number][] = [], rocks: [number, number, number][] = [];
  const pine = places.find((p) => p.kind === 'pine')!;
  const clear = (x: number, z: number, pad: number) => !places.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + pad) && Math.hypot(x - lake.x, z - lake.z) > lake.r + 4;
  const slopeAt = (x: number, z: number) => Math.hypot(groundAt(heights, x + 2, z) - groundAt(heights, x - 2, z), groundAt(heights, x, z + 2) - groundAt(heights, x, z - 2)) / 4;
  for (let i = 0; i < 9000 && trees.length < 1500; i++) {
    const x = (tr() - 0.5) * MAP_EDGE * 2, z = (tr() - 0.5) * MAP_EDGE * 2, h = groundAt(heights, x, z);
    const forest = fbm(x * 0.008, z * 0.008, s + 77, 3) + (Math.hypot(x - pine.x, z - pine.z) < 110 ? 0.2 : 0);
    if (h < 2 || h > 60 || slopeAt(x, z) > 0.75 || (forest < 0.52 && tr() > 0.08) || roadAt({ roadDist }, x, z) < 7 || !clear(x, z, 8)) continue;
    trees.push([x, z, 0.8 + tr() * 0.8]);
  }
  for (let i = 0; i < 6000 && bushes.length < 900; i++) {
    const x = (tr() - 0.5) * MAP_EDGE * 2, z = (tr() - 0.5) * MAP_EDGE * 2;
    if (groundAt(heights, x, z) < 1.5 || slopeAt(x, z) > 0.7 || roadAt({ roadDist }, x, z) < 5 || !clear(x, z, 3)) continue;
    bushes.push([x, z, 0.7 + tr() * 0.8]);
  }
  for (let i = 0; i < 2000 && rocks.length < 220; i++) {
    const x = (tr() - 0.5) * MAP_EDGE * 2, z = (tr() - 0.5) * MAP_EDGE * 2;
    if (groundAt(heights, x, z) < 0.5 || roadAt({ roadDist }, x, z) < 5 || !clear(x, z, 4)) continue;
    rocks.push([x, z, 0.6 + tr() * (slopeAt(x, z) > 0.5 ? 3 : 1.6)]);
  }

  // Events: two supply drops, and a convoy on the village–place loop.
  const er = seeded(hash(`${seed}:ridgeline:events`)), drops: OpsMap['drops'] = [];
  for (const at of [200, 520]) {
    for (let tries = 0; tries < 80; tries++) {
      const a = er() * Math.PI * 2, d = 40 + er() * 200, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (groundAt(heights, x, z) < 2 || !clear(x, z, 10) || slopeAt(x, z) > 0.4) continue;
      drops.push({ at, x, z, items: rollContainer('supply', 3, er) });
      break;
    }
  }
  const loop = roads[1].pts, convoyFoes: FoeSpawn[] = [];
  for (let i = 0; i < 6; i++) { const id = 5000 + i, fr = seeded(hash(`${seed}:ridgeline:convoy:${i}`)), role: Role = i === 0 ? 'officer' : i === 5 ? 'breacher' : 'rifleman'; convoyFoes.push({ id, role, place: -2, x: 0, y: 0, z: 0, perch: false, loot: soldierLoot(role, fr) }); }

  const reserves: FoeSpawn[] = Array.from({ length: REINFORCEMENTS }, (_, i) => {
    const role: Role = i % 16 === 15 ? 'juggernaut' : i % 6 === 5 ? 'breacher' : i % 7 === 6 ? 'medic' : 'rifleman';
    return { id: 6000 + i, role, place: -3, x: 0, y: 0, z: 0, perch: false, loot: soldierLoot(role, seeded(hash(`${seed}:ridgeline:reserve:${i}`))) };
  });
  return { seed, heights, roadDist, places, containers, foes, vehicles, kiosks, roads, pylons, trees, bushes, rocks, lake, drops, convoy: { at: 330, road: loop, foes: convoyFoes }, reserves };
}
