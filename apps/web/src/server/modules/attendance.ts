import type { Router } from '../router';
import { AttendanceService } from '../services/attendance.service';

const attendance = new AttendanceService();

export default function attendanceModule(router: Router) {
  const r = router.controller('attendance');

  r.get('student', { roles: ['STUDENT'] }, ({ user }) => attendance.getStudentAttendance(user.id));
  r.get<{ courseId: string }>('course/:courseId', { roles: ['TEACHER', 'ADMIN'] }, ({ params, query }) =>
    attendance.getCourseAttendance(params.courseId, query.date || new Date().toISOString().split('T')[0]),
  );
  r.post<{ courseId: string }>('course/:courseId', { roles: ['TEACHER', 'ADMIN'] }, ({ params, body }) =>
    attendance.markAttendance(params.courseId, body.date, body.studentId, body.status),
  );
}
