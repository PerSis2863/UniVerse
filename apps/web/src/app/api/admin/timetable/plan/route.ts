import { route } from '@/server/assignments';
import { planInputs, saveWeek } from '@/server/timetable-plan';

// The timetable generator (Stage 5 · Q12). GET: courses, rooms, shared students, the current week
// and published exam timetables. POST { courseIds, slots }: save an accepted week. Admins only.
export const GET = (req: Request) => route(req, (user) => planInputs(user));
export const POST = (req: Request) => route(req, async (user) => saveWeek(user, (await req.json().catch(() => ({}))) ?? {}));
