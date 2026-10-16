import { route } from '@/server/assignments';
import { changeNotes, notesFor } from '@/server/submission-notes';

// Notes pinned to a hand-in (src/server/submission-notes.ts): GET them; POST { action, … } to add,
// edit or delete one (the teaching team).

type Ctx = { params: Promise<{ sid: string }> };

export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => notesFor((await params).sid, user));
export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => changeNotes((await params).sid, user, (await req.json().catch(() => ({}))) ?? {}));
