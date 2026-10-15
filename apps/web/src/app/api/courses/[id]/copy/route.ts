import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { startCourseCopy } from '@/server/course-copy';

// Copy a course to a new term (Stage 5 · B2, src/server/course-copy.ts). POST { code, name }: makes
// the new course (a draft); the browser then runs each step with POST …/copy/step.

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => startCourseCopy((await params).id, user, ((await req.json().catch(() => ({}))) ?? {}) as Body));
