import { route } from '@/server/assignments';
import { addDocComment, listDocComments } from '@/server/docs';

type Ctx = { params: Promise<{ id: string }> };
// GET: comments. POST { body, quote? }: comment on the document or on the text you selected.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => listDocComments((await params).id, user));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => addDocComment((await params).id, user, await req.json().catch(() => ({}))));
