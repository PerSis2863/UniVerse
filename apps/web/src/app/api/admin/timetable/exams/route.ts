import { route } from '@/server/assignments';
import { publishExams, removeExams } from '@/server/timetable-plan';

// The exam timetable (Stage 5 · Q12). POST { name, exams }: publish onto every student's and
// teacher's calendar. DELETE ?batch=exam:<name>: take one off. Admins only.
export const POST = (req: Request) => route(req, async (user) => publishExams(user, (await req.json().catch(() => ({}))) ?? {}));
export const DELETE = (req: Request) => route(req, (user) => removeExams(user, new URL(req.url).searchParams.get('batch')));
