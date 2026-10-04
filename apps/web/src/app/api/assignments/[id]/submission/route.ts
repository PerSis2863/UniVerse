import { route, submitAnswer } from '@/server/assignments';

// PUT { text }: a student hands in (or replaces, until it's graded) their answer.
export const PUT = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => submitAnswer((await params).id, user, await req.json().catch(() => ({})), req));
