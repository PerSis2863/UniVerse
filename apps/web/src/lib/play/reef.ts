import { hash, seeded } from '../seeded-shuffle';

// Reef Rescue (UniVerse Play M105, a Green 3D world): dive a coral reef that's in trouble. Carry coral
// from the nursery to the white, bleached patches and plant it; cut turtles free from ghost nets; pick
// up the plastic; keep clear of the jellyfish; come up for air. Same seed, same reef for everyone in a
// room. Positions in metres: x and z across the reef, y up from the sea floor (0) to the surface.

export const REEF_HALF = 46, REEF_SURFACE = 17;
export const REEF_SPOTS = 8, REEF_NETS = 4, REEF_LITTER = 22, REEF_JELLIES = 7;
/** Points: coral planted, a turtle freed, a piece of plastic, everything done, each second left then, a sting. */
export const REEF_PLANT = 600, REEF_TURTLE = 1000, REEF_PIECE = 80, REEF_ALL = 2000, REEF_PER_SECOND = 10, REEF_STING = 150;
/** A full breath of air lasts this long (s); holding E to cut a net takes this long (s). */
export const REEF_AIR_S = 80, REEF_CUT_S = 1.6;
/** How near you must be: to plant, to cut, to pick up plastic, to be stung. */
export const REEF_REACH = 2.6, REEF_GRAB = 1.6, REEF_STING_R = 1.4;

export type Litter = 'bottle' | 'can' | 'bag';
export interface ReefLayout {
  nursery: { x: number; z: number };
  spots: { x: number; z: number }[];
  nets: { x: number; z: number; turn: number }[];
  litter: { x: number; y: number; z: number; kind: Litter; turn: number }[];
  jellies: { x: number; y: number; z: number; drift: number; phase: number }[];
  rocks: { x: number; z: number; r: number; h: number }[];
  /** Living coral for the look of the reef: a kind, a size, a colour. */
  corals: { x: number; z: number; kind: 'branch' | 'brain' | 'fan' | 'tube'; size: number; hue: number }[];
}

/** The sea floor's height (gentle dunes), the same here and on the graphics chip. */
export const reefFloor = (x: number, z: number) => Math.sin(x * 0.11) * 0.6 + Math.cos(z * 0.09 + x * 0.04) * 0.7 + Math.sin((x + z) * 0.05) * 0.5;

/** The reef for a round. */
export function reefLayout(seed: number): ReefLayout {
  const r = seeded(hash(`${seed}:reef`));
  const placed: { x: number; z: number; r: number }[] = [{ x: 0, z: 30, r: 7 }];
  const free = (rad: number, from = 0, to = REEF_HALF - 4) => {
    for (let k = 0; k < 300; k++) {
      const a = r() * Math.PI * 2, d = from + r() * (to - from), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + rad)) { placed.push({ x, z, r: rad }); return { x, z }; }
    }
    return { x: (r() - 0.5) * REEF_HALF, z: (r() - 0.5) * REEF_HALF };
  };
  const nursery = { x: 0, z: 22 };
  placed.push({ x: nursery.x, z: nursery.z, r: 4 });
  const spots = Array.from({ length: REEF_SPOTS }, () => free(4, 8));
  const nets = Array.from({ length: REEF_NETS }, () => ({ ...free(5, 14), turn: r() * Math.PI * 2 }));
  const rocks = Array.from({ length: 16 }, () => ({ ...free(3, 6), r: 1.6 + r() * 2.8, h: 1 + r() * 3 }));
  const corals = Array.from({ length: 70 }, () => { const p = free(0.8, 4); return { ...p, kind: (['branch', 'brain', 'fan', 'tube'] as const)[Math.floor(r() * 4)], size: 0.6 + r() * 1.1, hue: Math.floor(r() * 6) }; });
  const litter = Array.from({ length: REEF_LITTER }, () => { const p = free(1, 4); return { ...p, y: r() < 0.3 ? 2 + r() * 8 : 0.2, kind: (['bottle', 'can', 'bag'] as const)[Math.floor(r() * 3)], turn: r() * Math.PI * 2 }; });
  const jellies = Array.from({ length: REEF_JELLIES }, () => { const p = free(2, 10); return { ...p, y: 3 + r() * 9, drift: 0.4 + r() * 0.6, phase: r() * Math.PI * 2 }; });
  return { nursery, spots, nets, litter, jellies, rocks, corals };
}

/** Where a jellyfish is at a moment (it drifts up and down, and round a little). */
export function jellyAt(j: ReefLayout['jellies'][number], t: number) {
  return { x: j.x + Math.sin(t * 0.13 * j.drift + j.phase) * 2.5, y: j.y + Math.sin(t * 0.4 * j.drift + j.phase) * 2.2, z: j.z + Math.cos(t * 0.11 * j.drift + j.phase) * 2.5 };
}

/** The best a round can score: everything done with every second left. */
export const reefBest = (seconds: number) => REEF_SPOTS * REEF_PLANT + REEF_NETS * REEF_TURTLE + REEF_LITTER * REEF_PIECE + REEF_ALL + seconds * REEF_PER_SECOND;
