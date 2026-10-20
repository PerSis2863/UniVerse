import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { readTicketCode, ticketCode } from './campus-life';
import { notify } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';

// Event tickets (Stage 5 · Q17). Every place at an event (free or paid) has a signed ticket the holder
// shows as a QR code; the door scans it once. Paid tickets: src/server/buy-ticket.ts starts the
// payment with the seat held; src/server/payments/provider.ts calls ticketPaid once the gateway confirms.

/** The payment for a ticket went through: the held seat becomes a ticket (once). */
export async function ticketPaid(orderId: string) {
  const held = await prisma.eventRsvp.findUnique({ where: { orderId }, select: { id: true, status: true, userId: true, item: { select: { title: true } } } });
  let userId = held?.userId, title = held?.item.title;
  if (held && held.status !== 'GOING') await prisma.eventRsvp.update({ where: { id: held.id }, data: { status: 'GOING', heldUntil: null } });
  if (!held) {
    // Paid after the hold ran out (the seat went back): the buyer still gets their place.
    const o = await prisma.paymentOrder.findUnique({ where: { id: orderId }, select: { userId: true, metadata: true } });
    const itemId = (() => { try { return String(JSON.parse(o?.metadata ?? '{}').itemId ?? ''); } catch { return ''; } })();
    if (!o?.userId || !itemId) return;
    const item = await prisma.campusItem.findUnique({ where: { id: itemId }, select: { title: true } });
    await prisma.eventRsvp.upsert({ where: { itemId_userId: { itemId, userId: o.userId } }, update: { status: 'GOING', heldUntil: null, orderId }, create: { itemId, userId: o.userId, status: 'GOING', orderId } });
    userId = o.userId; title = item?.title;
  }
  if (userId) await notify(userId, { type: 'event', title: `Your ticket for ${title ?? 'the event'}`, body: 'It’s in Events: show the QR code at the door.', link: '/student/life/events', email: false });
}

/** A ticket's payment was refunded: the place goes back. */
export async function ticketRefunded(orderId: string) {
  await prisma.eventRsvp.deleteMany({ where: { orderId } });
}

/** GET /api/campus/events/[id]/ticket: my ticket (a signed code for the QR). */
export async function myTicket(user: SessionUser, itemId: string) {
  const r = await prisma.eventRsvp.findUnique({
    where: { itemId_userId: { itemId, userId: user.id } },
    select: { id: true, status: true, checkedInAt: true, item: { select: { title: true, startAt: true, location: true, price: true, currency: true } } },
  });
  if (!r || r.status !== 'GOING') throw new NotFoundException('You don’t have a ticket for this event.');
  return { code: ticketCode(r.id), name: user.name, title: r.item.title, startAt: r.item.startAt, location: r.item.location, paid: !!r.item.price, usedAt: r.checkedInAt };
}

/** POST /api/campus/events/[id]/scan { code } (admins at the door): a ticket works once. */
export async function scanTicket(user: SessionUser, itemId: string, code: unknown) {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins can scan tickets.');
  const rsvpId = typeof code === 'string' ? readTicketCode(code) : null;
  if (!rsvpId) throw new BadRequestException('Not a UniVerse ticket (or it was changed).');
  const r = await prisma.eventRsvp.findUnique({ where: { id: rsvpId }, select: { id: true, itemId: true, status: true, checkedInAt: true, user: { select: { name: true } }, item: { select: { title: true } } } });
  if (!r || r.status !== 'GOING') throw new BadRequestException('This ticket is no longer valid.');
  if (r.itemId !== itemId) throw new BadRequestException(`This ticket is for “${r.item.title}”.`);
  if (r.checkedInAt) return { ok: false, name: r.user.name, usedAt: r.checkedInAt };
  // Only the first scan counts, even if two doors scan at once.
  const { count } = await prisma.eventRsvp.updateMany({ where: { id: r.id, checkedInAt: null }, data: { checkedInAt: new Date() } });
  if (!count) return { ok: false, name: r.user.name, usedAt: (await prisma.eventRsvp.findUnique({ where: { id: r.id }, select: { checkedInAt: true } }))?.checkedInAt ?? null };
  return { ok: true, name: r.user.name, usedAt: null };
}
