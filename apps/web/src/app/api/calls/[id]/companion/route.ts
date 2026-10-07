import { route } from '@/server/assignments';
import { createClassSession } from '@/server/class-companion';
import { createMeetingNotes } from '@/server/meeting-notes';

// POST { transcript: [{ t, who, text }], durationSec, pulse? } from the note-taker's browser when
// notes stop: one AI request turns it into a class's study pack (class calls,
// src/server/class-companion.ts) or meeting notes (every other call, src/server/meeting-notes.ts).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => {
    const id = (await params).id;
    const body = await req.json().catch(() => ({}));
    return id.startsWith('c_') ? createClassSession(id, user, body) : createMeetingNotes(id, user, body);
  });
