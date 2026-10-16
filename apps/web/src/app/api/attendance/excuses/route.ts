import { route } from '@/server/assignments';
import { myExcuses, requestExcuse } from '@/server/attendance-plus';

// A student's excuse requests (Stage 5 · Q11). GET: mine. POST { courseId, day, reason, fileUrl?, fileName? }.
export const GET = (req: Request) => route(req, (user) => myExcuses(user));
export const POST = (req: Request) => route(req, async (user) => requestExcuse(user, (await req.json().catch(() => ({}))) ?? {}));
