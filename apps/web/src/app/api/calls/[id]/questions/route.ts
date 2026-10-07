import { route } from '@/server/assignments';
import { callQuestions } from '@/server/calls';

// GET: the class's quiz questions, to ask live in its class call (the teacher only).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => callQuestions((await params).id, user));
