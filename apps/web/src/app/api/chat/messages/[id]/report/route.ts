import { route } from '@/server/assignments';
import { reportMessage } from '@/server/community-moderation';

// POST { reason? }: report a message in a community channel to its moderators (Stage 4 · 1.13).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => reportMessage(user, (await params).id, await req.json().catch(() => ({}))));
