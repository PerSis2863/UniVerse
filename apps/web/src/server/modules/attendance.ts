import type { Router } from '../router';
import { AttendanceService } from '../services/attendance.service';
import { assertManagesCourse } from '../access';
import { BadRequestException } from '../http';
import { later } from '../email';
import { alertAbsence } from '../guardians';
import prisma from '@/lib/db';
import { oneOf } from '../body';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

const attendance = new AttendanceService();

export default function attendanceModule(router: Router) {
  const r = router.controller('attendance');

  r.get('student', { roles: ['STUDENT'] }, ({ user }) => attendance.getStudentAttendance(user.id));
  r.get<{ courseId: string }>('course/:courseId', { roles: ['TEACHER', 'ADMIN'] }, async ({ params, query, user }) => {
    await assertManagesCourse(params.courseId, user);
    return attendance.getCourseAttendance(params.courseId, validDate(query.date) ?? new Date().toISOString().split('T')[0]);
  });
  r.post<{ courseId: string }>('course/:courseId', { roles: ['TEACHER', 'ADMIN'] }, async ({ params, body, user }) => {
    await assertManagesCourse(params.courseId, user);
    const date = validDate(body?.date);
    if (!date) throw new BadRequestException('date must be YYYY-MM-DD');
    const { status, studentId } = body;
    if (!oneOf(STATUSES, status)) throw new BadRequestException(`status must be one of ${STATUSES.join(', ')}`);
    if (typeof studentId !== 'string') throw new BadRequestException('studentId is required');
    const before = await prisma.attendance.findUnique({ where: { studentId_courseId_date: { studentId, courseId: params.courseId, date: new Date(date) } }, select: { status: true } });
    const saved = await attendance.markAttendance(params.courseId, date, studentId, status);
    // Newly absent (not re-saved): tell the guardians who asked for absence alerts.
    if (status === 'ABSENT' && before?.status !== 'ABSENT') later(() => alertAbsence(studentId, params.courseId, date));
    return saved;
  });
}

function validDate(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
}
