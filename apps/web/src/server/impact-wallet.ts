import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BADGES, GREEN_FACTORS, streak, type GreenKind } from '@/lib/green';
import { WALLET_WEEKS, newest, weekly, worth, type WalletEvent } from '@/lib/impact-wallet';

// GET /hub/wallet: the Impact Wallet (src/lib/impact-wallet.ts). Everything here is the asker's own:
// UniVersity's impact points (volunteering and projects, impact_points), Trace points per brand
// (trace_points), the people they helped through Relief and the CO₂ they saved with Green, plus one
// history across the apps.

const WEEK = 7 * 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;

export async function impactWallet(u: SessionUser) {
  const now = Date.now(), since = new Date(now - WALLET_WEEKS * WEEK);
  const [impact, impactSum, courses, sums, points, helped, received, green] = await Promise.all([
    prisma.impactPoint.findMany({ where: { userId: u.id, awardedAt: { gte: since } }, orderBy: { awardedAt: 'desc' }, take: 500, select: { points: true, reason: true, awardedAt: true } }),
    prisma.impactPoint.aggregate({ where: { userId: u.id }, _sum: { points: true } }),
    prisma.enrollment.count({ where: { studentId: u.id } }),
    prisma.tracePoint.groupBy({ by: ['brandId'], where: { userId: u.id }, _sum: { points: true } }),
    prisma.tracePoint.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 200, select: { brandId: true, kind: true, points: true, createdAt: true } }),
    prisma.reliefPost.findMany({ where: { helperId: u.id, status: 'DONE' }, orderBy: { doneAt: 'desc' }, take: 500, select: { title: true, people: true, doneAt: true } }),
    prisma.reliefPost.count({ where: { userId: u.id, type: 'NEED', status: 'DONE' } }),
    prisma.greenAction.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 5000, select: { kind: true, amount: true, co2Kg: true, createdAt: true } }),
  ]);
  const brands = sums.length || points.length
    ? await prisma.traceBrand.findMany({ where: { id: { in: [...new Set([...sums.map((s) => s.brandId), ...points.map((p) => p.brandId)])] } }, select: { id: true, name: true, pointValue: true, currency: true } })
    : [];
  const brand = (id: string) => brands.find((b) => b.id === id);
  const balances = sums.map((s) => ({ points: s._sum.points ?? 0, pointValue: brand(s.brandId)?.pointValue ?? 0, currency: brand(s.brandId)?.currency ?? 'EUR' }));

  const byKind: Partial<Record<GreenKind, number>> = {};
  for (const a of green) byKind[a.kind as GreenKind] = (byKind[a.kind as GreenKind] ?? 0) + a.amount;
  const kg = green.reduce((s, a) => s + a.co2Kg, 0);
  const greenTotals = { actions: green.length, kg, byKind, streak: streak(green.map((a) => a.createdAt.toISOString().slice(0, 10)), new Date(now).toISOString().slice(0, 10)) };
  const recent = (d: Date | null) => !!d && d >= since;

  const events: WalletEvent[] = [
    ...impact.slice(0, 30).map((c) => ({ app: 'campus' as const, at: c.awardedAt.toISOString(), text: c.reason, amount: `${c.points > 0 ? '+' : ''}${c.points} impact pts` })),
    ...points.slice(0, 30).map((p) => ({ app: 'trace' as const, at: p.createdAt.toISOString(), text: `${p.kind === 'SCAN' ? 'Scanned' : p.kind === 'CAMPAIGN' ? 'Campaign bonus' : p.kind === 'CASHOUT' ? 'Cashed out' : 'Points back'} · ${brand(p.brandId)?.name ?? 'a brand'}`, amount: `${p.points > 0 ? '+' : ''}${p.points} pts` })),
    ...helped.slice(0, 30).filter((h) => h.doneAt).map((h) => ({ app: 'relief' as const, at: h.doneAt!.toISOString(), text: `Delivered: ${h.title}`, amount: `${h.people} helped` })),
    ...green.slice(0, 30).map((a) => ({ app: 'green' as const, at: a.createdAt.toISOString(), text: GREEN_FACTORS[a.kind as GreenKind]?.label ?? 'Climate action', amount: `${r1(a.co2Kg)} kg CO₂` })),
  ];

  return {
    campus: {
      points: impactSum._sum.points ?? 0, courses,
      weeks: weekly(impact.filter((c) => c.points > 0).map((c) => ({ at: c.awardedAt.getTime(), v: c.points })), now),
    },
    trace: {
      points: balances.reduce((s, b) => s + b.points, 0), brands: balances.filter((b) => b.points > 0).length, worth: worth(balances),
      weeks: weekly(points.filter((p) => recent(p.createdAt) && p.points > 0).map((p) => ({ at: p.createdAt.getTime(), v: p.points })), now),
    },
    relief: {
      people: helped.reduce((s, h) => s + h.people, 0), deliveries: helped.length, received,
      weeks: weekly(helped.filter((h) => recent(h.doneAt)).map((h) => ({ at: h.doneAt!.getTime(), v: h.people })), now),
    },
    green: {
      kg: r1(kg), actions: green.length, streak: greenTotals.streak, badges: BADGES.filter((b) => b.earned(greenTotals)).length, badgesOf: BADGES.length,
      weeks: weekly(green.filter((a) => recent(a.createdAt)).map((a) => ({ at: a.createdAt.getTime(), v: a.co2Kg })), now),
    },
    events: newest(events),
  };
}
