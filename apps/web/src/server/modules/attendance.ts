import type { Router } from '../router';
import { AttendanceService } from '../services/attendance.service';
import { assertManagesCourse } from '../access';
import { BadRequestException } from '../http';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

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
    if (!STATUSES.includes(body?.status)) throw new BadRequestException(`status must be one of ${STATUSES.join(', ')}`);
    if (typeof body?.studentId !== 'string') throw new BadRequestException('studentId is required');
    return attendance.markAttendance(params.courseId, date, body.studentId, body.status);
  });
}

function validDate(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
}
