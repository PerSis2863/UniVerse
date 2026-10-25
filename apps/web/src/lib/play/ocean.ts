import { hash, seeded } from '../seeded-shuffle';

// Ocean Cleanup (UniVerse Play, a Green game): steer a boat through drifting plastic and pick it up,
// but steer round the sea life. Same seed, same things drifting in at the same moments for everyone.
// Pick-ups in quick succession build a combo (up to ×2).

export const SEA = {
  bottle: { emoji: '🧴', label: 'Plastic bottle', pts: 50 },
  cup: { emoji: '🥤', label: 'Plastic cup', pts: 40 },
  bag: { emoji: '🛍️', label: 'Plastic bag', pts: 60 },
  can: { emoji: '🥫', label: 'Can', pts: 40 },
  net: { emoji: '🕸️', label: 'Ghost net', pts: 150 },
  turtle: { emoji: '🐢', label: 'Turtle', pts: 0 },
  fish: { emoji: '🐟', label: 'Fish', pts: 0 },
  octopus: { emoji: '🐙', label: 'Octopus', pts: 0 },
} as const;
export type SeaKind = keyof typeof SEA;
export const isLife = (k: SeaKind) => k === 'turtle' || k === 'fish' || k === 'octopus';
const TRASH: SeaKind[] = ['bottle', 'cup', 'bag', 'can'];
const LIFE: SeaKind[] = ['turtle', 'fish', 'octopus'];

/** One thing drifting down the screen: x across (0–1), speed in screen heights a second. */
export interface Drift { id: number; at: number; x: number; kind: SeaKind; speed: number; wobble: number }

export function oceanSchedule(seed: number, seconds: number): Drift[] {
  const rand = seeded(hash(`${seed}:ocean`));
  const out: Drift[] = [];
  let at = 400, id = 0;
  while (at < seconds * 1000 - 1500) {
    const p = at / (seconds * 1000);
    const roll = rand();
    const kind = roll < 0.07 ? 'net' : roll < 0.68 - p * 0.06 ? TRASH[Math.floor(rand() * TRASH.length)] : LIFE[Math.floor(rand() * LIFE.length)];
    out.push({ id: id++, at: Math.round(at), x: 0.06 + rand() * 0.88, kind, speed: 0.17 + p * 0.13 + rand() * 0.05, wobble: rand() * Math.PI * 2 });
    at += 720 - p * 360 + rand() * 300;
  }
  return out;
}

export const OCEAN_HIT = 100;
export const OCEAN_COMBO_MS = 1600;
export const oceanMultiplier = (combo: number) => 1 + Math.min(combo, 10) * 0.1;
