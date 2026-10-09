import { route } from '@/server/assignments';
import { secondChance, secondChanceAction, secondChances } from '@/server/second-chance';

// A student's second chances in a course (Stage 5 · D10). GET → my list, or GET ?key= → one catch-up.
// POST { action: start | answer | watched | cards | done | dismiss, key, ... }.
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => {
  const key = new URL(req.url).searchParams.get('key');
  return key ? secondChance(user, (await params).id, key) : secondChances(user, (await params).id);
});
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => secondChanceAction(user, (await params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>));
