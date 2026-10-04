import { route } from '@/server/assignments';
import { joinScheduled } from '@/server/scheduled-calls';

// POST → { path } to open, or { path: null, conversationId, kind } to start the chat's call.
export const POST = (req: Request, { params }: { params: Promise<{ sid: string }> }) =>
  route(req, async (user) => joinScheduled(user, (await params).sid));
