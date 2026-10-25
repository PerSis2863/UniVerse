// What every UniVerse Play game gets from the stage (GameStage.tsx): the round's seed and times on
// the room's clock (clock() is this device's time corrected to the room's), and where to report.
// Sounds, announcements and the shake come from the arena (useArena in arena.tsx).

/** One line of a game's results ("Accuracy · 92%"). */
export interface GameStat { label: string; value: string }

export interface GameProps {
  seed: number;
  startsAt: number;
  endsAt: number;
  clock: () => number;
  /** The score so far and how many steps (questions, sorts…) it took, whenever it changes. */
  onProgress: (score: number, step: number) => void;
  /** The game ended itself early (out of lives, all cities pinned). */
  onDone: (score: number, step: number) => void;
  /** The game's own numbers for the results (accuracy, best streak…), whenever they change. */
  onStats?: (stats: GameStat[]) => void;
  /** The others in the room, as they go (Type Race draws them as cars). */
  rivals?: { id: string; name: string; score: number; step: number }[];
}
