import { route } from '@/server/assignments';
import { studentParents, teacherParentChat } from '@/server/parent-messages';

// Parent–teacher messages, teacher side (Stage 5 · B16.2). GET ?studentId=: the student's linked parents.
// POST { studentId, guardianId }: opens (or makes) the chat, answered from the teacher's inbox.
export const GET = (req: Request) => route(req, (user) => studentParents(user, new URL(req.url).searchParams.get('studentId')));
export const POST = (req: Request) => route(req, async (user) => teacherParentChat(user, await req.json().catch(() => ({}))));
