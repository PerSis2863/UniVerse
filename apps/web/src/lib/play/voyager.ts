import { hash, seeded } from '../seeded-shuffle';

// Solar Voyager (M123, the owner: "something else related to space and technologies and shows
// beautiful planets and stars and system around that with realistic graphics"): fly a survey probe
// through our Solar System and survey all eight planets. Distances and sizes are shrunk to fit a
// round (in game units); the facts are real. Pure and seeded, so everyone in a room flies the same
// system. The scene is src/components/play/SolarVoyager.tsx.

/** How a planet is drawn (world/nature.ts planetMaterial). */
export type VoyagerLook = 'rock' | 'venus' | 'earth' | 'desert' | 'giant';

/** A moon drawn round its planet: radius, distance from the planet's centre, colour, seconds a turn. */
export interface VoyagerMoon { name: string; r: number; d: number; tint: number; turn: number }

export interface VoyagerPlanet {
  id: string;
  name: string;
  /** Radius and distance from the Sun, in game units. */
  r: number;
  orbit: number;
  look: VoyagerLook;
  /** Axis tilt (radians) and turns a minute. */
  tilt: number;
  spin: number;
  /** Bands of a giant (two colours), its storm's colour (or none), the glow of its air (or none). */
  bands?: [number, number];
  storm?: number;
  air?: number;
  /** Inner and outer radius of its rings. */
  ring?: [number, number];
  /** Its biggest moons, drawn round it (Earth's Moon, Jupiter's four big ones…). */
  moons: VoyagerMoon[];
  /** One thing that makes it special, and two numbers. */
  fact: string;
  stats: [string, string];
}

export const VOYAGER_PLANETS: readonly VoyagerPlanet[] = [
  { id: 'mercury', name: 'Mercury', r: 2.6, orbit: 70, look: 'rock', tilt: 0.0, spin: 0.2, moons: [],
    fact: 'The smallest planet and the closest to the Sun. With almost no air to hold heat, days reach 430 °C and nights fall to −180 °C.', stats: ['A year: 88 days', 'Moons: none'] },
  { id: 'venus', name: 'Venus', r: 4.4, orbit: 105, look: 'venus', tilt: 3.1, spin: -0.15, air: 0xffd59a, moons: [],
    fact: 'The hottest planet, hotter than Mercury: thick clouds of carbon dioxide trap the heat at about 465 °C. It spins backwards, so the Sun rises in the west.', stats: ['A day: 243 Earth days', 'Moons: none'] },
  { id: 'earth', name: 'Earth', r: 4.6, orbit: 145, look: 'earth', tilt: 0.41, spin: 1, air: 0x60a5fa, moons: [{ name: 'the Moon', r: 1.25, d: 13, tint: 0x9a968f, turn: 40 }],
    fact: 'The only world we know with life. Liquid water covers about 71% of it, and its magnetic field shields us from the solar wind.', stats: ['A year: 365 days', 'Moons: 1'] },
  { id: 'mars', name: 'Mars', r: 3.4, orbit: 185, look: 'desert', tilt: 0.44, spin: 0.95, air: 0xf59e6b, moons: [{ name: 'Phobos', r: 0.45, d: 6.5, tint: 0x6b5a4c, turn: 14 }, { name: 'Deimos', r: 0.32, d: 9.5, tint: 0x7d6c5c, turn: 26 }],
    fact: 'Rusty iron dust makes it red. It has Olympus Mons, the tallest volcano known in the Solar System (about 22 km high), and rovers are exploring it right now.', stats: ['A day: 24 h 37 min', 'Moons: 2'] },
  { id: 'jupiter', name: 'Jupiter', r: 15, orbit: 300, look: 'giant', tilt: 0.05, spin: 2.2, bands: [0xc9a27e, 0xf1e3cc], storm: 0xc0533a, air: 0xe8c9a0,
    moons: [{ name: 'Io', r: 1, d: 24, tint: 0xd9c35a, turn: 22 }, { name: 'Europa', r: 0.9, d: 30, tint: 0xd8cbb4, turn: 32 }, { name: 'Ganymede', r: 1.45, d: 38, tint: 0x8f8679, turn: 46 }, { name: 'Callisto', r: 1.35, d: 48, tint: 0x5e554b, turn: 64 }],
    fact: 'The biggest planet: more than 1,300 Earths would fit inside. The Great Red Spot is a storm wider than Earth that has blown for centuries.', stats: ['A day: under 10 hours', 'Width: 11 Earths'] },
  { id: 'saturn', name: 'Saturn', r: 12.5, orbit: 370, look: 'giant', tilt: 0.47, spin: 2, bands: [0xd8c49a, 0xf4e8c8], air: 0xf2dfb0, ring: [16, 28], moons: [{ name: 'Titan', r: 1.5, d: 40, tint: 0xd49a4c, turn: 58 }],
    fact: 'Its rings are billions of pieces of ice and rock, from specks of dust to chunks as big as houses. Saturn is so light it would float in a big enough bath.', stats: ['A year: 29 Earth years', 'Main rings: 7'] },
  { id: 'uranus', name: 'Uranus', r: 8, orbit: 435, look: 'giant', tilt: 1.71, spin: -1.4, bands: [0x8fd3dc, 0xb9ecf0], air: 0x9be7ef, ring: [10.5, 12], moons: [],
    fact: 'An ice giant that rolls round the Sun on its side, tilted 98°, so each pole gets 42 years of daylight and then 42 years of darkness.', stats: ['A year: 84 Earth years', 'Coldest air: −224 °C'] },
  { id: 'neptune', name: 'Neptune', r: 7.8, orbit: 495, look: 'giant', tilt: 0.49, spin: 1.5, bands: [0x2f5fd0, 0x5b8cf0], storm: 0x172a6b, air: 0x6d9bff, moons: [{ name: 'Triton', r: 0.9, d: 17, tint: 0xc9b9b0, turn: -30 }],
    fact: 'The windiest planet: winds blow at over 2,000 km/h. It was found in 1846 by maths, before anyone had seen it through a telescope.', stats: ['A year: 165 Earth years', 'Sunlight takes 4 hours to arrive'] },
];

export const VOYAGER_SUN_R = 26;
/** The asteroid belt, between Mars and Jupiter. */
export const VOYAGER_BELT: readonly [number, number] = [218, 250];
/** How far the probe may fly from the Sun. */
export const VOYAGER_EDGE = 560;
/** Points: a survey, a speck of stardust, a rock or a planet bumped, each second left once all eight
 *  are surveyed, and flying close by the comet (once). */
export const VOYAGER_SURVEY = 1_000, VOYAGER_DUST = 25, VOYAGER_HIT = 150, VOYAGER_BONUS_S = 15, VOYAGER_COMET = 250;
export const VOYAGER_DUST_N = 90;
/** Seconds spent near a planet to survey it, and how near (from its surface). */
export const VOYAGER_SCAN_S = 1.4;
export const voyagerScanReach = (p: VoyagerPlanet) => p.r * 1.8 + 7;

export interface VoyagerSystem {
  /** Each planet's place (the Sun is at the origin). */
  at: { x: number; y: number; z: number }[];
  dust: { x: number; y: number; z: number }[];
  rocks: { x: number; y: number; z: number; s: number }[];
  /** Where the probe starts: beside Earth, its day and night halves in view and the Sun beyond. */
  start: { x: number; y: number; z: number; yaw: number; pitch: number };
  /** The comet's straight path across the system during the round (it passes the Sun halfway). */
  comet: { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number } };
}

/** Where the comet is a share of the way through the round (0–1). */
export function cometAt(c: VoyagerSystem['comet'], k: number) {
  const t = Math.max(0, Math.min(1, k));
  return { x: c.from.x + (c.to.x - c.from.x) * t, y: c.from.y + (c.to.y - c.from.y) * t, z: c.from.z + (c.to.z - c.from.z) * t };
}

/** The system for a seed: the planets round their orbits (spread so no two line up), stardust along
 *  the way between them, and the belt's rocks (`rocks` of them: fewer on phones). */
export function voyagerSystem(seed: number, rocks = 420): VoyagerSystem {
  const r = seeded(hash(`${seed}:voyager`));
  const base = r() * Math.PI * 2;
  const at = VOYAGER_PLANETS.map((p, i) => {
    const a = base + i * 2.39996 + (r() - 0.5) * 0.5; // the golden angle apart, a little jitter
    return { x: Math.cos(a) * p.orbit, y: (r() - 0.5) * 10, z: Math.sin(a) * p.orbit };
  });
  const dust: VoyagerSystem['dust'] = [];
  for (let i = 0; i < VOYAGER_DUST_N; i++) {
    // Strung between a planet and the next one out, so the trip there collects some.
    const k = i % (VOYAGER_PLANETS.length - 1), t = (Math.floor(i / (VOYAGER_PLANETS.length - 1)) + 0.5 + (r() - 0.5) * 0.6) / Math.ceil(VOYAGER_DUST_N / (VOYAGER_PLANETS.length - 1));
    const a = at[k], b = at[k + 1];
    const d = { x: a.x + (b.x - a.x) * t + (r() - 0.5) * 24, y: a.y + (b.y - a.y) * t + (r() - 0.5) * 12, z: a.z + (b.z - a.z) * t + (r() - 0.5) * 24 };
    // Never inside the Sun's glare: a line between two planets can pass close by it.
    const sd = Math.hypot(d.x, d.y, d.z), near = VOYAGER_SUN_R + 14;
    if (sd < near) { const k2 = near / Math.max(1, sd); d.x *= k2; d.y *= k2; d.z *= k2; }
    dust.push(d);
  }
  // The comet (drawn before the belt, whose size differs by device, so a room shares one): a
  // straight pass comes nearest the Sun (110–170 out) halfway through the round.
  const q = 110 + r() * 60, ca = r() * Math.PI * 2, half = Math.sqrt((VOYAGER_EDGE * 0.92) ** 2 - q * q), lift = (r() - 0.5) * 60;
  const px = Math.cos(ca) * q, pz = Math.sin(ca) * q, dx = -Math.sin(ca), dz = Math.cos(ca);
  const comet = { from: { x: px - dx * half, y: -lift, z: pz - dz * half }, to: { x: px + dx * half, y: lift, z: pz + dz * half } };
  const belt: VoyagerSystem['rocks'] = [];
  for (let i = 0; i < rocks; i++) {
    const a = r() * Math.PI * 2, d = VOYAGER_BELT[0] + r() * (VOYAGER_BELT[1] - VOYAGER_BELT[0]);
    belt.push({ x: Math.cos(a) * d, y: (r() - 0.5) * 14, z: Math.sin(a) * d, s: 0.6 + r() ** 3 * 3.2 });
  }
  // The start: beside Earth (along its orbit, a little outside it), looking between Earth and the Sun.
  const e = at[2], out = Math.hypot(e.x, e.z), ux = e.x / out, uz = e.z / out;
  const s = { x: e.x - uz * 24 + ux * 8, y: e.y + 3, z: e.z + ux * 24 + uz * 8 };
  const unit = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  const [ex, ey, ez] = unit(e.x - s.x, e.y - s.y, e.z - s.z), [sx, sy, sz] = unit(-s.x, -s.y, -s.z);
  const [lx, ly, lz] = unit(ex + sx * 0.75, ey + sy * 0.75, ez + sz * 0.75);
  const start = { ...s, yaw: Math.atan2(-lx, -lz), pitch: Math.asin(ly) };
  return { at, dust, rocks: belt, start, comet };
}

/** The best a round could ever score (the cap the server holds scores to). */
export const voyagerMax = (seconds: number) => VOYAGER_PLANETS.length * VOYAGER_SURVEY + VOYAGER_DUST_N * VOYAGER_DUST + seconds * VOYAGER_BONUS_S + VOYAGER_COMET;
