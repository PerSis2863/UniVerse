// What every UniVerse Play game gets from the stage (GameStage.tsx): the round's seed and times on
// the room's clock (clock() is this device's time corrected to the room's), and where to report.
export interface GameProps {
  seed: number;
  startsAt: number;
  endsAt: number;
  clock: () => number;
  /** The score so far and how many steps (questions, sorts…) it took, whenever it changes. */
  onProgress: (score: number, step: number) => void;
  /** The game ended itself early (out of lives). */
  onDone: (score: number, step: number) => void;
}
