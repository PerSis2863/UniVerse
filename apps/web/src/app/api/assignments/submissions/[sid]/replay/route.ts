import { route } from '@/server/assignments';
import { replayOf } from '@/server/submission-replay';

// The writing replay of a typed hand-in (src/server/submission-replay.ts): the teaching team.

type Ctx = { params: Promise<{ sid: string }> };

export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => replayOf((await params).sid, user));
