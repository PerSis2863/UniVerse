import { route } from '@/server/assignments';
import { deleteUpdate } from '@/server/impact-rooms';

type Ctx = { params: Promise<{ uid: string }> };
// DELETE: a post (its author or staff).
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteUpdate((await params).uid, user));
