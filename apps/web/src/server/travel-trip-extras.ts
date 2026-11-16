import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { CURRENCIES } from '@/lib/travel-find';
import { isDay } from '@/lib/travel-plan';
import { EXPENSE_IDS, SETTLE } from '@/lib/travel-split';
import { PACK_GROUPS } from '@/lib/travel-pack';
import { BadRequestException, NotFoundException } from './http';
import { oneOf, str, strings, type Body } from './body';
import { publish } from './realtime';
import { memberIds, tripFor } from './travel-trips';

// M215: a trip's shared costs and packing list, for everyone planning it (the trip's members, checked on every
// call by tripFor). Who paid and who shares a cost must be members. Changes reach the others' open pages live.

const MAX_EXPENSES = 500, MAX_PACK = 200, CHUNK = 10; // 10 rows × 8 values stays under D1's 100 bound values
const clip = (v: unknown, n: number) => { const s = (str(v) ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, n) : null; };
const readSplit = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } };
const tell = async (tripId: string, part: 'expenses' | 'packing') => publish(await memberIds(tripId), { type: 'refresh', keys: [`/travel/trips/${tripId}/${part}`] });

/** GET /travel/trips/:id/expenses */
export async function tripExpenses(u: SessionUser, id: string) {
  await tripFor(u, id);
  const rows = await prisma.travelTripExpense.findMany({ where: { tripId: id }, orderBy: { createdAt: 'desc' }, take: MAX_EXPENSES });
  return { expenses: rows.map((r) => ({ id: r.id, paidBy: r.paidBy, amount: r.amount, currency: r.currency, category: r.category, what: r.what, day: r.day, split: readSplit(r.split), createdBy: r.createdBy, createdAt: r.createdAt })) };
}

/** POST /travel/trips/:id/expenses { what, amount (cents), currency, category, day, paidBy, split } (a payment
 *  back: category "settle", split [the one paid]). */
export async function addTripExpense(u: SessionUser, id: string, b: Body) {
  const trip = await tripFor(u, id);
  const members = await memberIds(id);
  const amount = typeof b.amount === 'number' && Number.isInteger(b.amount) && b.amount > 0 && b.amount <= 1_000_000_000 ? b.amount : null;
  if (!amount) throw new BadRequestException('Type how much it cost.');
  const category = oneOf(EXPENSE_IDS, b.category) ? b.category : 'other';
  const paidBy = typeof b.paidBy === 'string' && members.includes(b.paidBy) ? b.paidBy : null;
  if (!paidBy) throw new BadRequestException('Pick who paid: someone planning this trip.');
  const split = [...new Set(strings(b.split) ?? [])].filter((m) => members.includes(m));
  if (!split.length) throw new BadRequestException('Pick who it was for.');
  if (category === SETTLE && (split.length !== 1 || split[0] === paidBy)) throw new BadRequestException('A payment back goes from one person to another.');
  const what = category === SETTLE ? 'Paid back' : clip(b.what, 80);
  if (!what) throw new BadRequestException('Say what it was for.');
  if ((await prisma.travelTripExpense.count({ where: { tripId: id } })) >= MAX_EXPENSES) throw new BadRequestException(`A trip keeps ${MAX_EXPENSES} costs.`);
  const expense = await prisma.travelTripExpense.create({
    data: { tripId: id, paidBy, amount, currency: oneOf(CURRENCIES, b.currency) ? b.currency : trip.currency, category, what, day: isDay(b.day) ? b.day : null, split: JSON.stringify(split), createdBy: u.id },
    select: { id: true },
  });
  await tell(id, 'expenses');
  return { expense };
}

/** DELETE /travel/trips/:id/expenses/:expenseId: any member (they keep the costs together). */
export async function removeTripExpense(u: SessionUser, id: string, expenseId: string) {
  await tripFor(u, id);
  const r = await prisma.travelTripExpense.deleteMany({ where: { id: expenseId, tripId: id } });
  if (!r.count) throw new NotFoundException('That cost isn’t there any more.');
  await tell(id, 'expenses');
  return { ok: true };
}

/** GET /travel/trips/:id/packing */
export async function tripPacking(u: SessionUser, id: string) {
  await tripFor(u, id);
  const rows = await prisma.travelTripPack.findMany({ where: { tripId: id }, orderBy: { createdAt: 'asc' }, take: MAX_PACK, select: { id: true, item: true, grp: true, done: true, doneBy: true } });
  return { items: rows };
}

/** POST /travel/trips/:id/packing { items: [{ item, grp }] }: suggestions or one of your own; the same thing twice once. */
export async function addTripPacking(u: SessionUser, id: string, b: Body) {
  await tripFor(u, id);
  const asked = (Array.isArray(b.items) ? b.items : []).slice(0, 80).map((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Body;
    return { item: clip(o.item, 80), grp: oneOf(PACK_GROUPS, o.grp) ? o.grp : 'Other' };
  }).filter((x): x is { item: string; grp: string } => !!x.item);
  if (!asked.length) throw new BadRequestException('Name the thing to pack.');
  const have = new Set((await prisma.travelTripPack.findMany({ where: { tripId: id }, select: { item: true }, take: MAX_PACK })).map((r) => r.item.toLowerCase()));
  const fresh = asked.filter((x) => { const k = x.item.toLowerCase(); if (have.has(k)) return false; have.add(k); return true; });
  if (have.size > MAX_PACK) throw new BadRequestException(`A packing list keeps ${MAX_PACK} things.`);
  for (let i = 0; i < fresh.length; i += CHUNK) {
    await prisma.travelTripPack.createMany({ data: fresh.slice(i, i + CHUNK).map((x) => ({ tripId: id, item: x.item, grp: x.grp, addedBy: u.id })) });
  }
  if (fresh.length) await tell(id, 'packing');
  return { added: fresh.length };
}

/** PATCH /travel/trips/:id/packing/:itemId { done } */
export async function updateTripPacking(u: SessionUser, id: string, itemId: string, b: Body) {
  await tripFor(u, id);
  if (typeof b.done !== 'boolean') throw new BadRequestException('Packed or not?');
  const r = await prisma.travelTripPack.updateMany({ where: { id: itemId, tripId: id }, data: { done: b.done, doneBy: b.done ? u.id : null } });
  if (!r.count) throw new NotFoundException('That isn’t on the list any more.');
  await tell(id, 'packing');
  return { ok: true };
}

/** DELETE /travel/trips/:id/packing/:itemId */
export async function removeTripPacking(u: SessionUser, id: string, itemId: string) {
  await tripFor(u, id);
  const r = await prisma.travelTripPack.deleteMany({ where: { id: itemId, tripId: id } });
  if (!r.count) throw new NotFoundException('That isn’t on the list any more.');
  await tell(id, 'packing');
  return { ok: true };
}
