import { route } from '@/server/assignments';
import { checkIn } from '@/server/volunteering';

// POST { code } or { shiftId, lat, lng }: check in on site.
export const POST = (req: Request) => route(req, async (user) => checkIn(user, await req.json().catch(() => ({}))));
