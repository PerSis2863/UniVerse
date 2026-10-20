import { route } from '@/server/assignments';
import { commandsFor } from '@/server/chat-apps';

// GET: the slash commands of the chat apps the person's school has switched on (Stage 5 · Q20).
export const GET = (req: Request) => route(req, (user) => commandsFor(user));
