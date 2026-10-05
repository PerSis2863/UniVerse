import { route } from '@/server/assignments';
import { localDay } from '@/server/study-planner';
import { savePrefs, weekPlan } from '@/server/smart-planner';

// The smart study planner's week (src/server/smart-planner.ts; no AI).
// GET ?today=YYYY-MM-DD&tz=Area/City → sessions per day (re-planned first if something changed).
// PATCH { capMin?, start?, end?, ical? } → planner settings.
export const GET = (req: Request) => route(req, async (user) => {
  const sp = new URL(req.url).searchParams;
  const { today, tz } = localDay(sp.get('today'), sp.get('tz'));
  return weekPlan(user.id, today, tz);
});
export const PATCH = (req: Request) => route(req, async (user) => savePrefs(user.id, await req.json().catch(() => ({}))));
