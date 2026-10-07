import { route } from '@/server/assignments';
import { postUpdate } from '@/server/impact-rooms';

type Ctx = { params: Promise<{ id: string }> };
// POST { body, public? }: a post in the room (followers and staff; staff may make it public).
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => postUpdate((await params).id, user, await req.json().catch(() => ({}))));
