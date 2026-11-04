import { hash, seeded } from '../seeded-shuffle';
import { NIGHT_FLOORS, mazeNext, nightKeys, type nightMaze } from './worlds';

// Night Shift's story (M99, the owner: "a proper story… survival horror gameplay"). Our own story:
// Ashgrove Academy, a boarding school shut for the winter. The old boiler room, sealed after a fire
// in 1974, was opened again this term to save on heating, and something came up the pipes with the
// heat. The staff call it the Quiet: it can't see, it hunts by sound and it can't stand light. You
// are the new night caretaker. Three floors down to the service tunnel, keys named for the rooms
// they open, notes left by the people who were here before you, a keypad code, a safe room on each
// floor, flares, and Shades (the smoke that drinks your torch) below the ground floor. Everything
// is decided by the round's seed, so everyone in a room plays the same night.

export const NIGHT_FLOOR_NAMES = ['The classrooms', 'The library and labs', 'The boiler room'] as const;
export const NIGHT_KEY_NAMES: readonly (readonly string[])[] = [
  ['Staff room key', 'Art room key', 'Gym key'],
  ['Library key', 'Chemistry lab key', 'Archive key', 'Music room key'],
  ['Boiler key', 'Fuse room key', 'Pump room key', 'Furnace key', 'Tunnel key'],
];
/** The floor whose stairs also need the code from the bursar's memo. */
export const NIGHT_CODE_FLOOR = 1;
/** Shades on each floor (none on the ground floor). */
export const NIGHT_SHADES = [0, 3, 5] as const;
export const NIGHT_NOTE = 250, NIGHT_SHADE = 100, NIGHT_CODE = 500, NIGHT_TRUTH = 1_000;
/** A flare burns this long; the Quiet won't come within NIGHT_FLARE_M of one, and Shades near it burn. */
export const NIGHT_FLARE_S = 18, NIGHT_FLARE_M = 4.5, NIGHT_START_FLARES = 1;

export interface NightNote { title: string; body: string }

/** The stairwell code for this round: four digits, never starting with 0. */
export function nightCode(seed: number): string {
  const r = seeded(hash(`${seed}:night:code`));
  return String(1 + Math.floor(r() * 9)) + Array.from({ length: 3 }, () => Math.floor(r() * 10)).join('');
}

/** Two notes on each floor; the library's second holds the code. */
export function nightNotes(code: string): NightNote[][] {
  return [
    [
      { title: 'Handover, pinned to the staff room door', body: 'Welcome to nights at Ashgrove. Three rules. Keep your torch charged. Keep to the halls with lights. If the humming starts, get into a locker and hold still until it stops. The last caretaker didn’t finish his shift. Don’t ask the bursar about it. — M. Doyle, days' },
      { title: 'A pupil’s note, folded very small', body: 'Everyone in Year 10 knows: the Quiet only walks when the heating is on. It can’t see you. It listens. It hates the prefects’ torches, it backs off from them. And whatever you do, don’t run in the corridors. Seriously. Don’t run.' },
    ],
    [
      { title: 'A returns slip in “A History of Ashgrove”', body: 'Overdue since 1974. In pencil, in the margin of chapter nine: the fire started in the boiler room the night they sealed it. Six of the night staff were down there. The book says nobody came out. The book is wrong. Something did.' },
      { title: 'Memo from the bursar’s office', body: `Stairwell B down to the basement is on a keypad from tonight. Night staff only, the code is ${code.split('').join(' ')}. Do NOT give it to pupils. The boiler must run all winter. The savings are worth a few complaints about noise in the pipes.` },
    ],
    [
      { title: 'A burnt page from the boiler log, 1974', body: 'It won’t light. When we knock on the pipes, something knocks back. Mr Hale went up to the furnace with a lamp and it backed away from him, so now we know it fears the light. We are keeping the lamps lit. We are running low on oil.' },
      { title: 'Chalk on the furnace door', body: 'If you are reading this, the boiler is running again and it is awake. Pull the main switch by the tunnel and it sleeps. The service tunnel comes out in the yard by the old chapel. Don’t look back down the stairs. Whatever you hear, don’t look back.' },
    ],
  ];
}

/** The ending, by how much of the story you found. */
export function nightEnding(notesRead: number, notesTotal: number): { title: string; body: string } {
  return notesRead >= notesTotal
    ? { title: 'The whole truth', body: 'You pulled the boiler’s main switch on your way into the tunnel. The humming stopped. By morning the pipes were cold, and for the first time in fifty years the halls of Ashgrove were only halls.' }
    : { title: 'Out into the snow', body: 'You climbed out of the service tunnel into the yard as the sky went grey. Behind you, the boiler still roared. Somewhere under the school, something was listening for the next night shift.' };
}

export interface NightLayout { notes: number[]; safe: number; flares: number[]; shades: number[] }

/** Where this floor's notes, safe room, flares and Shades are. Nothing shares a cell with the start,
 *  the stairs, a key or anything else; notes and the safe room prefer dead ends (rooms off a hall). */
export function nightLayout(seed: number, floor: number, m: ReturnType<typeof nightMaze>): NightLayout {
  const { n } = m, r = seeded(hash(`${seed}:night:layout:${floor}`));
  const used = new Set<number>([0, 1, n, m.exit, ...m.keys]);
  const far = (c: number, d: number) => (c % n) + Math.floor(c / n) >= d;
  const take = (pool: number[], k: number, min: number) => {
    const out: number[] = [];
    for (const c of pool) { if (out.length >= k) break; if (!used.has(c) && far(c, min)) { out.push(c); used.add(c); } }
    while (out.length < k) { const c = Math.floor(r() * n * n); if (!used.has(c) && far(c, min)) { out.push(c); used.add(c); } }
    return out;
  };
  const ends = shuffle(Array.from({ length: n * n }, (_, c) => c).filter((c) => mazeNext(m, c).length === 1), r);
  const all = shuffle(Array.from({ length: n * n }, (_, c) => c), r);
  const safe = take(ends, 1, 4)[0];
  const notes = take(ends, 2, 3);
  const flares = take(all, 2, 2);
  const shades = take(all, NIGHT_SHADES[floor] ?? 0, 6);
  return { notes, safe, flares, shades };
}

/** The best round's extra points from the story: every note, every Shade, the code, the truth. */
export const NIGHT_STORY_MAX = NIGHT_FLOORS * 2 * NIGHT_NOTE + NIGHT_SHADES.reduce((a, b) => a + b, 0) * NIGHT_SHADE + NIGHT_CODE + NIGHT_TRUTH;

/** Every key in the night, for the HUD's key list. */
export const nightKeyName = (floor: number, i: number) => NIGHT_KEY_NAMES[floor]?.[i] ?? `Key ${i + 1} of ${nightKeys(floor)}`;

function shuffle<T>(xs: T[], r: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs;
}
