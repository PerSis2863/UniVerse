import { hash, seeded, shuffled } from '../seeded-shuffle';

// Type Race (UniVerse Play, a UniVersity game): type a short true fact exactly, then the next, until
// time runs out. Each right letter scores, each finished fact adds a bonus, a wrong key costs a
// little. Everyone in a room types the same facts in the same order.

export const PASSAGES = [
  'Honeybees can recognise human faces, and a single hive can make more than 100 kilograms of honey in a year.',
  'Light from the Sun takes about eight minutes and twenty seconds to reach the Earth.',
  'The Amazon rainforest makes about a fifth of the oxygen produced by land plants on our planet.',
  'Octopuses have three hearts and blue blood, and each of their eight arms can taste what it touches.',
  'A bolt of lightning is about five times hotter than the surface of the Sun.',
  'Recycling one aluminium can saves enough energy to run a television for about three hours.',
  'The Great Wall of China is not visible to the naked eye from space, despite the popular myth.',
  'Water expands by about nine percent when it freezes, which is why ice floats on top of lakes.',
  'There are more possible games of chess than there are atoms in the observable universe.',
  'Bamboo is the fastest growing plant on Earth; some kinds grow almost a metre in a single day.',
  'The human brain uses about twenty percent of the body’s energy while weighing only two percent of it.',
  'Wind turbines turn moving air into electricity, and one large turbine can power over a thousand homes.',
  'Sharks existed before trees: they have been swimming in the oceans for over 400 million years.',
  'A day on Venus is longer than its year, because the planet spins so slowly on its axis.',
  'Planting trees along city streets can cool the air by several degrees on a hot summer day.',
  'The first computer programmer was Ada Lovelace, who wrote an algorithm for a machine in the 1840s.',
  'Coral reefs cover less than one percent of the ocean floor but are home to a quarter of all sea life.',
  'Your heart beats about one hundred thousand times every day, pumping blood through the whole body.',
  'Glass can take a million years to break down in nature, but it can be recycled again and again.',
  'Sound travels about four times faster in water than in air, which is why whales can talk across oceans.',
  'The word robot comes from a Czech word meaning forced work, first used in a play in 1920.',
  'Food waste in landfill makes methane, a gas that warms the planet much faster than carbon dioxide.',
  'Mount Everest grows by a few millimetres every year as the plates under the Himalayas keep pushing.',
  'A group of flamingos is called a flamboyance, and they are pink because of the food they eat.',
];

export function typingPassage(seed: number, i: number): string {
  const order = shuffled(PASSAGES.map((_, k) => k), `${seed}:type`);
  return PASSAGES[order[i % PASSAGES.length]];
}

export const TYPE_CHAR = 10;
export const TYPE_DONE = 250;
export const TYPE_MISS = 5;
/** Words a minute, counting five letters as a word. */
export const wpm = (chars: number, ms: number) => (ms > 0 ? Math.round((chars / 5) / (ms / 60_000)) : 0);
export const pace = (seed: number) => 30 + Math.floor(seeded(hash(`${seed}:pace`))() * 15);
