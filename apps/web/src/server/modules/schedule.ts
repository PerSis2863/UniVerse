import type { Router } from '../router';
import prisma from '@/lib/db';

export default function scheduleModule(router: Router) {
  const r = router.controller('schedule');

  // Weekly schedule derived from the user's enrolled courses: each course on two days.
  r.get('weekly', async ({ user }) => {
    const enrollments = await prisma.enrollment.findMany({ where: { studentId: user.id }, include: { course: true } });
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const timeSlots = ['09:00', '10:30', '13:00', '14:30'];
    return enrollments.map((e, idx) => {
      const time = timeSlots[idx % timeSlots.length];
      return {
        id: e.courseId,
        course: e.course,
        sessions: [
          { day: days[idx % 5], time, duration: '90m' },
          { day: days[(idx + 2) % 5], time, duration: '90m' },
        ],
      };
    });
  });
}
