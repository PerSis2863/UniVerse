import prisma from '@/lib/db';
import { planLimits } from '@/lib/plan-limits';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';
import { pushService } from './services/push.service';
import { can, need } from './permissions';

// School fees (Stage 5 · B15.2). An admin makes a fee plan for one class or every student (items,
// currency, instalments with due dates) and issues it: one bill per student per instalment, in one
// statement per instalment however many students. A bill can get a discount (sibling, scholarship)
// or be waived or cancelled. Payments are recorded at the office (cash, bank, cheque, UPI, card),
// each with a numbered receipt; a wrong one is voided with a reason, never deleted, and a bill's
// paid total is always recomputed from its payments. Overdue bills can be reminded gently in the
// app (parents if linked, else the student; at most every 3 days a bill; never email). Parents see
// their children's bills and receipts in the parent app, students their own. Paying online needs
// the owner's payment account (Stripe exists; UPI/Razorpay doesn't yet), so it isn't switched on.
// Amounts are whole minor units (paise, cents).

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'ZAR', 'KES', 'NGN'] as const;
export const METHODS = ['CASH', 'BANK', 'CHEQUE', 'UPI', 'CARD', 'OTHER'] as const;
const MAX_ITEMS = 20, MAX_INSTALMENTS = 12, MAX_MINOR = 10_000_000_000; // 100 million in major units
const REMIND_EVERY_MS = 3 * 86_400_000;
const OPEN = ['DUE', 'PARTIAL'];

export interface FeeItem { label: string; amount: number }
export interface Instalment { label: string; dueAt: string; amount: number }

const dbNow = () => new Date().toISOString().replace('Z', '+00:00');
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
export const money = (minor: number, currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
/** "12.5" or 12.5 (major units) → 1250; null when it isn't a sensible amount. */
export function toMinor(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/,/g, '')) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const m = Math.round(n * 100);
  return m <= MAX_MINOR ? m : null;
}
/** Splits a total into n instalments of whole minor units; the first takes what doesn't divide. */
export function split(total: number, n: number) {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? total - base * n : 0));
}
/** A bill's status from its sums (waived and cancelled bills keep theirs). */
export function statusOf(b: { amount: number; discount: number; paid: number; status?: string }) {
  if (b.status === 'WAIVED' || b.status === 'CANCELLED') return b.status;
  const owed = Math.max(0, b.amount - b.discount);
  return b.paid >= owed ? 'PAID' : b.paid > 0 ? 'PARTIAL' : 'DUE';
}
export const outstanding = (b: { amount: number; discount: number; paid: number; status: string }) =>
  OPEN.includes(b.status) ? Math.max(0, b.amount - b.discount - b.paid) : 0;

export function parseItems(v: unknown): FeeItem[] {
  if (!Array.isArray(v) || !v.length) throw new BadRequestException('Add at least one fee item.');
  if (v.length > MAX_ITEMS) throw new BadRequestException(`Up to ${MAX_ITEMS} items.`);
  return v.map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, 80) : '';
    const amount = toMinor(r.amount);
    if (!label) throw new BadRequestException('Give every item a name.');
    if (!amount) throw new BadRequestException(`Give “${label}” an amount.`);
    return { label, amount };
  });
}

/** Instalments with their share of the total (equal shares unless amounts are given and add up). */
export function parseInstalments(v: unknown, total: number, now = Date.now()): Instalment[] {
  if (!Array.isArray(v) || !v.length) throw new BadRequestException('Add at least one due date.');
  if (v.length > MAX_INSTALMENTS) throw new BadRequestException(`Up to ${MAX_INSTALMENTS} instalments.`);
  const rows = v.map((x, i) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const day = typeof r.dueAt === 'string' ? r.dueAt.slice(0, 10) : '';
    const due = new Date(`${day}T23:59:59Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(due.getTime())) throw new BadRequestException(`Instalment ${i + 1} needs a due date.`);
    if (due.getTime() < now - 366 * 86_400_000) throw new BadRequestException(`Instalment ${i + 1}’s due date is more than a year ago.`);
    const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 60) : v.length === 1 ? 'Full amount' : `Instalment ${i + 1}`;
    return { label, dueAt: due.toISOString(), amount: toMinor(r.amount) };
  });
  const given = rows.every((r) => r.amount != null && r.amount > 0) && rows.reduce((s, r) => s + (r.amount ?? 0), 0) === total;
  const shares = given ? rows.map((r) => r.amount!) : split(total, rows.length);
  return rows.map((r, i) => ({ label: r.label, dueAt: r.dueAt, amount: shares[i] })).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

const planShape = (p: { items: string; instalments: string }) => ({ items: JSON.parse(p.items) as FeeItem[], instalments: JSON.parse(p.instalments) as Instalment[] });

// ── Plans ───────────────────────────────────────────────────────────────────────────────────

/** GET /api/fees/plans: every plan with how much it billed and collected; the classes to pick from. */
export async function feePlans(user: SessionUser) {
  await need(user, 'fees.view');
  const [plans, courses, sums] = await Promise.all([
    prisma.feePlan.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, name: true, courseId: true, currency: true, items: true, instalments: true, archivedAt: true, createdAt: true, course: { select: { code: true, name: true } } } }),
    prisma.course.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 300 }),
    prisma.$queryRawUnsafe<{ planId: string; n: number; billed: number; discount: number; paid: number; open: number; overdue: number }[]>(
      `SELECT "planId", COUNT(*) AS n, SUM(amount) AS billed, SUM(discount) AS discount, SUM(paid) AS paid,
              SUM(CASE WHEN status IN ('DUE','PARTIAL') THEN amount - discount - paid ELSE 0 END) AS open,
              SUM(CASE WHEN status IN ('DUE','PARTIAL') AND "dueAt" < ? THEN amount - discount - paid ELSE 0 END) AS overdue
       FROM fee_invoices WHERE "planId" IS NOT NULL AND status != 'CANCELLED' GROUP BY "planId"`, dbNow()),
  ]);
  return {
    currencies: CURRENCIES,
    courses,
    plans: plans.map((p) => {
      const s = sums.find((x) => x.planId === p.id);
      return {
        id: p.id, name: p.name, currency: p.currency, archived: !!p.archivedAt, createdAt: p.createdAt, ...planShape(p),
        to: p.course ? `${p.course.code} · ${p.course.name}` : p.courseId ? 'A removed class' : 'Every student', courseId: p.courseId,
        bills: Number(s?.n ?? 0), billed: Number(s?.billed ?? 0) - Number(s?.discount ?? 0), paid: Number(s?.paid ?? 0), open: Number(s?.open ?? 0), overdue: Number(s?.overdue ?? 0),
      };
    }),
  };
}

/** POST /api/fees/plans { name, courseId?, currency, items: [{label, amount}], instalments: [{label?, dueAt, amount?}] } */
export async function createFeePlan(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'fees.manage');
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 100) : '';
  if (!name) throw new BadRequestException('Give the plan a name, like “Term 1 2026”.');
  const currency = CURRENCIES.find((c) => c === b.currency);
  if (!currency) throw new BadRequestException('Choose a currency.');
  const courseId = typeof b.courseId === 'string' && b.courseId ? b.courseId : null;
  if (courseId && !(await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }))) throw new NotFoundException('That class doesn’t exist.');
  const items = parseItems(b.items);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const instalments = parseInstalments(b.instalments, total);
  const plan = await prisma.feePlan.create({ data: { name, courseId, currency, items: JSON.stringify(items), instalments: JSON.stringify(instalments), createdById: user.id }, select: { id: true, name: true } });
  return { ...plan, total, currency };
}

/** Who a plan bills: a class's students (not suspended), or every active student. */
const target = (courseId: string | null) => courseId
  ? { sql: `u.id IN (SELECT "studentId" FROM enrollments WHERE "courseId" = ?) AND u.status != 'SUSPENDED'`, args: [courseId] }
  : { sql: `u.role = 'STUDENT' AND u.status = 'ACTIVE'`, args: [] as string[] };

/**
 * POST /api/fees/plans/:id { action: 'issue' | 'archive' | 'unarchive' }. Issuing bills every student
 * the plan is for who hasn't got its bills yet (so it also catches students who joined later).
 */
export async function feePlanAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, 'fees.manage');
  const plan = await prisma.feePlan.findUnique({ where: { id }, select: { id: true, name: true, courseId: true, currency: true, items: true, instalments: true, archivedAt: true } });
  if (!plan) throw new NotFoundException('That fee plan doesn’t exist.');
  if (b.action === 'archive' || b.action === 'unarchive') {
    await prisma.feePlan.update({ where: { id }, data: { archivedAt: b.action === 'archive' ? new Date() : null } });
    return { archived: b.action === 'archive' };
  }
  if (b.action !== 'issue') throw new BadRequestException('Unknown action.');
  if (plan.archivedAt) throw new BadRequestException('Unarchive the plan to issue it.');
  const { instalments } = planShape(plan);
  const t = target(plan.courseId);
  const now = dbNow();
  let issued = 0;
  for (const [i, inst] of instalments.entries()) {
    const label = instalments.length === 1 ? plan.name : `${plan.name} · ${inst.label}`;
    // One statement per instalment: numbered after the last bill, skipping students who have it.
    issued += await prisma.$executeRawUnsafe(
      `INSERT INTO fee_invoices (id, seq, "planId", instalment, "studentId", label, currency, amount, discount, paid, "dueAt", status, "createdAt")
       SELECT lower(hex(randomblob(12))), (SELECT COALESCE(MAX(seq), 0) FROM fee_invoices) + ROW_NUMBER() OVER (ORDER BY u.name, u.id),
              ?, ?, u.id, ?, ?, ?, 0, 0, ?, 'DUE', ?
       FROM users u
       WHERE ${t.sql} AND NOT EXISTS (SELECT 1 FROM fee_invoices f WHERE f."planId" = ? AND f.instalment = ? AND f."studentId" = u.id)`,
      plan.id, i + 1, label.slice(0, 160), plan.currency, inst.amount, inst.dueAt.replace('Z', '+00:00'), now, ...t.args, plan.id, i + 1,
    );
  }
  return { issued };
}

// ── Bills ───────────────────────────────────────────────────────────────────────────────────

const invoiceSelect = {
  id: true, seq: true, planId: true, instalment: true, label: true, currency: true, amount: true, discount: true, discountNote: true, paid: true, dueAt: true, status: true, remindedAt: true, createdAt: true,
  student: { select: { id: true, name: true, email: true } },
  plan: { select: { name: true, course: { select: { code: true } } } },
} as const;
type InvoiceRow = { amount: number; discount: number; paid: number; status: string; dueAt: Date };
const shapeInvoice = <T extends InvoiceRow>(x: T, now = Date.now()) => ({ ...x, owed: outstanding(x), overdue: outstanding(x) > 0 && x.dueAt.getTime() < now });

/** GET /api/fees/invoices?planId=&status=&overdue=1&q=: up to 300 bills, newest first, with totals for what's shown. */
export async function feeInvoices(user: SessionUser, q: URLSearchParams) {
  await need(user, 'fees.view');
  const planId = q.get('planId') || undefined;
  const status = q.get('status');
  const overdue = q.get('overdue') === '1';
  const text = (q.get('q') ?? '').trim().slice(0, 60);
  const seq = /^#?\d{1,9}$/.test(text) ? Number(text.replace('#', '')) : null;
  const where = {
    ...(planId ? { planId } : {}),
    ...(overdue ? { status: { in: OPEN }, dueAt: { lt: new Date() } } : status && ['DUE', 'PARTIAL', 'PAID', 'WAIVED', 'CANCELLED'].includes(status) ? { status } : { status: { not: 'CANCELLED' } }),
    ...(seq ? { seq } : text ? { student: { OR: [{ name: { contains: text } }, { email: { contains: text } }] } } : {}),
  };
  const rows = await prisma.feeInvoice.findMany({ where, orderBy: overdue ? { dueAt: 'asc' } : { seq: 'desc' }, take: 300, select: invoiceSelect });
  const now = Date.now();
  const list = rows.map((r) => shapeInvoice(r, now));
  return { invoices: list, shown: list.length, owed: list.reduce((s, r) => s + r.owed, 0), currencies: [...new Set(list.map((r) => r.currency))] };
}

async function invoiceFor(id: string) {
  const inv = await prisma.feeInvoice.findUnique({ where: { id }, select: { ...invoiceSelect, payments: { orderBy: { paidAt: 'asc' }, select: { id: true, seq: true, amount: true, method: true, reference: true, note: true, paidAt: true, voidedAt: true, voidReason: true, receivedBy: { select: { name: true } } } } } });
  if (!inv) throw new NotFoundException('That bill doesn’t exist.');
  return inv;
}

/** GET /api/fees/invoices/:id: the bill, its payments, and the student's parents (to know who to talk to). */
export async function feeInvoice(user: SessionUser, id: string) {
  await need(user, 'fees.view');
  const inv = await invoiceFor(id);
  const parents = await prisma.guardianLink.findMany({ where: { studentId: inv.student.id }, select: { relation: true, guardian: { select: { name: true, email: true } } }, take: 6 });
  return { invoice: shapeInvoice(inv), parents: parents.map((p) => ({ name: p.guardian.name, email: p.guardian.email, relation: p.relation })) };
}

/** Recomputes a bill's paid total from its payments and its status from that (one statement). */
async function sync(id: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE fee_invoices SET paid = (SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE "invoiceId" = ?1 AND "voidedAt" IS NULL),
       status = CASE WHEN status IN ('WAIVED', 'CANCELLED') THEN status
                     WHEN (SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE "invoiceId" = ?1 AND "voidedAt" IS NULL) >= MAX(0, amount - discount) THEN 'PAID'
                     WHEN (SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE "invoiceId" = ?1 AND "voidedAt" IS NULL) > 0 THEN 'PARTIAL' ELSE 'DUE' END
     WHERE id = ?1`, id);
}

/**
 * POST /api/fees/invoices/:id. { action: 'pay', amount, method, reference?, paidAt?, note? } records a
 * payment (up to what's owed) with the next receipt number; 'discount' { amount, note }, 'due'
 * { dueAt }, 'waive' { note }, 'cancel', 'reopen' change the bill.
 */
export async function feeInvoiceAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, 'fees.manage');
  const inv = await invoiceFor(id);
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null;
  switch (b.action) {
    case 'pay': {
      if (!OPEN.includes(inv.status)) throw new BadRequestException(inv.status === 'PAID' ? 'This bill is already paid.' : 'Reopen the bill to record a payment.');
      const amount = toMinor(b.amount);
      const owed = outstanding(inv);
      if (!amount) throw new BadRequestException('Enter the amount paid.');
      if (amount > owed) throw new BadRequestException(`That’s more than what’s owed (${money(owed, inv.currency)}).`);
      const method = METHODS.find((m) => m === b.method);
      if (!method) throw new BadRequestException('Choose how it was paid.');
      const paidAt = typeof b.paidAt === 'string' && b.paidAt ? new Date(/T/.test(b.paidAt) ? b.paidAt : `${b.paidAt}T12:00:00Z`) : new Date();
      if (!Number.isFinite(paidAt.getTime()) || paidAt.getTime() > Date.now() + 86_400_000) throw new BadRequestException('That payment date doesn’t look right.');
      const reference = typeof b.reference === 'string' ? b.reference.trim().slice(0, 80) || null : null;
      const paymentId = `fp${crypto.randomUUID().replace(/-/g, '').slice(0, 22)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO fee_payments (id, seq, "invoiceId", amount, method, reference, note, "paidAt", "receivedById", "createdAt")
         VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM fee_payments), ?, ?, ?, ?, ?, ?, ?, ?)`,
        paymentId, id, amount, method, reference, note, paidAt.toISOString().replace('Z', '+00:00'), user.id, dbNow(),
      );
      await sync(id);
      const [after, receipt] = await Promise.all([
        prisma.feeInvoice.findUnique({ where: { id }, select: { status: true, paid: true } }),
        prisma.feePayment.findUnique({ where: { id: paymentId }, select: { seq: true } }),
      ]);
      await tellFamily(inv.student.id, { title: `Payment received: ${money(amount, inv.currency)}`, body: `${inv.label} · receipt #${receipt?.seq ?? ''}${after?.status === 'PAID' ? ' · paid in full' : ''}`, tag: `fee-${id}` });
      return { paymentId, receipt: receipt?.seq ?? null, status: after?.status, paid: after?.paid };
    }
    case 'discount': {
      const amount = toMinor(b.amount);
      if (amount == null || amount > inv.amount) throw new BadRequestException('The discount can’t be more than the bill.');
      if (amount > 0 && !note) throw new BadRequestException('Say why (for example “sibling discount”).');
      if (inv.paid > inv.amount - amount) throw new BadRequestException('More has been paid than the bill would be after this discount. Void a payment first.');
      await prisma.feeInvoice.update({ where: { id }, data: { discount: amount, discountNote: amount ? note : null } });
      await sync(id);
      return { discount: amount };
    }
    case 'due': {
      const day = typeof b.dueAt === 'string' ? b.dueAt.slice(0, 10) : '';
      const due = new Date(`${day}T23:59:59Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(due.getTime())) throw new BadRequestException('Choose a due date.');
      await prisma.feeInvoice.update({ where: { id }, data: { dueAt: due, remindedAt: null } });
      return { dueAt: due };
    }
    case 'waive':
    case 'cancel': {
      if (inv.status === 'PAID') throw new BadRequestException('This bill is paid. Void its payments first.');
      if (b.action === 'cancel' && inv.payments.some((p) => !p.voidedAt)) throw new BadRequestException('This bill has payments. Void them first, or waive what’s left.');
      if (b.action === 'waive' && !note) throw new BadRequestException('Say why it’s waived.');
      await prisma.feeInvoice.update({ where: { id }, data: { status: b.action === 'waive' ? 'WAIVED' : 'CANCELLED', discountNote: b.action === 'waive' ? note : inv.discountNote } });
      return { status: b.action === 'waive' ? 'WAIVED' : 'CANCELLED' };
    }
    case 'reopen': {
      if (!['WAIVED', 'CANCELLED'].includes(inv.status)) throw new BadRequestException('This bill is open.');
      await prisma.feeInvoice.update({ where: { id }, data: { status: 'DUE' } });
      await sync(id);
      return { reopened: true };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}

/** POST /api/fees/payments/:id { reason }: voids a payment recorded by mistake (kept, crossed out, with the reason). */
export async function voidFeePayment(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, 'fees.manage');
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 200) : '';
  if (!reason) throw new BadRequestException('Say why the payment is voided.');
  const p = await prisma.feePayment.findUnique({ where: { id }, select: { invoiceId: true, voidedAt: true } });
  if (!p) throw new NotFoundException('That payment doesn’t exist.');
  if (p.voidedAt) throw new BadRequestException('That payment is already voided.');
  await prisma.feePayment.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
  await sync(p.invoiceId);
  return { voided: true };
}

// ── Overdue and reminders ───────────────────────────────────────────────────────────────────

/** In the app (and a push) for a student's family: their parents if any are linked, else the student. */
async function tellFamily(studentId: string, n: { title: string; body: string; tag: string }) {
  const parents = (await prisma.guardianLink.findMany({ where: { studentId }, select: { guardianId: true }, take: 6 })).map((p) => p.guardianId);
  const to = parents.length ? parents : [studentId];
  await prisma.notification.createMany({ data: to.map((userId) => ({ userId, title: n.title.slice(0, 200), body: n.body.slice(0, 1000), type: 'fees', link: parents.length ? '/parent' : '/student/administrative/accounting' })) });
  publish(to, { type: 'notification' });
  await pushService.sendToMany(to, { title: n.title, body: n.body, url: parents.length ? '/parent' : '/student/administrative/accounting', tag: n.tag }).catch(() => 0);
}

/**
 * POST /api/fees/remind { invoiceIds?: string[] }: a gentle reminder for overdue bills (the ones
 * given, else every overdue one), each bill at most every 3 days, 60 bills at a time (a few
 * hundred notifications: within D1's 50 statements a request). `left`: overdue bills still to remind.
 */
export async function remindOverdue(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'fees.manage');
  const ids = Array.isArray(b.invoiceIds) ? b.invoiceIds.filter((x): x is string => typeof x === 'string').slice(0, 60) : null;
  const remindable = { ...(ids ? { id: { in: ids } } : {}), status: { in: OPEN }, dueAt: { lt: new Date() }, OR: [{ remindedAt: null }, { remindedAt: { lt: new Date(Date.now() - REMIND_EVERY_MS) } }] };
  const due = await prisma.feeInvoice.findMany({
    where: remindable,
    orderBy: { dueAt: 'asc' }, take: 60,
    select: { id: true, label: true, currency: true, amount: true, discount: true, paid: true, status: true, dueAt: true, studentId: true, student: { select: { name: true } } },
  });
  if (!due.length) return { reminded: 0, people: 0, left: 0 };
  const links = await prisma.guardianLink.findMany({ where: { studentId: { in: [...new Set(due.map((d) => d.studentId))] } }, select: { guardianId: true, studentId: true } });
  const rows: { userId: string; title: string; body: string; type: string; link: string }[] = [];
  for (const d of due) {
    const parents = links.filter((l) => l.studentId === d.studentId).map((l) => l.guardianId);
    const owed = money(outstanding(d), d.currency);
    const since = d.dueAt.toISOString().slice(0, 10);
    for (const userId of parents.length ? parents : [d.studentId]) {
      rows.push({
        userId, type: 'fees', link: parents.length ? '/parent' : '/student/administrative/accounting',
        title: `A friendly reminder: ${d.label}`,
        body: `${owed} has been due since ${since}${parents.length ? ` for ${firstName(d.student.name)}` : ''}. If you’ve already paid, please ignore this; the office will update it. Questions? Contact the school office.`,
      });
    }
  }
  await prisma.notification.createMany({ data: rows });
  await prisma.feeInvoice.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { remindedAt: new Date() } });
  const people = [...new Set(rows.map((r) => r.userId))];
  publish(people.slice(0, planLimits().livePushes), { type: 'notification' });
  await pushService.sendToMany(people, { title: 'A friendly fee reminder', body: 'A school fee is past its due date. Open UniVerse to see it.', url: '/parent', tag: 'fees-reminder' }).catch(() => 0);
  return { reminded: due.length, people: people.length, left: ids ? 0 : await prisma.feeInvoice.count({ where: remindable }) };
}

// ── Reports ─────────────────────────────────────────────────────────────────────────────────

/** GET /api/fees/report: totals by currency, by status, collections by method and by month (12 months). */
export async function feeReport(user: SessionUser) {
  await need(user, 'fees.view');
  const now = dbNow();
  const since = new Date(); since.setUTCMonth(since.getUTCMonth() - 11, 1); since.setUTCHours(0, 0, 0, 0);
  const [totals, byMethod, byMonth, byStatus] = await Promise.all([
    prisma.$queryRawUnsafe<{ currency: string; billed: number; discount: number; paid: number; open: number; overdue: number; overdueBills: number; bills: number }[]>(
      `SELECT currency, SUM(amount) AS billed, SUM(discount) AS discount, SUM(paid) AS paid, COUNT(*) AS bills,
              SUM(CASE WHEN status IN ('DUE','PARTIAL') THEN amount - discount - paid ELSE 0 END) AS open,
              SUM(CASE WHEN status IN ('DUE','PARTIAL') AND "dueAt" < ? THEN amount - discount - paid ELSE 0 END) AS overdue,
              SUM(CASE WHEN status IN ('DUE','PARTIAL') AND "dueAt" < ? THEN 1 ELSE 0 END) AS "overdueBills"
       FROM fee_invoices WHERE status NOT IN ('CANCELLED', 'WAIVED') GROUP BY currency`, now, now),
    prisma.$queryRawUnsafe<{ currency: string; method: string; total: number; n: number }[]>(
      `SELECT i.currency AS currency, p.method AS method, SUM(p.amount) AS total, COUNT(*) AS n FROM fee_payments p JOIN fee_invoices i ON i.id = p."invoiceId"
       WHERE p."voidedAt" IS NULL GROUP BY i.currency, p.method`),
    prisma.$queryRawUnsafe<{ currency: string; month: string; total: number }[]>(
      `SELECT i.currency AS currency, substr(p."paidAt", 1, 7) AS month, SUM(p.amount) AS total FROM fee_payments p JOIN fee_invoices i ON i.id = p."invoiceId"
       WHERE p."voidedAt" IS NULL AND p."paidAt" >= ? GROUP BY i.currency, month ORDER BY month`, since.toISOString().replace('Z', '+00:00')),
    prisma.feeInvoice.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    totals: totals.map((t) => ({ currency: t.currency, bills: n(t.bills), billed: n(t.billed) - n(t.discount), discount: n(t.discount), paid: n(t.paid), open: n(t.open), overdue: n(t.overdue), overdueBills: n(t.overdueBills) })),
    byMethod: byMethod.map((m) => ({ currency: m.currency, method: m.method, total: n(m.total), count: n(m.n) })),
    byMonth: byMonth.map((m) => ({ currency: m.currency, month: m.month, total: n(m.total) })),
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
  };
}

// ── Families ────────────────────────────────────────────────────────────────────────────────

async function billsOf(studentId: string) {
  const rows = await prisma.feeInvoice.findMany({
    where: { studentId, status: { not: 'CANCELLED' } }, orderBy: [{ dueAt: 'asc' }], take: 100,
    select: { id: true, seq: true, label: true, currency: true, amount: true, discount: true, discountNote: true, paid: true, dueAt: true, status: true, payments: { where: { voidedAt: null }, orderBy: { paidAt: 'asc' }, select: { id: true, seq: true, amount: true, method: true, paidAt: true } } },
  });
  const now = Date.now();
  const bills = rows.map((r) => shapeInvoice(r, now));
  const owed: Record<string, number> = {};
  for (const b of bills) if (b.owed) owed[b.currency] = (owed[b.currency] ?? 0) + b.owed;
  const next = bills.filter((b) => b.owed > 0).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0] ?? null;
  return { bills, owed, next: next ? { label: next.label, owed: next.owed, currency: next.currency, dueAt: next.dueAt, overdue: next.overdue } : null, online: false };
}

/** GET /api/parent/fees?studentId=: a linked child's bills and receipts. */
export async function parentFees(user: SessionUser, studentId: string | null) {
  if (user.role !== 'GUARDIAN') throw new ForbiddenException('This is for parent accounts.');
  const link = studentId ? await prisma.guardianLink.findUnique({ where: { guardianId_studentId: { guardianId: user.id, studentId } }, select: { studentId: true } }) : null;
  if (!link) throw new NotFoundException('That child isn’t linked to your account.');
  return billsOf(link.studentId);
}

/** GET /api/student/fees: my own bills and receipts. */
export async function myFees(user: SessionUser) {
  if (user.role !== 'STUDENT') throw new ForbiddenException('This is for students.');
  return billsOf(user.id);
}

/** GET /api/fees/receipts/:id: one receipt, for the school's admins, the student and their linked parents. */
export async function feeReceipt(user: SessionUser, id: string) {
  const p = await prisma.feePayment.findUnique({
    where: { id },
    select: {
      seq: true, amount: true, method: true, reference: true, note: true, paidAt: true, voidedAt: true, voidReason: true, receivedBy: { select: { name: true } },
      invoice: { select: { seq: true, label: true, currency: true, amount: true, discount: true, discountNote: true, paid: true, status: true, studentId: true, student: { select: { name: true, email: true } } } },
    },
  });
  if (!p) throw new NotFoundException('That receipt doesn’t exist.');
  const allowed = p.invoice.studentId === user.id || (await can(user, 'fees.view'))
    || (user.role === 'GUARDIAN' && !!(await prisma.guardianLink.findUnique({ where: { guardianId_studentId: { guardianId: user.id, studentId: p.invoice.studentId } }, select: { id: true } })));
  if (!allowed) throw new NotFoundException('That receipt doesn’t exist.');
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { name: true } });
  const inv = p.invoice;
  return {
    school: org?.name ?? 'UniVerse', number: p.seq, amount: p.amount, currency: inv.currency, method: p.method, reference: p.reference, note: p.note, paidAt: p.paidAt,
    voided: p.voidedAt ? { at: p.voidedAt, reason: p.voidReason } : null, receivedBy: p.receivedBy.name,
    bill: { number: inv.seq, label: inv.label, amount: inv.amount, discount: inv.discount, discountNote: inv.discountNote, paid: inv.paid, owed: outstanding(inv), status: inv.status },
    student: { name: inv.student.name, email: inv.student.email },
  };
}

