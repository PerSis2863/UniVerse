import { route } from '@/server/assignments';
import { reminderAction } from '@/server/chat-reminders';

// One reminder on my Later list (Stage 5 · B7.1). PATCH { action: 'done' | 'undo' | 'snooze', minutes | at }; DELETE.
type Ctx = { params: Promise<{ id: string }> };
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => reminderAction(user, (await params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => reminderAction(user, (await params).id, null));
