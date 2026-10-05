import { route } from '@/server/assignments';
import { updateSupportPlan } from '@/server/support-plans';

// PATCH: the student ticks a step { step, done }; the teacher closes the follow-up
// { followUpDone: true } or cancels the plan { cancel: true }.
export const PATCH = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => updateSupportPlan((await params).id, user, await req.json().catch(() => ({}))));
