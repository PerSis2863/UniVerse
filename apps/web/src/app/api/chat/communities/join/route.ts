import { route } from '@/server/assignments';
import { joinCommunity } from '@/server/communities';

// POST { code }: join a community with its invite link.
export const POST = (req: Request) => route(req, async (user) => joinCommunity(user, await req.json().catch(() => ({}))));
