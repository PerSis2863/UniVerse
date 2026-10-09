import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { feeInvoice, feeInvoiceAction } from '@/server/fees';

// One fee bill (Stage 5 · B15.2). GET: the bill, payments and the student's parents.
// POST { action: 'pay' | 'discount' | 'due' | 'waive' | 'cancel' | 'reopen', … }.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => feeInvoice(user, (await params).id));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => {
  const id = (await params).id;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await feeInvoiceAction(user, id, b);
  const action = typeof b.action === 'string' ? b.action : '';
  const summary = action === 'pay' && 'receipt' in out ? `Recorded a fee payment (receipt #${out.receipt})` : `Fee bill: ${action}`;
  audit(user, { action: `fees.bill_${action}`, summary, targetType: 'fee-bill', targetId: id }, req);
  return out;
});
