import { route } from '@/server/assignments';
import { gradeHistory } from '@/server/grade-history';

// The course's grade history (src/server/grade-history.ts): GET ?studentId= (the teaching team).

type Ctx = { params: Promise<{ id: string }> };

export const GET = (req: Request, { params }: Ctx) =>
  route(req, async (user) => gradeHistory((await params).id, user, new URL(req.url).searchParams.get('studentId')));
