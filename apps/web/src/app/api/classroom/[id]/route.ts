import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { sessionAction, teacherView } from '@/server/classroom';

type Ctx = { params: Promise<{ id: string }> };
// GET: the teacher's view of an in-person class. POST { action }: the teacher's (transcript, answer,
// end) or a student's (mood, ask) action (Stage 5 · D7).
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => teacherView((await params).id, user));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => sessionAction((await params).id, user, ((await req.json().catch(() => null)) as Body | null) ?? {}));
