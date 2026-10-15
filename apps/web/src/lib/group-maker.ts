// Making groups for a group assignment (Stage 5 · B3.2): random groups of about a size (as even as
// possible: sizes differ by one at most), named "Group 1", "Group 2"… Pure; tested in group-maker.test.ts.

export const GROUP_MODES = ['SHARED', 'INDIVIDUAL'] as const;
export type GroupMode = (typeof GROUP_MODES)[number];
export const isGroupMode = (v: unknown): v is GroupMode => (GROUP_MODES as readonly unknown[]).includes(v);
export const GROUP_LABEL: Record<'NONE' | GroupMode, { label: string; hint: string }> = {
  NONE: { label: 'Each student', hint: 'Everyone hands in their own work.' },
  SHARED: { label: 'Groups, one grade', hint: 'One hand-in per group; everyone in it gets the same grade.' },
  INDIVIDUAL: { label: 'Groups, a grade each', hint: 'One hand-in per group; you can give each member their own grade.' },
};

/** Shuffles (Fisher–Yates; `random` is for tests). */
export function shuffle<T>(xs: T[], random: () => number = Math.random): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Random groups of about `size` (2–10), dealt out in turn; nobody ends up alone (unless there's one person). */
export function makeGroups<T>(people: T[], size: number, random: () => number = Math.random): T[][] {
  const n = Math.min(10, Math.max(2, Math.round(size) || 2));
  if (!people.length) return [];
  const count = Math.max(1, Math.min(Math.round(people.length / n), Math.floor(people.length / 2)));
  const groups: T[][] = Array.from({ length: count }, () => []);
  shuffle(people, random).forEach((p, i) => groups[i % count].push(p));
  return groups;
}
