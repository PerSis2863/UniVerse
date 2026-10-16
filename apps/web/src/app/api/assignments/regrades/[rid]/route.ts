import { route } from '@/server/assignments';
import { answerRegrade } from '@/server/student-assignment';

// The teaching team answers a regrade request (src/server/student-assignment.ts): POST { outcome, reply }.

type Ctx = { params: Promise<{ rid: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => answerRegrade((await params).rid, user, (await req.json().catch(() => ({}))) ?? {}));
