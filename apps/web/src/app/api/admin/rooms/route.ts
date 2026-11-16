import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';
import { campusOf, peopleWhere } from '@/server/school-scope';

// GET: the admin's school's rooms with their bookings. POST: add a room to the admin's school.
// Rooms are each school's own (M191); the bookings shown (and cancellable) are the school's people's.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const mine = await peopleWhere(auth.user);
  const rooms = await prisma.room.findMany({
    where: await campusOf(auth.user),
    orderBy: { name: 'asc' },
    take: 300,
    include: {
      reservations: {
        where: { user: mine },
        orderBy: [{ date: 'desc' }, { time: 'asc' }],
        take: 100,
        include: { user: { select: { id: true, name: true, email: true, role: true, status: true, phone: true } } },
      },
    },
  });
  return NextResponse.json(rooms, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim().slice(0, 80);
  const capacity = Math.max(1, Math.min(5000, Number(b.capacity) || 0));
  if (!name || !capacity) return NextResponse.json({ error: 'Enter a room name and capacity.' }, { status: 400 });
  const room = await prisma.room.create({
    data: { name, capacity, organizationId: auth.user.organizationId ?? null, type: String(b.type ?? 'Classroom').slice(0, 40), amenities: String(b.amenities ?? '').slice(0, 300) },
  });
  return NextResponse.json(room, { status: 201 });
}

// DELETE ?reservationId= : cancel a booking.
export async function DELETE(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const id = new URL(req.url).searchParams.get('reservationId');
  if (!id) return NextResponse.json({ error: 'Missing reservation.' }, { status: 400 });
  // Another school's booking looks like one that's already gone.
  await prisma.roomReservation.deleteMany({ where: { id, user: await peopleWhere(auth.user) } });
  return NextResponse.json({ ok: true });
}
