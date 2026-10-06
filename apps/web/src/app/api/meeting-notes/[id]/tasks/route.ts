import { route } from '@/server/assignments';
import { addActionTask } from '@/server/meeting-notes';

// POST { index }: adds one of the notes' action items to my tasks (and so my study planner).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => addActionTask((await params).id, user, (await req.json().catch(() => ({}))).index));
