import { route } from '@/server/assignments';
import { scheduleCall } from '@/server/impact-rooms';

type Ctx = { params: Promise<{ id: string }> };
// POST { startsAt, title? }: staff plan the room's next impact call.
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => scheduleCall((await params).id, user, await req.json().catch(() => ({}))));
