import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { feePlanAction } from '@/server/fees';

// One fee plan (Stage 5 · B15.2). POST { action: 'issue' } bills every student it's for who hasn't got its bills yet; 'archive' / 'unarchive'.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => {
  const id = (await params).id;
  const b = await req.json().catch(() => ({}));
  const out = await feePlanAction(user, id, b);
  if ('issued' in out) audit(user, { action: 'fees.plan_issued', summary: `Issued ${out.issued} fee bill${out.issued === 1 ? '' : 's'}`, targetType: 'fee-plan', targetId: id }, req);
  return out;
});
