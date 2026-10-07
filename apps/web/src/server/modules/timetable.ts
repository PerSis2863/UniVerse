import type { Router } from '../router';
import prisma from '@/lib/db';
import { TimetableService } from '../services/timetable.service';
import { assertManagesCourse } from '../access';
import { BadRequestException, NotFoundException } from '../http';
import type { Prisma } from '@prisma/client';
import { oneOf, type Body } from '../body';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TYPES = ['LECTURE', 'LAB', 'TUTORIAL'] as const;

async function slotCourse(id: string) {
  const slot = await prisma.timetableSlot.findUnique({ where: { id }, select: { courseId: true } });
  if (!slot) throw new NotFoundException('Timetable slot not found');
  return slot.courseId;
}

/** Only the slot's own fields, validated (the old API passed the whole body to the database). */
function slotFields(body: Body, creating: boolean) {
  const data: Prisma.TimetableSlotUncheckedUpdateInput = {};
  const has = (k: string) => body[k] !== undefined;
  if (creating || has('courseId')) {
    if (typeof body.courseId !== 'string') throw new BadRequestException('courseId is required');
    data.courseId = body.courseId;
  }
  if (creating || has('dayOfWeek')) {
    const d = Number(body.dayOfWeek);
    if (!Number.isInteger(d) || d < 0 || d > 6) throw new BadRequestException('dayOfWeek must be 0 (Mon) to 6 (Sun)');
    data.dayOfWeek = d;
  }
  for (const k of ['startTime', 'endTime'] as const) {
    if (creating || has(k)) {
      const v = body[k];
      if (typeof v !== 'string' || !TIME.test(v)) throw new BadRequestException(`${k} must be HH:MM`);
      data[k] = v;
    }
  }
  if (has('roomId')) data.roomId = typeof body.roomId === 'string' && body.roomId ? body.roomId : null;
  if (has('type')) {
    if (!oneOf(TYPES, body.type)) throw new BadRequestException(`type must be one of ${TYPES.join(', ')}`);
    data.type = body.type;
  }
  return data;
}

const timetable = new TimetableService();

export default function timetableModule(router: Router) {
  const r = router.controller('timetable');

  r.get('my', ({ user }) => timetable.findForUser(user.id));
  r.get<{ courseId: string }>('course/:courseId', ({ params }) => timetable.findByCourse(params.courseId));
  // Teachers can only change the timetable of courses they teach.
  r.post('', { roles: ['ADMIN', 'TEACHER'] }, async ({ body, user }) => {
    // Creating checks every required field (course, day, start and end).
    const data = slotFields(body, true) as Prisma.TimetableSlotUncheckedCreateInput;
    await assertManagesCourse(data.courseId, user);
    return timetable.create(data);
  });
  r.patch<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, async ({ params, body, user }) => {
    await assertManagesCourse(await slotCourse(params.id), user);
    const data = slotFields(body, false);
    if (typeof data.courseId === 'string') await assertManagesCourse(data.courseId, user);
    return timetable.update(params.id, data);
  });
  r.delete<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, async ({ params, user }) => {
    await assertManagesCourse(await slotCourse(params.id), user);
    return timetable.remove(params.id);
  });
}
