import { hash, seeded } from '../seeded-shuffle';

// The 3D worlds of UniVerse Play (M36): the courses, arenas and mazes come from the round's seed,
// so everyone in a room plays the same world. Scores and their caps live here too (the tests prove a
// perfect round stays under each game's maxScore in src/lib/play.ts).

/* ── Skyline Obby: jump across floating pads to the golden finish ── */
export type PadKind = 'pad' | 'move' | 'fall' | 'bounce' | 'spin' | 'check' | 'finish';
export interface Pad { x: number; y: number; z: number; w: number; d: number; kind: PadKind; stage: number; phase: number }
export interface Gem { x: number; y: number; z: number }
export const OBBY_STAGES = 10;
export const OBBY_CHECK = 500, OBBY_GEM = 50, OBBY_FALL = 100, OBBY_FINISH = 2_000, OBBY_PER_SECOND = 20;

export function obbyCourse(seed: number): { pads: Pad[]; gems: Gem[] } {
  const r = seeded(hash(`${seed}:obby`));
  const pads: Pad[] = [{ x: 0, y: 0, z: 0, w: 9, d: 9, kind: 'check', stage: 0, phase: 0 }];
  const gems: Gem[] = [];
  let x = 0, y = 0, z = 0;
  for (let stage = 1; stage <= OBBY_STAGES; stage++) {
    const hard = stage / OBBY_STAGES, n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const roll = r();
      const kind: PadKind = stage > 1 && roll < 0.12 + hard * 0.12 ? 'move' : stage > 2 && roll < 0.3 + hard * 0.1 ? 'fall' : stage > 3 && roll < 0.42 ? 'spin' : stage > 1 && roll < 0.5 ? 'bounce' : 'pad';
      const size = kind === 'spin' ? 5.5 : 3.4 - hard * 1.1 + r() * 0.8;
      const gap = 2.2 + hard * 1.1 + r() * 0.7;
      const prev = pads[pads.length - 1];
      // Up a little (a bounce pad's next stop is high), sideways a little, always reachable.
      const dy = prev.kind === 'bounce' ? 3.2 + r() * 1.2 : -0.6 + r() * 1.6;
      x = Math.max(-14, Math.min(14, x + (r() - 0.5) * 6));
      y = Math.max(-2, y + dy);
      z -= prev.d / 2 + gap + size / 2;
      pads.push({ x, y, z, w: size, d: size, kind, stage, phase: r() * Math.PI * 2 });
      if (r() < 0.45 && kind !== 'spin') gems.push({ x, y: y + 1.4, z });
    }
    const prev = pads[pads.length - 1];
    z -= prev.d / 2 + 2.6 + 3;
    y += -0.4 + r();
    pads.push({ x, y, z, w: stage === OBBY_STAGES ? 10 : 6, d: stage === OBBY_STAGES ? 10 : 6, kind: stage === OBBY_STAGES ? 'finish' : 'check', stage, phase: 0 });
  }
  return { pads, gems };
}

/* ── Neon Strike: laser tag against waves of sentinel drones ── */
export const STRIKE_HIT = 10, STRIKE_TAG = 100, STRIKE_WAVE = 500, STRIKE_DOWN = 300;
export const STRIKE_FIRE_S = 0.16, STRIKE_BOT_HP = 3, STRIKE_COMBO_S = 3, STRIKE_COMBO_MAX = 4;
export const strikeWave = (n: number) => 3 + n * 2;
/** Tags in a row (within 3 s of each other) multiply: ×1, ×2… up to ×4. */
export const strikeMultiplier = (combo: number) => Math.min(STRIKE_COMBO_MAX, 1 + Math.floor(combo / 2));
export interface Cover { x: number; z: number; w: number; d: number; h: number }
export const STRIKE_SIZE = 64;
export function strikeArena(seed: number): Cover[] {
  const r = seeded(hash(`${seed}:strike`)), out: Cover[] = [];
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * (STRIKE_SIZE - 12), z = (r() - 0.5) * (STRIKE_SIZE - 12);
    if (Math.hypot(x, z) < 7) continue; // the spawn stays open
    const tall = r() < 0.3;
    out.push({ x, z, w: 2 + r() * 5, d: 2 + r() * 5, h: tall ? 4 + r() * 3 : 1.4 + r() * 0.8 });
  }
  return out;
}

/* ── Night Shift: a dark school maze, five keys, the thing in the halls ── */
export const NIGHT_N = 13;
export const NIGHT_KEY = 1_000, NIGHT_ESCAPE = 3_000, NIGHT_PER_SECOND = 15, NIGHT_STUN = 150, NIGHT_CAUGHT = 500;
export const NIGHT_KEYS = 5, NIGHT_LIVES = 3, NIGHT_STUN_S = 1.4, NIGHT_STUN_COOLDOWN_S = 7;
/** The maze as open walls: cell (x,y) has `east` / `south` passages; plus where keys and the exit are. */
export function nightMaze(seed: number) {
  const n = NIGHT_N, r = seeded(hash(`${seed}:night`));
  const east = Array.from({ length: n * n }, () => false), south = Array.from({ length: n * n }, () => false), seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const c = stack[stack.length - 1], cx = c % n, cy = Math.floor(c / n);
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dy]) => [cx + dx, cy + dy] as const).filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n && !seen.has(y * n + x));
    if (!next.length) { stack.pop(); continue; }
    const [x, y] = next[Math.floor(r() * next.length)], k = y * n + x;
    if (x > cx) east[c] = true; else if (x < cx) east[k] = true; else if (y > cy) south[c] = true; else south[k] = true;
    seen.add(k); stack.push(k);
  }
  // A few loops, so the thing can't corner you in every hall.
  for (let i = 0; i < n * 2; i++) { const c = Math.floor(r() * n * n); if (c % n < n - 1) east[c] = true; else if (c < n * (n - 1)) south[c] = true; }
  const open = (c: number) => [c % n < n - 1 && east[c], c % n > 0 && east[c - 1], c < n * (n - 1) && south[c], c >= n && south[c - n]].filter(Boolean).length;
  const ends = Array.from({ length: n * n }, (_, c) => c).filter((c) => c > n * 2 && open(c) === 1);
  const keys: number[] = [];
  for (const c of ends.sort(() => r() - 0.5)) { if (keys.length >= NIGHT_KEYS) break; if (keys.every((k) => Math.abs((k % n) - (c % n)) + Math.abs(Math.floor(k / n) - Math.floor(c / n)) > 3)) keys.push(c); }
  while (keys.length < NIGHT_KEYS) keys.push(Math.floor(n * n * (0.3 + r() * 0.69)));
  return { n, east, south, keys, exit: n * n - 1, batteries: Array.from({ length: 6 }, () => Math.floor(r() * n * n)) };
}
/** Neighbouring cells through open walls. */
export function mazeNext(m: { n: number; east: boolean[]; south: boolean[] }, c: number): number[] {
  const { n, east, south } = m, out: number[] = [];
  if (c % n < n - 1 && east[c]) out.push(c + 1);
  if (c % n > 0 && east[c - 1]) out.push(c - 1);
  if (c < n * (n - 1) && south[c]) out.push(c + n);
  if (c >= n && south[c - n]) out.push(c - n);
  return out;
}
/** The first step from one cell toward another (breadth-first), or the cell itself. */
export function mazeStep(m: { n: number; east: boolean[]; south: boolean[] }, from: number, to: number): number {
  if (from === to) return from;
  const prev = new Map<number, number>([[from, from]]), q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (c === to) break;
    for (const x of mazeNext(m, c)) if (!prev.has(x)) { prev.set(x, c); q.push(x); }
  }
  let c = to;
  if (!prev.has(c)) return from;
  while (prev.get(c) !== from) c = prev.get(c)!;
  return c;
}

/* ── Orbit Breach: repair the station's reactors under meteor fire, then reach the escape pod ── */
export const ORBIT_REACTOR = 1_200, ORBIT_TANK = 100, ORBIT_ESCAPE = 3_000, ORBIT_PER_SECOND = 15, ORBIT_HIT = 150;
export const ORBIT_REACTORS = 5, ORBIT_REPAIR_S = 3, ORBIT_TANK_EVERY_S = 8;
export interface Deck { x: number; z: number; y: number; r: number }
export function orbitStation(seed: number) {
  const r = seeded(hash(`${seed}:orbit`));
  const decks: Deck[] = [{ x: 0, z: 0, y: 0, r: 13 }];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4, d = 26 + r() * 6;
    decks.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: -1 + r() * 5, r: 6 + r() * 3 });
  }
  const order = [1, 2, 3, 4, 5, 6].sort(() => r() - 0.5);
  return { decks, reactors: order.slice(0, ORBIT_REACTORS), pod: order[ORBIT_REACTORS] };
}
/** Meteors: when and where (x, z) each lands, warned 1.6 s before. */
export function orbitMeteors(seed: number, seconds: number) {
  const r = seeded(hash(`${seed}:meteors`)), out: { at: number; x: number; z: number }[] = [];
  for (let t = 6; t < seconds; t += 1.1 + r() * 1.6 - Math.min(0.8, t / seconds)) out.push({ at: t, x: (r() - 0.5) * 70, z: (r() - 0.5) * 70 });
  return out;
}
