import { route } from '@/server/assignments';
import { deleteBoard, getBoard, updateBoard } from '@/server/tasks';

type Ctx = { params: Promise<{ id: string }> };
// GET: a board (lists, cards, people). PATCH { title }. DELETE (whoever made it).
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => getBoard((await params).id, user));
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateBoard((await params).id, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteBoard((await params).id, user));
