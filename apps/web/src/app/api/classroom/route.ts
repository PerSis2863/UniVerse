import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { activeSession, startSession } from '@/server/classroom';

// In-person classes (Stage 5 · D7, src/server/classroom.ts), for the course's teacher.
// GET ?courseId=: the session running now, if any. POST { courseId }: start one (or get the running one).
export const GET = (req: Request) => route(req, (user) => activeSession(new URL(req.url).searchParams.get('courseId') ?? '', user));
export const POST = (req: Request) => route(req, async (user) => startSession(((await req.json().catch(() => null)) as Body | null)?.courseId, user));
