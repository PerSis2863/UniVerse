import { route } from '@/server/assignments';
import { listBoardVersions, saveBoardVersion } from '@/server/board-extras';

type Ctx = { params: Promise<{ id: string }> };
// A board's saved versions (Stage 4 · 3.4). GET: the list. POST { elements, name?, auto? }: save one.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => listBoardVersions((await params).id, user));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => saveBoardVersion((await params).id, user, await req.json().catch(() => ({}))));
