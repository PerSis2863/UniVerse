// Gestures on camera in calls (Stage 5 · B8.4, opt-in): what the gesture recogniser sees, turned
// into actions only when a gesture is held for a moment, with a pause after each so one wave
// doesn't send ten. An open palm held up high raises your hand; a thumbs-up, the "I love you"
// sign or a victory sign sends 👍, ❤️ or 🎉.

export type GestureAction = 'hand' | '👍' | '❤️' | '🎉';
export interface GestureFrame { gesture: string | null; score: number; /** The wrist's height in the picture, 0 (top) to 1. */ wristY: number | null }

const ACTIONS: Record<string, GestureAction> = { Thumb_Up: '👍', ILoveYou: '❤️', Victory: '🎉' };
export const HOLD_MS = 700, COOLDOWN_MS = 5000, MIN_SCORE = 0.6;

/** The action a frame shows (before holding), if any. */
export function frameAction(f: GestureFrame): GestureAction | null {
  if (!f.gesture || f.score < MIN_SCORE) return null;
  if (f.gesture === 'Open_Palm' || f.gesture === 'Pointing_Up') return f.wristY !== null && f.wristY < 0.5 ? 'hand' : null;
  return ACTIONS[f.gesture] ?? null;
}

/** Feeds frames in; says when to act. */
export function gestureWatcher(hold = HOLD_MS, cooldown = COOLDOWN_MS) {
  let current: GestureAction | null = null, since = 0, quietUntil = 0, fired = false;
  return (f: GestureFrame, now: number): GestureAction | null => {
    const a = frameAction(f);
    if (a !== current) { current = a; since = now; fired = false; return null; }
    if (!a || fired || now < quietUntil || now - since < hold) return null;
    fired = true;
    quietUntil = now + cooldown;
    return a;
  };
}
