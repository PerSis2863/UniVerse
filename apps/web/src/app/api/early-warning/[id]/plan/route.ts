import { route } from '@/server/assignments';
import { createSupportPlan } from '@/server/support-plans';

// POST { message? }: the course's teacher (or an admin) makes a study plan for this flag's student.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => createSupportPlan((await params).id, user, await req.json().catch(() => ({}))));
