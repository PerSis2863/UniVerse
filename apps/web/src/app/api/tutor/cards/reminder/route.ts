import { route } from '@/server/assignments';
import { setCardReminder } from '@/server/tutor-plus';

// PUT { on, tz }: a reminder at 6 pm (your time) on days when flashcards are due (Stage 5 · Q13).
export const PUT = (req: Request) => route(req, async (user) => setCardReminder(user, ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>));
