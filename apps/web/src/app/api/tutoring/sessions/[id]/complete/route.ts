import { route } from '@/server/assignments';
import { completeAndRateTutoringSession, type CompleteSessionInput } from '@/server/peer-tutoring';

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    const { id } = await params;
    const body = (await req.json()) as CompleteSessionInput;
    return completeAndRateTutoringSession(id, user, body);
  });
