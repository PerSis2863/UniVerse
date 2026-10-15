import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { createThread, listThreads } from '@/server/course-discussion';

// A course's discussion board (Stage 5 · B2, src/server/course-discussion.ts).
// GET ?filter=all|unanswered|mine&q=: the threads. POST { title, body, kind, anonymous }: a new one.

type Ctx = { params: Promise<{ id: string }> };

export const GET = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    const sp = new URL(req.url).searchParams;
    return listThreads((await params).id, user, sp.get('filter'), sp.get('q'));
  });

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => createThread((await params).id, user, ((await req.json().catch(() => ({}))) ?? {}) as Body));
