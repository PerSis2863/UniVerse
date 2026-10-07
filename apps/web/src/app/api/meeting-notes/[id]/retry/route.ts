import { route } from '@/server/assignments';
import { retryMeetingNotes } from '@/server/meeting-notes';

// POST: make meeting notes saved while AI was unavailable (the note-taker only), then post them.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => retryMeetingNotes((await params).id, user));
