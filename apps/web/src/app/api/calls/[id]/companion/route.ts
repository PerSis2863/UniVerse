import { route } from '@/server/assignments';
import { createClassSession } from '@/server/class-companion';

// POST { transcript: [{ t, who, text }], durationSec } from the teacher's browser when class notes
// stop: one AI request turns it into a study pack (src/server/class-companion.ts).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => createClassSession((await params).id, user, await req.json().catch(() => ({}))));
