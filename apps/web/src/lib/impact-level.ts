// Impact levels as the student dashboard shows them (the same thresholds as src/server/services/impact.service.ts),
// with no database, so the light API path (cloudflare/fast-lists.ts) can use them too.

export const LEVELS = [
  { level: 1, title: 'Changemaker Seed', minXP: 0, emoji: '🌱' },
  { level: 2, title: 'Impact Explorer', minXP: 100, emoji: '🌿' },
  { level: 3, title: 'Social Innovator', minXP: 300, emoji: '⚡' },
  { level: 4, title: 'SDG Champion', minXP: 600, emoji: '🏅' },
  { level: 5, title: 'Global Catalyst', minXP: 1000, emoji: '🌍' },
  { level: 6, title: 'Visionary Leader', minXP: 1500, emoji: '🚀' },
  { level: 7, title: 'UniVerse Legend', minXP: 2500, emoji: '🌟' },
];

export function levelInfo(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].minXP) i++;
  const current = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  const progress = next ? Math.round(((xp - current.minXP) / (next.minXP - current.minXP)) * 100) : 100;
  return { current, next, progress, xp };
}
