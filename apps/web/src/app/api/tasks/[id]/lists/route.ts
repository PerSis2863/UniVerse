import { route } from '@/server/assignments';
import { addList } from '@/server/tasks';

// POST { title }: a new list on the board.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => addList((await params).id, user, await req.json().catch(() => ({}))));
