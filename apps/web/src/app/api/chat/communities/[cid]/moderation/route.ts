import { route } from '@/server/assignments';
import { moderate, moderationView } from '@/server/community-moderation';

type Ctx = { params: Promise<{ cid: string }> };
// Community moderation (Stage 4 · 1.13), for its owner and moderators. GET: reports, timeouts,
// automod words and the log. POST { action: 'timeout' | 'automod' | 'resolve', … }.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => moderationView(user, (await params).cid));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => moderate(user, (await params).cid, await req.json().catch(() => ({}))));
