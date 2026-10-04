import { returnGrade, route } from '@/server/assignments';

// POST { criteria: [{ id, score, comment }], feedback }: the teacher's final grade, sent to the student.
export const POST = (req: Request, { params }: { params: Promise<{ sid: string }> }) =>
  route(req, async (user) => returnGrade((await params).sid, user, await req.json().catch(() => ({})), req));
