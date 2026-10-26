import { hash, seeded } from '../seeded-shuffle';

// Flood Rescue (UniVerse Play, a Relief game): the water rises over a town; people (and their pets)
// wait on rooftops. Fly the helicopter low over a roof to winch them up (four at a time), then land
// them at the hospital on the hill, where it also refuels. Lightning hits roofs (people there have
// less time) and gusts push the helicopter. Same seed, same town, people and storm for everyone.
// Heights are shares of the screen from the top (0 = top, 1 = bottom).

export const CAPACITY = 4;
export const HELIPAD = { x: 0.88, w: 0.16, top: 0.4 } as const;

export interface Roof { x: number; w: number; top: number }
/** Someone waiting on a roof; some have a pet with them (a bonus when both are saved). */
export interface Stranded { id: number; at: number; roof: number; ttl: number; pet: boolean }

/** The water's surface at a moment of the round: it rises from 0.92 to 0.7. */
export const waterLevel = (ms: number, seconds: number) => 0.92 - 0.22 * Math.min(1, Math.max(0, ms / (seconds * 1000)));

/** Seven houses between the left edge and the hill, some low (they flood late in the round). */
export function rescueTown(seed: number): Roof[] {
  const rand = seeded(hash(`${seed}:town`));
  return Array.from({ length: 7 }, (_, i) => ({ x: 0.03 + i * 0.111 + rand() * 0.02, w: 0.075, top: 0.46 + rand() * 0.27 }));
}

/** Who appears on which roof and when, never on a roof that floods before they could be reached. */
export function rescueSchedule(seed: number, seconds: number, roofs: Roof[]): Stranded[] {
  const rand = seeded(hash(`${seed}:rescue`));
  const out: Stranded[] = [];
  let at = 1200, id = 0;
  while (at < seconds * 1000 - 6000) {
    const p = at / (seconds * 1000);
    const ttl = Math.round(17_000 - p * 5_000 + rand() * 2_000);
    const dry = roofs.map((r, k) => ({ r, k })).filter(({ r }) => r.top < waterLevel(at + ttl, seconds) - 0.03);
    if (dry.length) out.push({ id: id++, at: Math.round(at), roof: dry[Math.floor(rand() * dry.length)].k, ttl, pet: rand() < 0.18 });
    at += 2_500 - p * 1_100 + rand() * 700;
  }
  return out;
}

/** A person landed at the hospital: 100, up to 50 more the less they waited, 50 more with a pet. */
export const rescuePoints = (waited: number, ttl: number, pet = false) => 100 + Math.round(50 * Math.max(0, 1 - waited / ttl)) + (pet ? 50 : 0);
export const RESCUE_LOST = 30;

/** The storm: lightning hits a roof (after a warning) and wind gusts push the helicopter. */
export interface Strike { at: number; roof: number }
export interface Gust { at: number; dir: -1 | 1; dur: number }
export function rescueStorm(seed: number, seconds: number, roofs: Roof[]): { strikes: Strike[]; gusts: Gust[] } {
  const rand = seeded(hash(`${seed}:storm`)), T = seconds * 1000;
  const strikes: Strike[] = [], gusts: Gust[] = [];
  for (let at = 18_000 + rand() * 4000; at < T - 6000; at += 14_000 + rand() * 6000) strikes.push({ at: Math.round(at), roof: Math.floor(rand() * roofs.length) });
  for (let at = 26_000 + rand() * 6000; at < T - 5000; at += 22_000 + rand() * 8000) gusts.push({ at: Math.round(at), dir: rand() < 0.5 ? -1 : 1, dur: 2200 + Math.round(rand() * 1200) });
  return { strikes, gusts };
}
/** A lightning strike takes this share of the waiting time left from everyone on that roof. */
export const STRIKE_TAKES = 0.4;
export const STRIKE_WARN_MS = 1600;
/** A full tank lasts this long in the air; landing on the H fills it up again. */
export const FUEL_SECONDS = 34;
/** Supply crates (M39): three a trip (refilled on the pad); one landing on a roof gives each person
 *  there six more seconds, and a few points. */
export const CRATES = 3, CRATE_MS = 6_000, CRATE_PTS = 15;
