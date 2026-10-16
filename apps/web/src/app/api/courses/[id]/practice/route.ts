import { route } from '@/server/assignments';
import { answerPractice, nextPractice } from '@/server/practice';

// Adaptive practice (src/server/practice.ts), for the course's students. GET: the next question.
// POST { questionId, answer } or { questionId, giveUp: true }: a try.

type Ctx = { params: Promise<{ id: string }> };

export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => nextPractice(user, (await params).id, new URL(req.url).searchParams.get('skip')));
export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => answerPractice(user, (await params).id, (await req.json().catch(() => ({}))) ?? {}));
