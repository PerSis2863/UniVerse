// Task card extras (Stage 5 · B9.9): priority, labels, an estimate, repeating cards, "blocked by"
// and work-in-progress limits per list. The pure rules, shared by the server and the board.

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };

export const REPEATS = ['daily', 'weekdays', 'weekly', 'monthly'] as const;
export type Repeat = (typeof REPEATS)[number];
export const REPEAT_LABEL: Record<Repeat, string> = { daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', monthly: 'Every month' };

export const MAX_LABELS = 6;
export const MAX_BLOCKERS = 10;

/** Labels as typed: trimmed, at most 20 characters each, no repeats (ignoring case), at most six. */
export function cleanLabels(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const x of input) {
    if (typeof x !== 'string') continue;
    const l = x.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (l && !out.some((o) => o.toLowerCase() === l.toLowerCase())) out.push(l);
    if (out.length >= MAX_LABELS) break;
  }
  return out;
}

/** A JSON list from the database (labels or task ids). */
export function parseList(json: string | null | undefined): string[] {
  if (!json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}

/** The next due date of a repeating card, from its current one (or from now when it had none). */
export function nextDue(from: Date, repeat: Repeat): Date {
  const d = new Date(from);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
  else {
    // The same day next month, or the month's last day when it has fewer (31 Jan → 28/29 Feb).
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return d;
}

/** The cards still blocking this one (its blockers that aren't done). */
export function openBlockers<T extends { id: string; doneAt: string | Date | null }>(blockedBy: string[], cards: T[]): T[] {
  return blockedBy.map((id) => cards.find((c) => c.id === id)).filter((c): c is T => !!c && !c.doneAt);
}

/** Whether making `card` wait on `blocker` would go round in a circle (blocker already waits on card). */
export function makesCycle(card: string, blocker: string, waitsOn: (id: string) => string[]): boolean {
  if (card === blocker) return true;
  const seen = new Set<string>();
  const stack = [blocker];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === card) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...waitsOn(id));
  }
  return false;
}
