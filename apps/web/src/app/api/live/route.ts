import { route } from '@/server/assignments';
import { createPoll, listPolls } from '@/server/live';

// GET ?courseId= : live polls (teachers: one course with results; students: open ones in their
// courses). POST { courseId, question, options, showResults? }: start one. See src/server/live.ts.
export const GET = (req: Request) => route(req, (user) => listPolls(user, new URL(req.url).searchParams.get('courseId')));
export const POST = (req: Request) => route(req, async (user) => createPoll(user, await req.json().catch(() => ({}))));
