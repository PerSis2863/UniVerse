import { route } from '@/server/assignments';
import { parentChats, startParentChat } from '@/server/parent-messages';

// Parent–teacher messages, parent side (Stage 5 · B16.2; src/server/parent-messages.ts).
// GET ?studentId=: the child's teachers with our chats. POST { studentId, teacherId, body, lang? }: write to a teacher.
export const GET = (req: Request) => route(req, (user) => parentChats(user, new URL(req.url).searchParams.get('studentId')));
export const POST = (req: Request) => route(req, async (user) => startParentChat(user, await req.json().catch(() => ({}))));
