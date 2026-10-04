import { route } from '@/server/assignments';
import { endCall } from '@/server/calls';

// POST { durationSec, answered }: the last person left a chat call; the chat shows how it went.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => endCall((await params).id, user, await req.json().catch(() => ({}))));
