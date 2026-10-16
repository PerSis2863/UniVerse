import { route } from '@/server/assignments';
import { markMany, register } from '@/server/attendance-plus';

// The teacher's register for a course (Stage 5 · Q11, src/server/attendance-plus.ts).
// GET ?day=YYYY-MM-DD: marks, each student's record and recent days. POST { day, marks: [{ studentId, status }] }.
type Ctx = { params: Promise<{ courseId: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => register((await params).courseId, user, new URL(req.url).searchParams.get('day')));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => markMany((await params).courseId, user, (await req.json().catch(() => ({}))) ?? {}));
