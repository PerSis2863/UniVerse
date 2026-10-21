import { duplicateAssignment, route } from '@/server/assignments';

// POST: a copy of the assignment in the same course, open, with no due date (Stage 5 · Q23).
type Ctx = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => duplicateAssignment((await params).id, user, req));
