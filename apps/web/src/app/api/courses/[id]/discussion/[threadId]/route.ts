import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { getThread, threadAction } from '@/server/course-discussion';

// One discussion thread: GET the thread and its replies; POST { action, … } to reply, vote, accept,
// endorse, pin, lock, edit or delete (src/server/course-discussion.ts).

type Ctx = { params: Promise<{ id: string; threadId: string }> };

export const GET = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    const { id, threadId } = await params;
    return getThread(id, threadId, user);
  });

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    const { id, threadId } = await params;
    return threadAction(id, threadId, user, ((await req.json().catch(() => ({}))) ?? {}) as Body);
  });
