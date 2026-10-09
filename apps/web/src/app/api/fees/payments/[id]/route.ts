import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { voidFeePayment } from '@/server/fees';

// One fee payment (Stage 5 · B15.2). POST { reason }: void it (kept, crossed out).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => {
  const id = (await params).id;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await voidFeePayment(user, id, b);
  audit(user, { action: 'fees.payment_voided', summary: `Voided a fee payment: ${String(b.reason ?? '').slice(0, 120)}`, targetType: 'fee-payment', targetId: id }, req);
  return out;
});
