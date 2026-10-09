import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { remindOverdue } from '@/server/fees';

// Gentle in-app reminders for overdue fee bills (Stage 5 · B15.2). POST { invoiceIds? }.
export const POST = (req: Request) => route(req, async (user) => {
  const out = await remindOverdue(user, await req.json().catch(() => ({})));
  if (out.reminded) audit(user, { action: 'fees.reminded', summary: `Reminded families about ${out.reminded} overdue fee bill${out.reminded === 1 ? '' : 's'}` }, req);
  return out;
});
