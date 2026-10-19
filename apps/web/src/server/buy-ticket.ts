import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { HOLD_MINUTES } from '@/lib/student-life';
import { dropExpiredHolds, seatsTaken } from './campus-life';
import { BadRequestException, NotFoundException } from './http';
import { createUnifiedPaymentOrder } from './payments/provider';

// Buying a ticket (Stage 5 · Q17): a seat is held for HOLD_MINUTES while the buyer pays by card on
// Stripe's page (which closes after 30 minutes); src/server/event-tickets.ts turns it into a ticket.

/** POST /api/campus/events/[id]/buy: returns Stripe's page to pay on. */
export async function buyTicket(user: SessionUser, itemId: string, origin?: string) {
  const item = await prisma.campusItem.findFirst({ where: { id: itemId, kind: 'EVENT' }, select: { id: true, title: true, capacity: true, startAt: true, price: true, currency: true } });
  if (!item) throw new NotFoundException('Event not found.');
  if (!item.price) throw new BadRequestException('This event is free: just say you’re going.');
  if (item.startAt && item.startAt.getTime() < Date.now()) throw new BadRequestException('This event has started.');
  await dropExpiredHolds();
  const existing = await prisma.eventRsvp.findUnique({ where: { itemId_userId: { itemId, userId: user.id } } });
  if (existing?.status === 'GOING') throw new BadRequestException('You already have a ticket.');
  // Starting again: the earlier attempt's seat goes back first.
  if (existing) await prisma.eventRsvp.delete({ where: { id: existing.id } });
  if (item.capacity && (await seatsTaken(itemId)) >= item.capacity) throw new BadRequestException('Sold out.');
  const rsvp = await prisma.eventRsvp.create({ data: { itemId, userId: user.id, status: 'HELD', heldUntil: new Date(Date.now() + HOLD_MINUTES * 60_000) }, select: { id: true } });
  // Two buyers for the last seat at once: the later one gives it back.
  if (item.capacity && (await seatsTaken(itemId)) > item.capacity) {
    const first = await prisma.eventRsvp.findMany({ where: { itemId, status: { in: ['GOING', 'HELD'] } }, orderBy: { createdAt: 'asc' }, take: item.capacity, select: { id: true } });
    if (!first.some((f) => f.id === rsvp.id)) {
      await prisma.eventRsvp.delete({ where: { id: rsvp.id } });
      throw new BadRequestException('Sold out.');
    }
  }
  const orgId = user.organizationId ?? (await prisma.organization.findFirst({ select: { id: true } }))?.id;
  if (!orgId) { await prisma.eventRsvp.delete({ where: { id: rsvp.id } }); throw new BadRequestException('Paid tickets aren’t set up for this school yet.'); }
  try {
    const order = await createUnifiedPaymentOrder({
      orgId, userId: user.id, amount: item.price, currency: item.currency || 'INR', purpose: 'EVENT', provider: 'STRIPE',
      returnPath: '/student/life/events', origin, expiresInMinutes: 30,
      customerName: user.name, customerEmail: user.email ?? '', description: `Ticket: ${item.title}`.slice(0, 200), metadata: { itemId },
    });
    await prisma.eventRsvp.update({ where: { id: rsvp.id }, data: { orderId: order.orderId } });
    return { checkoutUrl: order.checkoutUrl, testMode: !!order.testMode };
  } catch (e) {
    await prisma.eventRsvp.delete({ where: { id: rsvp.id } }).catch(() => {});
    throw e;
  }
}
