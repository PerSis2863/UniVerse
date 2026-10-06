import { route } from '@/server/assignments';
import { hallTableBoard } from '@/server/calls';

// POST { n }: the whiteboard of table n in a Study Hall (Stage 4 · 4.2), made the first time.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => hallTableBoard((await params).id, user, (await req.json().catch(() => ({}))).n));
