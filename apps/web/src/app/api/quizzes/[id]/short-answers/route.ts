import { route } from '@/server/assignments';
import { changeAccepted, shortAnswers } from '@/server/quiz-marking';

// Short answers the key didn't expect (src/server/quiz-marking.ts), for the teaching team.
// GET ?questionId= : the accepted answers and the different wrong ones. POST { action: accept |
// unaccept, questionId, answer } : changes the key and marks every hand-in again.

type Ctx = { params: Promise<{ id: string }> };

export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => shortAnswers((await params).id, new URL(req.url).searchParams.get('questionId'), user));
export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => changeAccepted((await params).id, user, (await req.json().catch(() => ({}))) ?? {}));
