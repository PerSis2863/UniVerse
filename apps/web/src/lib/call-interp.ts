// Interpreters in calls (Stage 5 · B8.7): who's interpreting, and how loud each voice plays for
// someone listening to an interpreter (the interpreter in full, everyone else quietly underneath).

export interface Interpreter { kind: 'sign' | 'spoken'; label: string; name: string }
export type Interpreters = Record<string, Interpreter>;
export const UNDER = 0.15;

/** The volume for a person's voice (by user id) when listening to `listening` (a user id, or null for the original). */
export const voiceVolume = (userId: string, listening: string | null) => (!listening || userId === listening ? 1 : UNDER);

/** Spoken interpreters, for the "Listen to" choice. */
export const spokenOnes = (all: Interpreters) => Object.entries(all).filter(([, i]) => i.kind === 'spoken').map(([userId, i]) => ({ userId, ...i }));
