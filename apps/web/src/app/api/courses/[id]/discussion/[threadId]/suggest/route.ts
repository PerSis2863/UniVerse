import { route } from '@/server/assignments';
import { suggestAnswer } from '@/server/course-discussion';

// An AI draft answer from the course's materials, for the teacher to edit and post (costs one AI request).

type Ctx = { params: Promise<{ id: string; threadId: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    const { id, threadId } = await params;
    return suggestAnswer(id, threadId, user);
  });
