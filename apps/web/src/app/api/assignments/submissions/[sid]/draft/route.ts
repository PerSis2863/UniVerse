import { draftWithAi, route } from '@/server/assignments';

// POST: the AI drafts scores and comments for the teacher to review (counts toward their AI limit).
export const POST = (req: Request, { params }: { params: Promise<{ sid: string }> }) => route(req, async (user) => draftWithAi((await params).sid, user));
