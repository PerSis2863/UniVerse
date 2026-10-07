import { route } from '@/server/assignments';
import { changeBoardComment } from '@/server/board-extras';

type Ctx = { params: Promise<{ cid: string }> };
// One board comment (Stage 4 · 3.4): PATCH { resolved } · DELETE.
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => changeBoardComment((await params).cid, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => changeBoardComment((await params).cid, user, null));
