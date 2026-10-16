import { route } from '@/server/assignments';
import { suggestAccepted } from '@/server/quiz-marking';

// POST { questionId }: which wrong short answers the AI thinks are right (src/server/quiz-marking.ts).

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => suggestAccepted((await params).id, user, (await req.json().catch(() => ({}))) ?? {}));
