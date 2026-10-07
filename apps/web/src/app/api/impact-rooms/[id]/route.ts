import { route } from '@/server/assignments';
import { getRoom, setRoomPublic } from '@/server/impact-rooms';

type Ctx = { params: Promise<{ id: string }> };
// GET: the room. PATCH { public }: staff turn its public page on or off.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => getRoom((await params).id, user));
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => setRoomPublic((await params).id, user, await req.json().catch(() => ({}))));
