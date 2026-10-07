import { route } from '@/server/assignments';
import { BadRequestException } from '@/server/http';
import { addToPlanner, getBrief, makeAiBrief, setBriefPrefs } from '@/server/daily-brief';

// Daily brief (Stage 4 · 4.9; src/server/daily-brief.ts). GET ?tz=: today's brief. POST { action }:
// 'ai' makes today's AI brief (once a day), 'prefs' sets the morning push, 'task' adds a suggested
// task to the planner.
export const GET = (req: Request) => route(req, (user) => getBrief(user, new URL(req.url).searchParams.get('tz')));
export const POST = (req: Request) => route(req, async (user) => {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action === 'ai') return makeAiBrief(user, b.tz);
  if (b.action === 'prefs') return setBriefPrefs(user, b);
  if (b.action === 'task') return addToPlanner(user, b);
  throw new BadRequestException('Unknown action.');
});
