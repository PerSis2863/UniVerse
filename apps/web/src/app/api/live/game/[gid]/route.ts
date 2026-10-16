import { route } from '@/server/assignments';
import { gameAction } from '@/server/live-game';

// POST { action: join | answer (questionId, answer) | next | reveal | end } (src/server/live-game.ts).

type Ctx = { params: Promise<{ gid: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => gameAction(user, (await params).gid, (await req.json().catch(() => ({}))) ?? {}));
