import { route } from '@/server/assignments';
import { transcribeFeedback } from '@/server/feedback-studio';

// POST: transcript of the recorded feedback (one AI request, saved).
export const POST = (req: Request, { params }: { params: Promise<{ sid: string }> }) => route(req, async (user) => transcribeFeedback((await params).sid, user));
