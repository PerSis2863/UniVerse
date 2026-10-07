import { route } from '@/server/assignments';
import { addEmoji, listEmoji, removeEmoji } from '@/server/communities';

type Ctx = { params: Promise<{ cid: string }> };

// A community's own emoji (Stage 4 · 1.2). GET: the list (members). POST { name, url }: add one
// (moderators, up to 50; url from /api/upload). DELETE ?name=: remove one (moderators).
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => listEmoji(user, (await params).cid));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => addEmoji(user, (await params).cid, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => removeEmoji(user, (await params).cid, new URL(req.url).searchParams.get('name')));
