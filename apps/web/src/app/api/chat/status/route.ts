import { route } from '@/server/assignments';
import { listStatuses, postStatus } from '@/server/chat-status';

// GET: status updates from you and the people you chat with. POST { kind, body, mediaUrl, background }.
export const GET = (req: Request) => route(req, (user) => listStatuses(user));
export const POST = (req: Request) => route(req, async (user) => postStatus(user, await req.json().catch(() => ({}))));
