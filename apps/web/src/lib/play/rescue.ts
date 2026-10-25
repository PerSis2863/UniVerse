import { hash, seeded } from '../seeded-shuffle';

// Flood Rescue (UniVerse Play, a Relief game): the water rises over a town; people wait on rooftops.
// Fly the helicopter low over a roof to winch them up (four at a time), then land them at the
// hospital on the hill. Same seed, same town and the same people for everyone. Heights are shares
// of the screen from the top (0 = top, 1 = bottom).

export const CAPACITY = 4;
export const HELIPAD = { x: 0.88, w: 0.16, top: 0.4 } as const;

export interface Roof { x: number; w: number; top: number }
export interface Stranded { id: number; at: number; roof: number; ttl: number }

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
    if (dry.length) out.push({ id: id++, at: Math.round(at), roof: dry[Math.floor(rand() * dry.length)].k, ttl });
    at += 2_500 - p * 1_100 + rand() * 700;
  }
  return out;
}

/** A person landed at the hospital: 100, and up to 50 more the less they waited. */
export const rescuePoints = (waited: number, ttl: number) => 100 + Math.round(50 * Math.max(0, 1 - waited / ttl));
export const RESCUE_LOST = 30;
