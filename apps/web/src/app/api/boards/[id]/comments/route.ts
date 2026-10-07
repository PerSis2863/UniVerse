import { route } from '@/server/assignments';
import { addBoardComment, listBoardComments } from '@/server/board-extras';

type Ctx = { params: Promise<{ id: string }> };
// Comments on a board's shapes (Stage 4 · 3.4). GET: all. POST { elementId, body }.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => listBoardComments((await params).id, user));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => addBoardComment((await params).id, user, await req.json().catch(() => ({}))));
