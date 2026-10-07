import { route } from '@/server/assignments';
import { deleteCall } from '@/server/impact-rooms';

type Ctx = { params: Promise<{ cid: string }> };
// DELETE: staff cancel a planned impact call (not one with a report).
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteCall((await params).cid, user));
