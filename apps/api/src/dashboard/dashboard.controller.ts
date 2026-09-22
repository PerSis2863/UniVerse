import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('dashboard')
@UseGuards(ClerkAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('student')
  @Roles(Role.STUDENT)
  async getStudentDashboard(@CurrentUser() user: any) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: user.id },
      include: { course: true }
    });
    const coursesCount = enrollments.length;

    const upcomingAssignments = await this.prisma.quiz.findMany({
      where: {
        course: { enrollments: { some: { studentId: user.id } } },
        dueDate: { gte: new Date() },
      },
      include: { course: true },
      orderBy: { dueDate: 'asc' },
      take: 5
    });

    const pendingTicketsCount = await this.prisma.ticket.count({
      where: { authorId: user.id, status: { not: 'RESOLVED' } },
    });

    // Mock calculations for now since grading/attendance data might be sparse
    // In the future, this will be aggregated from the Grades and Attendance models.
    const kpis = {
      enrolled: coursesCount,
      attendance: 0, // Calculate from attendance records
      gpa: 0.0, // Calculate from grades
      assignments: upcomingAssignments.length,
      impactHours: 0, 
    };

    const courseProgress = enrollments.map(e => ({
      name: e.course.name,
      grade: 'N/A', // Update once grading is implemented
      progress: 0,
      color: 'from-indigo-500 to-indigo-400'
    }));

    const deadlines = upcomingAssignments.map(a => ({
      title: a.title,
      course: a.course.name,
      due: a.dueDate,
      urgent: new Date(a.dueDate).getTime() - new Date().getTime() < 86400000 * 2 // within 48 hours
    }));

    // Today's schedule - fetch from Timetable
    const today = new Date().getDay();
    const schedule = await this.prisma.timetableSlot.findMany({
      where: {
        dayOfWeek: today,
        course: { enrollments: { some: { studentId: user.id } } }
      },
      include: { course: true, room: true }
    });

    return {
      kpis,
      courseProgress,
      deadlines,
      schedule: schedule.map(s => ({
        time: `${s.startTime} - ${s.endTime}`,
        course: s.course.name,
        location: s.room?.name || 'TBA',
        type: s.type,
        color: '#6366f1'
      })),
    };
  }

  @Get('teacher')
  @Roles(Role.TEACHER)
  async getTeacherDashboard(@CurrentUser() user: any) {
    const activeCourses = await this.prisma.course.count({
      where: { teacherId: user.id },
    });
    
    // Total students across all courses taught by the teacher
    const totalStudentsData = await this.prisma.enrollment.groupBy({
      by: ['studentId'],
      where: {
        course: { teacherId: user.id }
      }
    });
    const totalStudents = totalStudentsData.length;

    const pendingGrades = await this.prisma.grade.count({
      where: { course: { teacherId: user.id }, status: 'PENDING' }
    });

    const gradesAggr = await this.prisma.grade.aggregate({
      _avg: { score: true },
      where: { course: { teacherId: user.id } }
    });
    const avgClassScore = gradesAggr._avg.score || 0;

    // Courses with student count and completion rate
    const myCoursesRaw = await this.prisma.course.findMany({
      where: { teacherId: user.id },
      include: {
        enrollments: true,
      },
      take: 5
    });

    const myCourses = myCoursesRaw.map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      students: c.enrollments.length,
      completion: Math.floor(Math.random() * 40) + 60, // MOCK
      color: ['#6366f1', '#06b6d4', '#10b981'][Math.floor(Math.random() * 3)]
    }));

    // Mock data for graphs
    const gradeDistributionData = [
      { grade: 'A', count: 24 },
      { grade: 'B', count: 45 },
      { grade: 'C', count: 32 },
      { grade: 'D', count: 12 },
      { grade: 'F', count: 3 },
    ];
    
    const performanceTrendData = [
      { month: 'Sep', avgScore: 76 },
      { month: 'Oct', avgScore: 78 },
      { month: 'Nov', avgScore: 82 },
      { month: 'Dec', avgScore: 84 },
    ];

    const recentStudents = [
      { name: 'Aditya Bhatt', course: 'Data Structures', score: 94, status: 'excellent' },
      { name: 'Priya Sharma', course: 'Algorithms', score: 87, status: 'good' },
      { name: 'Rahul Kumar', course: 'Database', score: 72, status: 'needs-help' },
      { name: 'Sneha Patel', course: 'OS', score: 91, status: 'excellent' },
    ];

    return {
      activeCourses,
      totalStudents,
      pendingGrades,
      avgClassScore,
      myCourses,
      gradeDistributionData,
      performanceTrendData,
      recentStudents
    };
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  async getAdminDashboard() {
    const totalStudents = await this.prisma.user.count({ where: { role: Role.STUDENT } });
    const totalTeachers = await this.prisma.user.count({ where: { role: Role.TEACHER } });
    const totalCourses = await this.prisma.course.count();
    
    // Departments
    const studentsByDept = await this.prisma.studentProfile.groupBy({
      by: ['department'],
      _count: { userId: true }
    });
    const teachersByDept = await this.prisma.teacherProfile.groupBy({
      by: ['department'],
      _count: { userId: true }
    });
    
    const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    const departmentsMap = new Map();
    studentsByDept.forEach(s => {
      if (s.department) departmentsMap.set(s.department, { name: s.department, students: s._count.userId, teachers: 0 });
    });
    teachersByDept.forEach(t => {
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
      color: colors[i % colors.length]
    }));
    
    if (departments.length === 0) {
      departments.push({ name: 'General', students: totalStudents, teachers: totalTeachers, color: '#6366f1' });
    }

    // Recent Payments
    const recentPaymentsRaw = await this.prisma.payment.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { user: true }
    });
    const recentPayments = recentPaymentsRaw.map(p => ({
      name: p.user.name,
      type: p.type,
      amount: p.amount,
      status: p.status.toLowerCase()
    }));

    // Pending Approvals
    const pendingUsersRaw = await this.prisma.user.findMany({
      where: { status: 'PENDING' },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        studentProfile: true,
        teacherProfile: true
      }
    });
    const pendingUsers = pendingUsersRaw.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      dept: u.studentProfile?.department || u.teacherProfile?.department || 'General',
      applied: u.createdAt.toLocaleDateString()
    }));
    
    const revenueObj = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: 'COMPLETED' }
    });
    const revenue = revenueObj._sum.amount || 0;
    const uptime = "99.9%";

    return {
      totalStudents,
      totalTeachers,
      totalCourses,
      revenue,
      uptime,
      departments,
      recentPayments,
      pendingUsers
    };
  }
}
