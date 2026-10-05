import { route } from '@/server/assignments';
import { removeFeedbackMedia, saveFeedbackMedia } from '@/server/feedback-studio';

// POST { url, kind }: attach the teacher's recorded voice/video feedback. DELETE: remove it.
type Ctx = { params: Promise<{ sid: string }> };
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => saveFeedbackMedia((await params).sid, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => removeFeedbackMedia((await params).sid, user));
