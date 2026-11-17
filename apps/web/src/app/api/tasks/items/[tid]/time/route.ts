import { route } from '@/server/assignments';
import { addTime, listTime } from '@/server/tasks';

type Ctx = { params: Promise<{ tid: string }> };
// M230. GET: the time logged on a card and its total. POST { minutes, note?, at? }: log time.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => listTime((await params).tid, user));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => addTime((await params).tid, user, await req.json().catch(() => ({}))));
