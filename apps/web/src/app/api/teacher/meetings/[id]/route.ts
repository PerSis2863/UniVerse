import { route } from '@/server/assignments';
import { teacherMeetingAction } from '@/server/parent-meetings';

// One meeting time (Stage 5 · B16.3). POST { action: 'delete' } (a booked one: the parent is told) or { action: 'notes', notes?, summary?, share? }.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => teacherMeetingAction(user, (await params).id, await req.json().catch(() => ({}))));
