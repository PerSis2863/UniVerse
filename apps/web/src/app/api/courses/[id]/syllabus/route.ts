import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { applySyllabus } from '@/server/syllabus';

// Adds an edited syllabus draft to the course as hidden modules (src/server/syllabus.ts): POST { draft, useSkills }.

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => applySyllabus((await params).id, user, ((await req.json().catch(() => ({}))) ?? {}) as Body));
