import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { cleanOrderItems, dishesOf, pickupOk, prepList } from '@/lib/student-life';
import type { Body } from './body';
import { notify } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { pushService } from './services/push.service';

// Cafeteria pre-orders (Stage 5 · Q17): order from today's or tomorrow's menu (campus_items kind MENU,
// one dish a line), pick a time, collect with a short code and pay at the counter. The kitchen
// (admins) sees what to prepare and marks orders ready, which tells the student.

const CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const pickupCode = () => [...randomBytes(4)].map((b) => CODE[b % CODE.length]).join('');
const itemsOf = (raw: string) => { try { const v = JSON.parse(raw); return Array.isArray(v) ? (v as { dish: string; qty: number }[]) : []; } catch { return []; } };
const DAY = 86_400_000;

/** GET /api/campus/meals: menus I can still order from (today and tomorrow) and my orders. */
export async function mealMenus(user: SessionUser) {
  const now = Date.now();
  const [menus, mine] = await Promise.all([
    prisma.campusItem.findMany({ where: { kind: 'MENU', startAt: { gte: new Date(now - 13 * 3_600_000), lte: new Date(now + 37 * 3_600_000) } }, orderBy: { startAt: 'asc' }, take: 20, select: { id: true, title: true, category: true, location: true, startAt: true, description: true } }),
    prisma.mealOrder.findMany({ where: { userId: user.id, pickupAt: { gte: new Date(now - DAY) } }, orderBy: { pickupAt: 'asc' }, take: 20, select: { id: true, items: true, pickupAt: true, note: true, code: true, status: true, menu: { select: { title: true, category: true, location: true } } } }),
  ]);
  return {
    menus: menus.map(({ description, ...m }) => ({ ...m, dishes: dishesOf(description) })),
    orders: mine.map((o) => ({ ...o, items: itemsOf(o.items) })),
  };
}

/** POST /api/campus/meals { menuId, items: [{ dish, qty }], pickupAt, note? } */
export async function placeMealOrder(user: SessionUser, b: Body) {
  if (user.role === 'GUARDIAN') throw new ForbiddenException('Pre-orders are for students and staff.');
  const menu = await prisma.campusItem.findFirst({ where: { id: typeof b.menuId === 'string' ? b.menuId : '', kind: 'MENU' }, select: { id: true, startAt: true, description: true } });
  if (!menu?.startAt) throw new NotFoundException('That menu isn’t available.');
  const items = cleanOrderItems(b.items, dishesOf(menu.description));
  if (!items) throw new BadRequestException('Pick at least one dish from the menu (up to 5 of each).');
  const pickupAt = new Date(String(b.pickupAt ?? ''));
  if (Number.isNaN(pickupAt.getTime()) || !pickupOk(menu.startAt, pickupAt)) throw new BadRequestException('Pick a time on the menu’s day, at least 20 minutes from now.');
  if ((await prisma.mealOrder.count({ where: { menuId: menu.id, userId: user.id, status: { in: ['PLACED', 'READY'] } } })) >= 3) throw new BadRequestException('You have 3 orders for this menu already.');
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 140) || null : null;
  await prisma.mealOrder.create({ data: { menuId: menu.id, userId: user.id, items: JSON.stringify(items), pickupAt, note, code: pickupCode() } });
  return mealMenus(user);
}

/** DELETE /api/campus/meals?order=: cancel my order while the kitchen hasn't made it. */
export async function cancelMealOrder(user: SessionUser, id: string) {
  const { count } = await prisma.mealOrder.updateMany({ where: { id, userId: user.id, status: 'PLACED' }, data: { status: 'CANCELLED' } });
  if (!count) throw new BadRequestException('This order can’t be cancelled any more.');
  return mealMenus(user);
}

// ── The kitchen (admins) ─────────────────────────────────────────────────

/** GET /api/admin/meal-orders?day=YYYY-MM-DD: the day's menus, orders by pickup time and what to prepare. */
export async function kitchenOrders(user: SessionUser, day: string | null) {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Admins only.');
  const d = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00Z`) : new Date();
  const menus = await prisma.campusItem.findMany({
    where: { kind: 'MENU', startAt: { gte: new Date(d.getTime() - 14 * 3_600_000), lte: new Date(d.getTime() + 14 * 3_600_000) } }, orderBy: { startAt: 'asc' }, take: 20,
    select: { id: true, title: true, category: true, location: true, startAt: true, mealOrders: { orderBy: { pickupAt: 'asc' }, take: 500, select: { id: true, items: true, pickupAt: true, note: true, code: true, status: true, user: { select: { name: true } } } } },
  });
  return {
    menus: menus.map(({ mealOrders, ...m }) => {
      const orders = mealOrders.map((o) => ({ ...o, items: itemsOf(o.items) }));
      return { ...m, orders, prep: prepList(orders.filter((o) => o.status === 'PLACED')) };
    }),
  };
}

/** PATCH /api/admin/meal-orders { id, status: READY | COLLECTED | CANCELLED }: READY tells the student. */
export async function setMealOrderStatus(user: SessionUser, b: Body) {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Admins only.');
  const status = ['READY', 'COLLECTED', 'CANCELLED'].includes(String(b.status)) ? String(b.status) : null;
  const o = await prisma.mealOrder.findUnique({ where: { id: typeof b.id === 'string' ? b.id : '' }, select: { id: true, userId: true, code: true, status: true, menu: { select: { location: true } } } });
  if (!o || !status) throw new NotFoundException('Order not found.');
  await prisma.mealOrder.update({ where: { id: o.id }, data: { status } });
  if (status === 'READY' && o.status !== 'READY') {
    const title = `Your food is ready: code ${o.code}`;
    const body = `Collect it${o.menu.location ? ` at ${o.menu.location}` : ''} and pay at the counter.`;
    await notify(o.userId, { type: 'reminder', title, body, link: '/student/life/everyday', email: false });
    await pushService.sendToMany([o.userId], { title, body, url: '/student/life/everyday', tag: `remind-meal-${o.id}` }).catch(() => 0);
  }
  return { ok: true };
}
