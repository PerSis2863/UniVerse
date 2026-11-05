import { hash, seeded } from '../seeded-shuffle';

// Fire Line (UniVerse Play M105, a Relief game): a forest valley in a dry summer. Lightning starts
// fires; the wind pushes them. Fly the water bomber over the lake to fill its tank, then drop the
// water on the fire front before it reaches the villages. Same seed, same valley, strikes and wind for
// everyone in a room (what burns after that depends on how each pilot fights it).
// The valley is a grid of cells (x across, y down); a cell is forest, meadow, bare rock, lake or a
// village. Fire moves a tick at a time: each burning cell may light its neighbours, more often
// downwind, less often in meadow, never where it's still wet from a drop.

export const FIRE_COLS = 40, FIRE_ROWS = 24;
/** What a cell is. */
export const ROCK = 0, FOREST = 1, MEADOW = 2, WATER = 3, VILLAGE = 4;
/** A fire tick, how long a cell burns, how long a drop keeps it wet. */
export const FIRE_TICK_MS = 650, BURN_TICKS = 8, WET_TICKS = 30;
/** The tank: drops it holds, how fast the lake fills it, how far a drop reaches (cells). */
export const FIRE_TANK = 3, FIRE_REFILL_MS = 650, FIRE_RADIUS = 2.4;
/** Points: each burning cell put out (once per cell), a village standing at the end, the forest
 *  still green at the end (its share of the start), a village lost. */
export const FIRE_OUT = 30, FIRE_VILLAGE = 2000, FIRE_FOREST = 3000, FIRE_LOST = 400;
/** The eight neighbours, clockwise from east; the wind blows toward one of them. */
export const DIRS: readonly [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
export const WIND_NAMES = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'] as const;

export interface FireMap {
  /** The cells, row by row (FIRE_COLS × FIRE_ROWS). */
  cells: Uint8Array;
  /** Each village's top-left cell (they're 2 × 2). */
  villages: { x: number; y: number; name: string }[];
  lake: { x: number; y: number; rx: number; ry: number };
  /** When and where lightning starts a fire (ms into the round, a cell index). */
  strikes: { at: number; cell: number }[];
  /** The wind: from this moment, toward this direction (an index into DIRS). */
  winds: { at: number; dir: number }[];
}

const NAMES = ['Pinecrest', 'Ashford', 'Willow Bend', 'Highmoor', 'Larkfield', 'Stonebridge'];

/** The valley for a round: a lake, three villages, forest with meadows and rock, the strikes and the wind. */
export function fireMap(seed: number, seconds: number): FireMap {
  const r = seeded(hash(`${seed}:fire`));
  const cells = new Uint8Array(FIRE_COLS * FIRE_ROWS);
  const at = (x: number, y: number) => y * FIRE_COLS + x;
  // Forest everywhere, meadows and bare rock in soft patches.
  const blobs = Array.from({ length: 9 }, () => ({ x: r() * FIRE_COLS, y: r() * FIRE_ROWS, rad: 2 + r() * 4, kind: r() < 0.7 ? MEADOW : ROCK }));
  for (let y = 0; y < FIRE_ROWS; y++) for (let x = 0; x < FIRE_COLS; x++) {
    let k = FOREST;
    for (const b of blobs) if (Math.hypot(x - b.x, (y - b.y) * 1.3) < b.rad) k = b.kind;
    cells[at(x, y)] = k;
  }
  // The lake, on the left or the right, never at the very edge.
  const left = r() < 0.5;
  const lake = { x: left ? 6 + r() * 4 : FIRE_COLS - 10 + r() * 4, y: 6 + r() * (FIRE_ROWS - 12), rx: 3.5 + r() * 1.5, ry: 2.6 + r() * 1.2 };
  for (let y = 0; y < FIRE_ROWS; y++) for (let x = 0; x < FIRE_COLS; x++) if (((x - lake.x) / lake.rx) ** 2 + ((y - lake.y) / lake.ry) ** 2 < 1) cells[at(x, y)] = WATER;
  // Three villages, apart from the lake and each other.
  const names = [...NAMES];
  const villages: FireMap['villages'] = [];
  for (let tries = 0; villages.length < 3 && tries < 400; tries++) {
    const x = 2 + Math.floor(r() * (FIRE_COLS - 5)), y = 2 + Math.floor(r() * (FIRE_ROWS - 5));
    if (Math.hypot(x - lake.x, y - lake.y) < 8 || villages.some((v) => Math.hypot(v.x - x, v.y - y) < 11)) continue;
    villages.push({ x, y, name: names.splice(Math.floor(r() * names.length), 1)[0] });
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cells[at(x + dx, y + dy)] = VILLAGE;
  }
  // Lightning: the first strike soon, then every 9–15 s, always on forest far from the villages.
  const strikes: FireMap['strikes'] = [];
  for (let t = 2500; t < seconds * 1000 - 20_000; t += 9_000 + r() * 6_000 - Math.min(4_000, t / 40)) {
    for (let tries = 0; tries < 60; tries++) {
      const x = Math.floor(r() * FIRE_COLS), y = Math.floor(r() * FIRE_ROWS);
      if (cells[at(x, y)] !== FOREST || villages.some((v) => Math.hypot(v.x - x, v.y - y) < 9)) continue;
      strikes.push({ at: Math.round(t), cell: at(x, y) });
      break;
    }
  }
  // The wind turns a little every 20–30 s.
  const winds: FireMap['winds'] = [{ at: 0, dir: Math.floor(r() * 8) }];
  for (let t = 20_000 + r() * 10_000; t < seconds * 1000; t += 20_000 + r() * 10_000) winds.push({ at: Math.round(t), dir: (winds[winds.length - 1].dir + (r() < 0.5 ? 1 : 7)) % 8 });
  return { cells, villages, lake, strikes, winds };
}

/** The wind's direction at a moment. */
export const windAt = (m: FireMap, ms: number) => { let d = m.winds[0].dir; for (const w of m.winds) if (w.at <= ms) d = w.dir; return d; };

/** How likely a burning cell lights a neighbour this tick: forest catches more than meadow, downwind
 *  much more than upwind; rock, water and wet ground never. */
export function igniteChance(kind: number, dx: number, dy: number, wind: number) {
  if (kind !== FOREST && kind !== MEADOW && kind !== VILLAGE) return 0;
  const [wx, wy] = DIRS[wind], len = Math.hypot(dx, dy) * Math.hypot(wx, wy);
  const along = (dx * wx + dy * wy) / len;
  const base = kind === FOREST ? 0.1 : kind === MEADOW ? 0.05 : 0.08;
  return Math.min(0.85, base * Math.max(0.2, 1 + 1.4 * along) / (dx && dy ? 1.3 : 1));
}

/** One tick of fire: burning cells age (and burn out), and may light their neighbours. `burn` holds
 *  each cell's ticks of fire left (0 none), `wet` each cell's wet ticks; `ash` marks burnt-out cells.
 *  Returns the cells newly alight (so villages can be lost). Pure but for the arrays it's given. */
export function fireTick(cells: Uint8Array, burn: Uint8Array, wet: Uint8Array, ash: Uint8Array, wind: number, rand: () => number): number[] {
  const lit: number[] = [];
  for (let i = 0; i < cells.length; i++) if (wet[i]) wet[i]--;
  for (let i = 0; i < cells.length; i++) {
    if (!burn[i]) continue;
    const x = i % FIRE_COLS, y = Math.floor(i / FIRE_COLS);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= FIRE_COLS || ny >= FIRE_ROWS) continue;
      const j = ny * FIRE_COLS + nx;
      if (burn[j] || ash[j] || wet[j] || lit.includes(j)) continue;
      if (rand() < igniteChance(cells[j], dx, dy, wind)) lit.push(j);
    }
  }
  for (let i = 0; i < cells.length; i++) if (burn[i] && --burn[i] === 0) ash[i] = 1;
  for (const j of lit) burn[j] = BURN_TICKS;
  return lit;
}

/** The cells a drop at (x, y) (in cells, fractions allowed) reaches. */
export function dropCells(x: number, y: number, radius = FIRE_RADIUS): number[] {
  const out: number[] = [];
  for (let cy = Math.floor(y - radius); cy <= Math.ceil(y + radius); cy++) for (let cx = Math.floor(x - radius); cx <= Math.ceil(x + radius); cx++) {
    if (cx < 0 || cy < 0 || cx >= FIRE_COLS || cy >= FIRE_ROWS) continue;
    if (Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= radius) out.push(cy * FIRE_COLS + cx);
  }
  return out;
}

/** The end of the round: villages standing and the share of the forest still green. */
export function fireFinal(standing: number, green: number, startGreen: number) {
  return standing * FIRE_VILLAGE + Math.round(FIRE_FOREST * Math.max(0, Math.min(1, startGreen ? green / startGreen : 0)));
}
