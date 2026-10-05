import { route } from '@/server/assignments';
import { createShift, listShifts } from '@/server/volunteering';

// Verified volunteering (upgrade 5). GET: shifts with places taken and my sign-up. POST (admin or teacher): a new shift.
export const GET = (req: Request) => route(req, (user) => listShifts(user));
export const POST = (req: Request) => route(req, async (user) => createShift(user, await req.json().catch(() => ({}))));
