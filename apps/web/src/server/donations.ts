import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { cleanPan, cleanReg80G, offers80G, receiptLabel } from '@/lib/global-impact';
import type { Body } from './body';
import { notify } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';

// Donations to NGO projects (Stage 5 · Q16). Paid by card through Stripe Checkout (src/server/donate.ts
// starts one; src/server/payments/provider.ts confirms it with Stripe and calls donationPaid). The
// money reaches the school's Stripe account, which passes it on to the NGO; the receipt says so.
// India: an 80G section on the receipt when the NGO has its 80G number and PAN and the gift is in
// rupees; the deduction itself needs the NGO's Form 10BE, which the receipt points out.

/** The payment for a donation went through: number its receipt and thank the donor (once). */
export async function donationPaid(orderId: string, at: Date) {
  const d = await prisma.donation.findUnique({ where: { orderId }, select: { id: true, status: true, donorId: true, projectName: true, ngoName: true } });
  if (!d || d.status === 'PAID') return;
  // Receipt numbers run 1, 2, 3…: two at once both try the next one and one retries.
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await prisma.donation.findFirst({ where: { receiptNo: { not: null } }, orderBy: { receiptNo: 'desc' }, select: { receiptNo: true } });
    try {
      const { count } = await prisma.donation.updateMany({ where: { id: d.id, status: 'PENDING' }, data: { status: 'PAID', paidAt: at, receiptNo: (last?.receiptNo ?? 0) + 1 } });
      if (!count) return;
      break;
    } catch (e) {
      if (attempt === 4 || !/unique/i.test(String((e as Error).message))) throw e;
    }
  }
  if (d.donorId) await notify(d.donorId, { type: 'payment', title: `Thank you for supporting ${d.projectName}`, body: `Your donation to ${d.ngoName} went through. Your receipt is in My donations.`, link: '/donations', email: false });
}

/** A refunded donation's payment: the donation shows as refunded (its receipt says so). */
export async function donationRefunded(orderId: string) {
  await prisma.donation.updateMany({ where: { orderId, status: 'PAID' }, data: { status: 'REFUNDED' } });
}

/** GET /api/impact/donations: my donations, newest first. */
export async function myDonations(user: SessionUser) {
  const rows = await prisma.donation.findMany({
    where: { donorId: user.id, status: { in: ['PAID', 'REFUNDED'] } }, orderBy: { paidAt: 'desc' }, take: 100,
    select: { id: true, projectName: true, ngoName: true, amount: true, currency: true, status: true, receiptNo: true, paidAt: true, anonymous: true, reg80G: true, pan: true },
  });
  return { donations: rows.map(({ reg80G, pan, receiptNo, ...r }) => ({ ...r, receipt: receiptNo ? receiptLabel(receiptNo) : null, with80G: !!reg80G && !!pan && r.currency === 'INR' })) };
}

/** GET /api/impact/donations?projectId=: how much a project has been given, and by whom (names only if they agreed). */
export async function projectSupport(projectId: string) {
  const rows = await prisma.donation.findMany({
    where: { projectId, status: 'PAID' }, orderBy: { paidAt: 'desc' }, take: 500,
    select: { amount: true, currency: true, donorName: true, anonymous: true, donorId: true },
  });
  const raised: Record<string, number> = {};
  for (const r of rows) raised[r.currency] = (raised[r.currency] ?? 0) + r.amount;
  const donors = new Set(rows.map((r) => r.donorId ?? r.donorName)).size;
  const named = [...new Set(rows.filter((r) => !r.anonymous).map((r) => r.donorName.split(/\s+/)[0]))].slice(0, 8);
  return { raised, donors, supporters: named };
}

/** GET /api/impact/donations/[id]: a receipt, for the donor and admins. */
export async function donationReceipt(user: SessionUser, id: string) {
  const d = await prisma.donation.findUnique({ where: { id } });
  if (!d || (d.donorId !== user.id && user.role !== 'ADMIN') || !d.receiptNo || !d.paidAt) throw new NotFoundException('Receipt not found.');
  const order = d.orderId ? await prisma.paymentOrder.findUnique({ where: { id: d.orderId }, select: { paymentRef: true, provider: true, organization: { select: { name: true } } } }) : null;
  const tax = offers80G(d.currency, { reg80G: d.reg80G, pan: d.ngoPan });
  return {
    number: receiptLabel(d.receiptNo), status: d.status, paidAt: d.paidAt,
    amount: d.amount, currency: d.currency, project: d.projectName, ngo: d.ngoName,
    donor: { name: d.donorName, email: d.donorEmail, pan: d.pan, address: d.address },
    collectedBy: order?.organization?.name ?? 'UniVerse',
    payment: { method: 'Card (Stripe)', reference: order?.paymentRef ?? null },
    tax80G: tax ? { ngoPan: d.ngoPan, reg80G: d.reg80G, donorPanGiven: !!d.pan } : null,
  };
}

// ── Admins ───────────────────────────────────────────────────────────────

const adminOnly = (user: SessionUser) => { if (user.role !== 'ADMIN') throw new ForbiddenException('Admins only.'); };

/** GET /api/admin/donations: every NGO's donation settings and totals, and the latest donations. */
export async function adminDonations(user: SessionUser) {
  adminOnly(user);
  const [ngos, rows, totals] = await Promise.all([
    prisma.nGO.findMany({ orderBy: { name: 'asc' }, take: 200, select: { id: true, name: true, donationsOn: true, reg80G: true, pan: true, isVerified: true, _count: { select: { projects: true } } } }),
    prisma.donation.findMany({
      where: { status: { in: ['PAID', 'REFUNDED'] } }, orderBy: { paidAt: 'desc' }, take: 500,
      select: { id: true, receiptNo: true, paidAt: true, status: true, amount: true, currency: true, projectName: true, ngoName: true, ngoId: true, donorName: true, donorEmail: true, pan: true, address: true, anonymous: true },
    }),
    prisma.donation.groupBy({ by: ['ngoId', 'currency'], where: { status: 'PAID' }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  return {
    ngos: ngos.map((n) => ({ ...n, projects: n._count.projects, _count: undefined, raised: totals.filter((t) => t.ngoId === n.id).map((t) => ({ currency: t.currency, amount: t._sum.amount ?? 0, count: t._count._all })) })),
    donations: rows.map((r) => ({ ...r, receipt: r.receiptNo ? receiptLabel(r.receiptNo) : null })),
  };
}

/** PATCH /api/admin/donations { ngoId, donationsOn?, reg80G?, pan? }: an NGO's donation settings. */
export async function saveNgoDonationSettings(user: SessionUser, b: Body) {
  adminOnly(user);
  const ngoId = typeof b.ngoId === 'string' ? b.ngoId : '';
  if (!(await prisma.nGO.findUnique({ where: { id: ngoId }, select: { id: true } }))) throw new NotFoundException('NGO not found.');
  const data: { donationsOn?: boolean; reg80G?: string | null; pan?: string | null } = {};
  if (typeof b.donationsOn === 'boolean') data.donationsOn = b.donationsOn;
  if ('reg80G' in b) {
    const v = b.reg80G === null || b.reg80G === '' ? null : cleanReg80G(b.reg80G);
    if (b.reg80G && !v) throw new BadRequestException('That doesn’t look like an 80G registration number (letters, digits, / and -).');
    data.reg80G = v;
  }
  if ('pan' in b) {
    const v = b.pan === null || b.pan === '' ? null : cleanPan(b.pan);
    if (b.pan && !v) throw new BadRequestException('A PAN is 5 letters, 4 digits and a letter, like AAATA1234A.');
    data.pan = v;
  }
  await prisma.nGO.update({ where: { id: ngoId }, data });
  return adminDonations(user);
}

