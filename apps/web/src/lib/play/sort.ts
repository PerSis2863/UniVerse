import { hash, seeded } from '../seeded-shuffle';

// Recycle Rush (UniVerse Play, the Green game): items ride a belt towards the end; sort the one in
// front into its bin before it falls off. Same seed, same items at the same moments for everyone.
// Streaks raise the multiplier; each right sort adds the CO₂ it saves (rough per-item averages,
// for the game only: Green's real factors stay in src/lib/green.ts).

export const BINS = ['recycle', 'compost', 'landfill', 'ewaste'] as const;
export type Bin = (typeof BINS)[number];
export const BIN_LABEL: Record<Bin, string> = { recycle: 'Recycling', compost: 'Compost', landfill: 'General waste', ewaste: 'E-waste' };
export const BIN_COLOR: Record<Bin, string> = { recycle: '#38bdf8', compost: '#84cc16', landfill: '#9ca3af', ewaste: '#f59e0b' };

/** [name, emoji, bin, kg CO₂ saved when sorted right]. */
export const ITEMS: [string, string, Bin, number][] = [
  ['Plastic bottle', '🧴', 'recycle', 0.08], ['Drinks can', '🥫', 'recycle', 0.15], ['Newspaper', '📰', 'recycle', 0.1], ['Cardboard box', '📦', 'recycle', 0.2],
  ['Glass jar', '🫙', 'recycle', 0.12], ['Milk carton', '🥛', 'recycle', 0.06], ['Paper bag', '🛍️', 'recycle', 0.05], ['Envelope', '✉️', 'recycle', 0.02],
  ['Banana peel', '🍌', 'compost', 0.05], ['Apple core', '🍎', 'compost', 0.04], ['Egg shells', '🥚', 'compost', 0.03], ['Coffee grounds', '☕', 'compost', 0.04],
  ['Leaves', '🍂', 'compost', 0.05], ['Bread crust', '🍞', 'compost', 0.04], ['Tea bag', '🍵', 'compost', 0.02], ['Carrot tops', '🥕', 'compost', 0.03],
  ['Crisp packet', '🍿', 'landfill', 0.01], ['Nappy', '🧷', 'landfill', 0.01], ['Broken mug', '☕', 'landfill', 0.01], ['Chewing gum', '🍬', 'landfill', 0.01],
  ['Toothbrush', '🪥', 'landfill', 0.01], ['Sponge', '🧽', 'landfill', 0.01],
  ['Old phone', '📱', 'ewaste', 0.9], ['Battery', '🔋', 'ewaste', 0.3], ['Headphones', '🎧', 'ewaste', 0.4], ['Laptop', '💻', 'ewaste', 2.5],
  ['Light bulb (LED)', '💡', 'ewaste', 0.2], ['Charger', '🔌', 'ewaste', 0.25], ['Remote control', '🎛️', 'ewaste', 0.3], ['Watch', '⌚', 'ewaste', 0.2],
];

export interface BeltItem { id: number; item: number; at: number; travel: number }

/** Every item of a round: when it appears (ms) and how long it takes to reach the end. */
export function sortSequence(seed: number, seconds: number): BeltItem[] {
  const rand = seeded(hash(`${seed}:sort`));
  const out: BeltItem[] = [];
  let at = 500, id = 0;
  while (at < seconds * 1000 - 1500) {
    const progress = at / (seconds * 1000);
    out.push({ id: id++, item: Math.floor(rand() * ITEMS.length), at: Math.round(at), travel: Math.round(4_800 - progress * 2_400) });
    at += 1_500 - progress * 850 + rand() * 300;
  }
  return out;
}

/** The streak's multiplier: ×1, then ×1.5 at 5 in a row, ×2 at 10… up to ×3. */
export const sortMultiplier = (streak: number) => Math.min(3, 1 + Math.floor(streak / 5) * 0.5);
export const sortPoints = (streak: number) => Math.round(100 * sortMultiplier(streak));
export const SORT_WRONG = 50;
export const SORT_MISSED = 25;
