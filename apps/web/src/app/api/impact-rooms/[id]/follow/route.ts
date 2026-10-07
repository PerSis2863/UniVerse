import { route } from '@/server/assignments';
import { followRoom, leaveRoom } from '@/server/impact-rooms';

type Ctx = { params: Promise<{ id: string }> };
// POST { role: VOLUNTEER | SPONSOR | SUPPORTER }: follow the room. DELETE: leave it (and drop my pledge).
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => followRoom((await params).id, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => leaveRoom((await params).id, user));
