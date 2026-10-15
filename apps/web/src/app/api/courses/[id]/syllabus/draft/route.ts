import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { draftSyllabus } from '@/server/syllabus';

// An AI first draft of a course's modules, outcomes and skills (Stage 5 · B2, src/server/syllabus.ts):
// POST { level, weeks, notes? }. Nothing is saved; the teacher edits it and adds it with POST …/syllabus.

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => draftSyllabus((await params).id, user, ((await req.json().catch(() => ({}))) ?? {}) as Body));
