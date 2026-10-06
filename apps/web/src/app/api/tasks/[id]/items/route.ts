import { route } from '@/server/assignments';
import { addTask } from '@/server/tasks';

// POST { listId, title }: a new card.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => addTask((await params).id, user, await req.json().catch(() => ({}))));
