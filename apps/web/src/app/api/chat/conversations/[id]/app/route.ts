import { route } from '@/server/assignments';
import { runCommand } from '@/server/chat-apps';

// POST { command, text }: runs a school chat app's slash command in this chat (src/server/chat-apps.ts).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => runCommand(user, (await params).id, await req.json().catch(() => ({}))));
