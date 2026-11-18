import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { footprint, readFootprint } from '@/lib/green-plus';
import { budgetState, FAIR_SHARE_KG_MONTH, monthPlan } from '@/lib/carbon-budget';
import { BadRequestException } from './http';
import type { Body } from './body';

// M319: a monthly carbon budget with a forecast (Green → Goals). The month's footprint is a twelfth of the
// person's latest footprint (M216) with home energy from this month's bills (M317) when there are any,
// less the CO₂ their confirmed actions saved this month; where it ends at this rate, against the budget.

/** GET /green/budget */
export async function greenBudget(u: SessionUser) {
  const now = new Date();
  const month = now.toISOString().slice(0, 7), monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [home, last, bills, saved] = await Promise.all([
    prisma.greenHome.findUnique({ where: { userId: u.id }, select: { budgetKg: true, people: true } }),
    prisma.greenFootprint.findFirst({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, select: { answers: true } }),
    prisma.greenBill.aggregate({ where: { userId: u.id, month }, _sum: { kg: true }, _count: { _all: true } }),
    prisma.greenAction.aggregate({ where: { userId: u.id, verifiedAt: { not: null }, createdAt: { gte: monthStart } }, _sum: { co2Kg: true } }),
  ]);
  let parts = null;
  if (last) { try { parts = footprint(readFootprint(JSON.parse(last.answers))).parts; } catch { parts = null; } }
  // Bills are the household's: each person's share.
  const billsKg = bills._count._all ? (bills._sum.kg ?? 0) / Math.max(1, home?.people ?? 1) : null;
  const plan = monthPlan({ parts, billsKg, savedKg: saved._sum.co2Kg ?? 0, now });
  const budget = home?.budgetKg ?? null;
  return {
    budget, plan, state: plan && budget ? budgetState(plan.forecast, budget) : null,
    suggestions: { fairShare: FAIR_SHARE_KG_MONTH, footprint: parts ? Math.round((parts.reduce((s, p) => s + p.kg, 0) / 12) * 0.9) : null },
  };
}

/** PUT /green/budget { kg } (null or 0 removes it) */
export async function setGreenBudget(u: SessionUser, b: Body) {
  const kg = b.kg === null || b.kg === 0 ? null : Number(b.kg);
  if (kg !== null && (!Number.isFinite(kg) || kg < 10 || kg > 20_000)) throw new BadRequestException('Set a budget between 10 and 20,000 kg a month.');
  await prisma.greenHome.upsert({ where: { userId: u.id }, create: { userId: u.id, budgetKg: kg === null ? null : Math.round(kg) }, update: { budgetKg: kg === null ? null : Math.round(kg) } });
  return greenBudget(u);
}
