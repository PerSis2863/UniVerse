import { route } from '@/server/assignments';
import { openParentChat, postParentChat } from '@/server/parent-messages';

// One parent–teacher chat (Stage 5 · B16.2). GET: the messages (marks them read). POST { body } sends; { lang } sets my reading language.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => openParentChat(user, (await params).id));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => postParentChat(user, (await params).id, await req.json().catch(() => ({}))));
