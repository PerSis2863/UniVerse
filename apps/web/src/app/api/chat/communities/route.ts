import { route } from '@/server/assignments';
import { createCommunity, listCommunities } from '@/server/communities';

// GET: my communities with channels and unread counts. POST { name, description, color, memberIds }.
export const GET = (req: Request) => route(req, (user) => listCommunities(user));
export const POST = (req: Request) => route(req, async (user) => createCommunity(user, await req.json().catch(() => ({}))));
