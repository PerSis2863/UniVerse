import { route } from '@/server/assignments';
import { createReminder, laterList } from '@/server/chat-reminders';

// Reminders and the Later list (Stage 5 · B7.1; src/server/chat-reminders.ts). GET: my Later list.
// POST { text, minutes | at, conversationId? } ("/remind") or { messageId, minutes | at } ("Remind me"
// on a message): sent by the 15-minute check, so it may come up to 15 minutes late.
export const GET = (req: Request) => route(req, (user) => laterList(user));
export const POST = (req: Request) => route(req, async (user) => createReminder(user, (await req.json().catch(() => ({}))) as Record<string, unknown>));
