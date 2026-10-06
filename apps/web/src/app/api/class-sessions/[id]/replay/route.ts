import { route } from '@/server/assignments';
import { makeReplay, searchReplay } from '@/server/class-companion';

// Smart replay (Stage 4 · 4.6). GET ?q=: find where something was explained in the class (no AI).
// POST: the teacher makes the replay (chapters, recap, practice) for a class from before it existed.
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) =>
  route(req, async (user) => searchReplay((await params).id, user, (new URL(req.url).searchParams.get('q') ?? '').slice(0, 200)));
export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => makeReplay((await params).id, user));
