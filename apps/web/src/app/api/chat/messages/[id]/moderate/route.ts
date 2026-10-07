import { route } from '@/server/assignments';
import { moderateMessage } from '@/server/community-moderation';

// POST: a community moderator removes a message for everyone (Stage 4 · 1.13).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => moderateMessage(user, (await params).id));
