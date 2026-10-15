import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { changeEnrolment, enrolmentView } from '@/server/course-enrolment';

// Who's in a course (Stage 5 · B2, src/server/course-enrolment.ts): GET the class list, requests,
// waitlist and sections (teaching team); POST { action, … } to change them (teacher and co-teachers).

type Ctx = { params: Promise<{ id: string }> };

export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => enrolmentView((await params).id, user));

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => changeEnrolment((await params).id, user, ((await req.json().catch(() => ({}))) ?? {}) as Body));
