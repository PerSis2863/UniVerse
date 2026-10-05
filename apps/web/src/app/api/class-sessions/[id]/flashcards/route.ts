import { route } from '@/server/assignments';
import { addSessionFlashcards } from '@/server/class-companion';

// POST: copy a study pack's flashcards into my own deck (cards already added are skipped).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => addSessionFlashcards((await params).id, user));
