import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';

// GET: all rooms with their bookings (admin). POST: add a room.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const rooms = await prisma.room.findMany({
    orderBy: { name: 'asc' },
    take: 300,
    include: {
      reservations: {
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
    data: { name, capacity, type: String(b.type ?? 'Classroom').slice(0, 40), amenities: String(b.amenities ?? '').slice(0, 300) },
  });
  return NextResponse.json(room, { status: 201 });
}

// DELETE ?reservationId= : cancel a booking.
export async function DELETE(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const id = new URL(req.url).searchParams.get('reservationId');
  if (!id) return NextResponse.json({ error: 'Missing reservation.' }, { status: 400 });
  await prisma.roomReservation.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
