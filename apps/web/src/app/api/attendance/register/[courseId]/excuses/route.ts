import { route } from '@/server/assignments';
import { courseExcuses } from '@/server/attendance-plus';

// GET: the course's excuse requests for its teachers (waiting ones first, then the last month's).
type Ctx = { params: Promise<{ courseId: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => courseExcuses((await params).courseId, user));
