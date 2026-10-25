import { hash, seeded } from '../seeded-shuffle';

// Ocean Cleanup (UniVerse Play, a Green game): steer a boat through drifting plastic and pick it up,
// but steer round the sea life and the oil. Power-ups drift by: a magnet that pulls plastic in, a
// shield for one bump, a boost (faster, double points). Calm, then choppy, then a storm. Same seed,
// same things drifting in at the same moments for everyone. Quick pick-ups build a combo (up to ×2).

export const SEA = {
  bottle: { emoji: '🧴', label: 'Plastic bottle', pts: 50, kg: 0.03 },
  cup: { emoji: '🥤', label: 'Plastic cup', pts: 40, kg: 0.01 },
  bag: { emoji: '🛍️', label: 'Plastic bag', pts: 60, kg: 0.01 },
  can: { emoji: '🥫', label: 'Can', pts: 40, kg: 0.015 },
  net: { emoji: '🕸️', label: 'Ghost net', pts: 150, kg: 2 },
  turtle: { emoji: '🐢', label: 'Turtle', pts: 0 },
  fish: { emoji: '🐟', label: 'Fish', pts: 0 },
  octopus: { emoji: '🐙', label: 'Octopus', pts: 0 },
  magnet: { emoji: '🧲', label: 'Magnet: pulls plastic in', pts: 0 },
  shield: { emoji: '🛡️', label: 'Shield: one free bump', pts: 0 },
  boost: { emoji: '⚡', label: 'Boost: faster, double points', pts: 0 },
  oil: { emoji: '', label: 'Oil slick: slows the boat', pts: 0 },
} as const;
export type SeaKind = keyof typeof SEA;
export const isLife = (k: SeaKind) => k === 'turtle' || k === 'fish' || k === 'octopus';
export const isPower = (k: SeaKind) => k === 'magnet' || k === 'shield' || k === 'boost';
export const isTrash = (k: SeaKind) => !isLife(k) && !isPower(k) && k !== 'oil';
/** How long the magnet and the boost last (ms). */
export const POWER_MS = 6_000;
/** The magnet's reach (px), the boost's speed-up, how much oil slows the boat. */
export const MAGNET_PX = 170, BOOST_SPEED = 1.35, OIL_SLOW = 0.45;
/** Kilograms of plastic a pick-up takes out of the sea (rough, for the results). */
export const kgOf = (k: SeaKind) => ('kg' in SEA[k] ? (SEA[k] as { kg: number }).kg : 0);
/** The sea's stages: calm, choppy from 35%, a storm from 68% (more sea life, faster). */
export const oceanPhase = (ms: number, seconds: number) => { const p = ms / (seconds * 1000); return p < 0.35 ? 0 : p < 0.68 ? 1 : 2; };
export const OCEAN_PHASES = ['Calm sea', 'Choppy water', 'Storm!'] as const;
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
    const kind = roll < 0.07 ? 'net' : roll < 0.68 - p * 0.06 - (p >= 0.68 ? 0.08 : 0) ? TRASH[Math.floor(rand() * TRASH.length)] : LIFE[Math.floor(rand() * LIFE.length)];
    out.push({ id: id++, at: Math.round(at), x: 0.06 + rand() * 0.88, kind, speed: 0.17 + p * 0.13 + rand() * 0.05, wobble: rand() * Math.PI * 2 });
    at += 720 - p * 360 + rand() * 300;
  }
  // A power-up every ~11 s, oil slicks from the choppy stage on.
  const extra = seeded(hash(`${seed}:ocean-extra`)), POWERS: SeaKind[] = ['magnet', 'boost', 'shield'];
  for (let t = 7_000 + extra() * 3000, n = 0; t < seconds * 1000 - 4000; t += 10_000 + extra() * 3000, n++) out.push({ id: id++, at: Math.round(t), x: 0.12 + extra() * 0.76, kind: POWERS[n % 3], speed: 0.16, wobble: extra() * 6 });
  for (let t = seconds * 350 + extra() * 3000; t < seconds * 1000 - 5000; t += 8_000 + extra() * 4000) out.push({ id: id++, at: Math.round(t), x: 0.15 + extra() * 0.7, kind: 'oil', speed: 0.12, wobble: extra() * 6 });
  return out.sort((a, b) => a.at - b.at);
}

export const OCEAN_HIT = 100;
export const OCEAN_COMBO_MS = 1600;
export const oceanMultiplier = (combo: number) => 1 + Math.min(combo, 10) * 0.1;
