import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { courseCopyStep } from '@/server/course-copy';

// One step of copying a course (src/server/course-copy.ts): POST { target, stage, after?, shiftDays? }.

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => courseCopyStep((await params).id, user, ((await req.json().catch(() => ({}))) ?? {}) as Body));
