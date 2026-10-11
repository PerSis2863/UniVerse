import { route } from '@/server/assignments';
import { closeFriends, setCloseFriends } from '@/server/chat-status';

// My close friends, who see my "close friends" status updates (Stage 5 · B7.9). GET; PUT { ids }.
export const GET = (req: Request) => route(req, (user) => closeFriends(user));
export const PUT = (req: Request) => route(req, async (user) => setCloseFriends(user, (await req.json().catch(() => ({}))) as Record<string, unknown>));
