import { route } from '@/server/assignments';
import { mentionInDoc } from '@/server/docs';

// POST { userId, context }: an @mention in the document's text notifies that person (src/server/docs.ts).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => mentionInDoc((await params).id, user, await req.json().catch(() => ({}))));
