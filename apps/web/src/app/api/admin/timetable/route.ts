import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';
import { peopleWhere } from '@/server/school-scope';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET: every timetable slot plus the courses and rooms to schedule them in. Only the admin's own
// school's courses (a course belongs to its teacher's school); rooms are shared by every school.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const course = { teacher: await peopleWhere(auth.user) };
  const [slots, courses, rooms] = await Promise.all([
    prisma.timetableSlot.findMany({
      where: { course },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      include: {
        course: {
          select: {
            id: true, code: true, name: true, color: true, department: true,
            // The teacher of each course, so admins can see who teaches every slot.
            teacher: { select: { id: true, name: true, email: true, role: true, status: true, phone: true, teacherProfile: { select: { department: true, designation: true } } } },
            _count: { select: { enrollments: true } },
          },
        },
        room: { select: { id: true, name: true } },
      },
      take: 1000,
    }),
    prisma.course.findMany({ where: course, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
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
  // Another school's course looks like one that doesn't exist.
  if (!(await prisma.course.findFirst({ where: { id: b.courseId, teacher: await peopleWhere(auth.user) }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
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
  await prisma.timetableSlot.deleteMany({ where: { id, course: { teacher: await peopleWhere(auth.user) } } });
  return NextResponse.json({ ok: true });
}
