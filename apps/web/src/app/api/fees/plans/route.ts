import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { createFeePlan, feePlans, money } from '@/server/fees';

// School fees (Stage 5 · B15.2; src/server/fees.ts). GET: fee plans with what they billed and collected.
// POST { name, courseId?, currency, items, instalments }: a new plan (issued separately).
export const GET = (req: Request) => route(req, (user) => feePlans(user));
export const POST = (req: Request) => route(req, async (user) => {
  const plan = await createFeePlan(user, await req.json().catch(() => ({})));
  audit(user, { action: 'fees.plan_created', summary: `Made the fee plan “${plan.name}” (${money(plan.total, plan.currency)})`, targetType: 'fee-plan', targetId: plan.id }, req);
  return plan;
});
