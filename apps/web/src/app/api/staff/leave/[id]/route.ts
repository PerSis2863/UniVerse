import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { decideLeave } from '@/server/staff';

// Decide on a leave request (Stage 5 · B15.8). POST { action: 'approve' | 'decline', note? }. Needs staff.manage.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => {
  const id = (await params).id;
  const out = await decideLeave(user, id, await req.json().catch(() => ({})));
  audit(user, { action: `staff.leave_${out.status.toLowerCase()}`, summary: `Leave ${out.status.toLowerCase()}`, targetType: 'staff-leave', targetId: id }, req);
  return out;
});
