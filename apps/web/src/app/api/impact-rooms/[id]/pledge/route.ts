import { route } from '@/server/assignments';
import { cancelPledge, pledgeTime } from '@/server/impact-rooms';

type Ctx = { params: Promise<{ id: string }> };
// POST { hoursPerMonth, months, skill?, note? }: donate time. DELETE: take the pledge back.
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => pledgeTime((await params).id, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => cancelPledge((await params).id, user));
