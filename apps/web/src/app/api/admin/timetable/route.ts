import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET: every timetable slot plus the courses and rooms to schedule them in.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const [slots, courses, rooms] = await Promise.all([
    prisma.timetableSlot.findMany({
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      include: { course: { select: { id: true, code: true, name: true, color: true } }, room: { select: { id: true, name: true } } },
    }),
    prisma.course.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    prisma.room.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return NextResponse.json({ slots, courses, rooms }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST: add a slot. DELETE ?id= : remove one.
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const b = await req.json().catch(() => ({}));
  const dayOfWeek = Number(b.dayOfWeek);
  if (typeof b.courseId !== 'string' || !(dayOfWeek >= 0 && dayOfWeek <= 6) || !TIME.test(b.startTime) || !TIME.test(b.endTime) || b.endTime <= b.startTime) {
    return NextResponse.json({ error: 'Choose a course, day and a valid start/end time.' }, { status: 400 });
  }
  const slot = await prisma.timetableSlot.create({
    data: {
      courseId: b.courseId,
      dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
      roomId: typeof b.roomId === 'string' && b.roomId ? b.roomId : null,
      type: ['LECTURE', 'LAB', 'TUTORIAL'].includes(b.type) ? b.type : 'LECTURE',
    },
  });
  return NextResponse.json(slot, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing slot.' }, { status: 400 });
  await prisma.timetableSlot.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
