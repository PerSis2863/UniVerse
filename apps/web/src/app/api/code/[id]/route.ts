import { route } from '@/server/assignments';
import { deleteRoom, getRoom, updateRoom } from '@/server/code-rooms';

type Ctx = { params: Promise<{ id: string }> };

// GET: the room and what you may do. PATCH { title?, language?, locked? } / DELETE: its teacher or creator.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => getRoom((await params).id, user));
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateRoom((await params).id, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteRoom((await params).id, user));
