import prisma from '@/lib/db';
import { Role } from '@prisma/client';

// Ported from the old NestJS API's dashboard controller.
export class DashboardService {
  async getStudentDashboard(user: { id: string }) {
    const today = new Date().getDay();
    // Independent queries, run in parallel.
    const [enrollments, upcomingAssignments, pendingTicketsCount, schedule] = await Promise.all([
      prisma.enrollment.findMany({
        where: { studentId: user.id },
        include: { course: true },
      }),
      prisma.quiz.findMany({
        where: {
          course: { enrollments: { some: { studentId: user.id } } },
          dueDate: { gte: new Date() },
        },
        include: { course: true },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      prisma.ticket.count({
        where: { authorId: user.id, status: { not: 'RESOLVED' } },
      }),
      prisma.timetableSlot.findMany({
        where: {
          dayOfWeek: today,
          course: { enrollments: { some: { studentId: user.id } } },
        },
        include: { course: true, room: true },
      }),
    ]);
    const coursesCount = enrollments.length;

    // Mock calculations for now since grading/attendance data might be sparse
    // In the future, this will be aggregated from the Grades and Attendance models.
    const kpis = {
      enrolled: coursesCount,
      attendance: 0, // Calculate from attendance records
      gpa: 0.0, // Calculate from grades
      assignments: upcomingAssignments.length,
      impactHours: 0,
    };

    const courseProgress = enrollments.map((e) => ({
      name: e.course.name,
      grade: 'N/A', // Update once grading is implemented
      progress: 0,
      color: 'from-indigo-500 to-indigo-400',
    }));

    const deadlines = upcomingAssignments.map((a) => ({
      title: a.title,
      course: a.course.name,
      due: a.dueDate,
      urgent: new Date(a.dueDate).getTime() - new Date().getTime() < 86400000 * 2, // within 48 hours
    }));

    return {
      kpis,
      courseProgress,
      deadlines,
      schedule: schedule.map((s) => ({
        time: `${s.startTime} - ${s.endTime}`,
        course: s.course.name,
        location: s.room?.name || 'TBA',
        type: s.type,
        color: '#6366f1',
      })),
    };
  }

  async getTeacherDashboard(user: { id: string }) {
    // Independent queries, run in parallel.
    const [activeCourses, totalStudentsData, pendingGrades, grades, myCoursesRaw, recent] = await Promise.all([
      prisma.course.count({
        where: { teacherId: user.id },
      }),
      prisma.enrollment.groupBy({
        by: ['studentId'],
        where: {
          course: { teacherId: user.id },
        },
      }),
      prisma.grade.count({
        where: { course: { teacherId: user.id }, status: 'PENDING' },
      }),
      prisma.grade.findMany({
        where: { course: { teacherId: user.id }, status: 'GRADED' },
        orderBy: { gradedAt: 'desc' },
        // Every grade feeds the averages and charts below, but only these columns: names are
        // needed for the five most recent ones only (the last query), not for every row.
        select: { studentId: true, courseId: true, score: true, maxScore: true, gradedAt: true },
      }),
      prisma.course.findMany({
        where: { teacherId: user.id },
        select: { id: true, name: true, code: true, color: true, enrollments: { select: { studentId: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.grade.findMany({
        where: { course: { teacherId: user.id }, status: 'GRADED' },
        orderBy: { gradedAt: 'desc' },
        take: 5,
        select: { score: true, maxScore: true, student: { select: { name: true } }, course: { select: { name: true } } },
      }),
    ]);

    // Total students across all courses taught by the teacher
    const totalStudents = totalStudentsData.length;

    // Everything below comes from recorded grades — no placeholder numbers.
    const pct = (g: { score: number; maxScore: number }) => (g.maxScore > 0 ? (g.score / g.maxScore) * 100 : 0);
    const avgClassScore = grades.length ? Math.round(grades.reduce((sum, g) => sum + pct(g), 0) / grades.length) : 0;

    const palette = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];
    // "completion" = share of enrolled students who have at least one grade in the course.
    const myCourses = myCoursesRaw.map((c, i) => {
      const graded = new Set(grades.filter((g) => g.courseId === c.id).map((g) => g.studentId));
      const students = c.enrollments.length;
      return {
        id: c.id,
        name: c.name,
        code: c.code,
        students,
        completion: students ? Math.round((c.enrollments.filter((e) => graded.has(e.studentId)).length / students) * 100) : 0,
        color: c.color || palette[i % palette.length],
      };
    });

    const letter = (p: number) => (p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F');
    const gradeDistributionData = ['A', 'B', 'C', 'D', 'F'].map((grade) => ({ grade, count: grades.filter((g) => letter(pct(g)) === grade).length }));

    // Average score per month for the last 6 months that have grades.
    const byMonth = new Map<string, { label: string; sum: number; n: number; t: number }>();
    for (const g of grades) {
      const d = new Date(g.gradedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const m = byMonth.get(key) ?? {
        label: d.toLocaleString('en', { month: 'short' }),
        sum: 0,
        n: 0,
        t: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
      };
      m.sum += pct(g);
      m.n += 1;
      byMonth.set(key, m);
    }
    const performanceTrendData = [...byMonth.values()]
      .sort((a, b) => a.t - b.t)
      .slice(-6)
      .map((m) => ({ month: m.label, avgScore: Math.round(m.sum / m.n) }));

    const recentStudents = recent.map((g) => {
      const score = Math.round(pct(g));
      return { name: g.student.name, course: g.course.name, score, status: score >= 85 ? 'excellent' : score >= 70 ? 'good' : 'needs-help' };
    });

    return {
      activeCourses,
      totalStudents,
      pendingGrades,
      avgClassScore,
      myCourses,
      gradeDistributionData,
      performanceTrendData,
      recentStudents,
    };
  }

  async getAdminDashboard() {
    // Independent queries, run in parallel.
    const [totalStudents, totalTeachers, totalCourses, studentsByDept, teachersByDept, recentPaymentsRaw, pendingUsersRaw, revenueObj] =
      await Promise.all([
        prisma.user.count({ where: { role: Role.STUDENT } }),
        prisma.user.count({ where: { role: Role.TEACHER } }),
        prisma.course.count(),
        prisma.studentProfile.groupBy({
          by: ['department'],
          _count: { userId: true },
        }),
        prisma.teacherProfile.groupBy({
          by: ['department'],
          _count: { userId: true },
        }),
        prisma.payment.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        }),
        prisma.user.findMany({
          where: { status: 'PENDING' },
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            studentProfile: true,
            teacherProfile: true,
          },
        }),
        prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: 'COMPLETED' },
        }),
      ]);

    // Departments

    const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    const departmentsMap = new Map();
    studentsByDept.forEach((s) => {
      if (s.department) departmentsMap.set(s.department, { name: s.department, students: s._count.userId, teachers: 0 });
    });
    teachersByDept.forEach((t) => {
      if (t.department) {
        if (departmentsMap.has(t.department)) {
          departmentsMap.get(t.department).teachers = t._count.userId;
        } else {
          departmentsMap.set(t.department, { name: t.department, students: 0, teachers: t._count.userId });
        }
      }
    });
    const departments = Array.from(departmentsMap.values()).map((d, i) => ({
      ...d,
      color: colors[i % colors.length],
    }));

    if (departments.length === 0) {
      departments.push({ name: 'General', students: totalStudents, teachers: totalTeachers, color: '#6366f1' });
    }

    // Recent Payments
    const recentPayments = recentPaymentsRaw.map((p) => ({
      name: p.user.name,
      type: p.type,
      amount: p.amount,
      status: p.status.toLowerCase(),
    }));

    // Pending Approvals
    const pendingUsers = pendingUsersRaw.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      dept: u.studentProfile?.department || u.teacherProfile?.department || 'General',
      applied: u.createdAt.toLocaleDateString(),
    }));
    const revenue = revenueObj._sum.amount || 0;

    return {
      totalStudents,
      totalTeachers,
      totalCourses,
      revenue,
      departments,
      recentPayments,
      pendingUsers,
    };
  }
}
