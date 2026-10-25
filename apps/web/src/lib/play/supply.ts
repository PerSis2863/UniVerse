import { hash, seeded } from '../seeded-shuffle';

// Supply Run (UniVerse Play, the Relief game): needs pop up across a town's districts, each asking
// for one kind of supply for some people before its time runs out. Same seed, same needs at the same
// moments for everyone. Bigger, more urgent needs met quickly score more (supplyPoints).

export const SUPPLY_KINDS = ['food', 'water', 'medical', 'shelter'] as const;
export type SupplyKind = (typeof SUPPLY_KINDS)[number];

export const SUPPLY_LABEL: Record<SupplyKind, string> = { food: 'Food', water: 'Water', medical: 'Medicine', shelter: 'Shelter' };

/** The town: 4 rows of 6 districts; the depot is in the middle. */
export const GRID = { cols: 6, rows: 4 } as const;
export const DEPOT = { x: 2.5, y: 1.5 } as const;
export const DISTRICTS = ['Harbour', 'Old Market', 'Mill Lane', 'North Hill', 'Riverside', 'Station', 'Clock Square', 'Ward 12', 'Orchard', 'Bridge End', 'Schoolside', 'Fairground',
  'East Gate', 'Chapel Row', 'Depot Road', 'Kiln Street', 'Meadows', 'Quarry', 'Westbank', 'Tannery', 'Lighthouse', 'Sunset Park', 'Camp', 'Pine Woods'] as const;

export interface Need { id: number; at: number; x: number; y: number; kind: SupplyKind; people: number; ttl: number }

/** Every need of a round, by when it appears (ms from the start). Never two at once in one district. */
export function supplySchedule(seed: number, seconds: number): Need[] {
  const rand = seeded(hash(`${seed}:supply`));
  const out: Need[] = [];
  let at = 600, id = 0;
  const busyUntil = new Map<string, number>();
  while (at < seconds * 1000 - 2500) {
    const progress = at / (seconds * 1000);
    let x = 0, y = 0, tries = 0;
    do {
      x = Math.floor(rand() * GRID.cols); y = Math.floor(rand() * GRID.rows); tries++;
    } while (((busyUntil.get(`${x},${y}`) ?? 0) > at || (x === 2 && y === 1) || (x === 3 && y === 2)) && tries < 30);
    const ttl = Math.round(14_000 - progress * 5_500 + rand() * 2_000);
    out.push({ id: id++, at: Math.round(at), x, y, kind: SUPPLY_KINDS[Math.floor(rand() * 4)], people: 1 + Math.floor(rand() * 6), ttl });
    busyUntil.set(`${x},${y}`, at + ttl + 400);
    at += 2_300 - progress * 1_300 + rand() * 600; // faster as the round goes on
  }
  return out;
}

/** Points for a delivery: 40 a person, up to half again for speed. A wrong supply costs 30, a missed need 20. */
export function supplyPoints(people: number, msLeft: number, ttl: number): number {
  return Math.round(people * 40 * (1 + 0.5 * Math.max(0, Math.min(1, msLeft / ttl))));
}
export const SUPPLY_WRONG = 30;
export const SUPPLY_MISSED = 20;
