import { route } from '@/server/assignments';
import { setMember } from '@/server/tasks';

// POST { email, role } to share the board, or { userId, remove: true } to stop sharing it.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => setMember((await params).id, user, await req.json().catch(() => ({}))));
