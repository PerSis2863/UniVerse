import { route } from '@/server/assignments';
import { vote } from '@/server/live';

// POST { option }: a student answers (or changes their answer while the poll is open).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => vote(user, (await params).id, await req.json().catch(() => ({}))));
