// Dot voting on boards (Stage 4 · 3.4): kept apart from BoardCanvas so pages can use it without
// loading the drawing engine.
export const MAX_VOTES = 3;

/** A note with votes. */
export interface Voted { id: string; label: string; count: number; mine: boolean }
