import { route } from '@/server/assignments';
import { schedulableRooms, scheduleCall, upcomingCalls } from '@/server/scheduled-calls';

// GET: my upcoming scheduled calls (?rooms=1: where I can schedule one). POST: schedule a call
// { room: 'class' | 'group' | 'chat', roomId, title, startAt, durationMin, kind }.
export const GET = (req: Request) =>
  route(req, (user) => (new URL(req.url).searchParams.get('rooms') ? schedulableRooms(user) : upcomingCalls(user)));

export const POST = (req: Request) =>
  route(req, async (user) => scheduleCall(user, await req.json().catch(() => ({}))));
