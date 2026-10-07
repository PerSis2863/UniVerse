import { route } from '@/server/assignments';
import { addComment, listComments } from '@/server/tasks';

type Ctx = { params: Promise<{ tid: string }> };
// GET: a card's comments. POST { body }: comment (its assignee is told, in the app).
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => listComments((await params).tid, user));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => addComment((await params).tid, user, await req.json().catch(() => ({}))));
