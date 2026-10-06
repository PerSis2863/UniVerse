import { route } from '@/server/assignments';
import { getMeetingNote } from '@/server/meeting-notes';

// GET: a call's meeting notes (Stage 4 · 2.8), for the people they're for. See src/server/meeting-notes.ts.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => getMeetingNote((await params).id, user));
