import { route } from '@/server/assignments';
import { openMeetingTimes, teacherMeetings } from '@/server/parent-meetings';

// Parent–teacher meetings, teacher side (Stage 5 · B16.3; src/server/parent-meetings.ts).
// GET: my meeting times (free and booked) and recent meetings. POST { startAt, endAt, durationMin, gapMin?, mode, location?, timeZone }: open times.
export const GET = (req: Request) => route(req, (user) => teacherMeetings(user));
export const POST = (req: Request) => route(req, async (user) => openMeetingTimes(user, await req.json().catch(() => ({}))));
