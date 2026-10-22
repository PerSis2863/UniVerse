import { BadRequestException, ConflictException, NotFoundException, ForbiddenException } from '../http';
import prisma from '@/lib/db';
import { Role,  type Prisma } from '@prisma/client';
import type { Body } from '../body';
import { pick } from '../pick';
import { assertCanJoinCourse, courseWhereFor, studentCampuses } from '../campus-network';
import { taughtBy } from '@/lib/course-access';
import { enrolOrWait, leaveCourse } from '../course-enrolment';
import { assertInSchool, inSchools, schoolsOf, usersIn } from '../school-scope';

type Who = { id: string; role: string; organizationId?: string | null; owner?: boolean };

const COURSE_FIELDS = ['code', 'name', 'description', 'credits', 'department', 'color', 'emoji'] as const satisfies readonly (keyof Prisma.CourseUncheckedCreateInput)[];

export class CoursesService {
  /** Published courses; a student in a campus network sees their campus's and partner courses only. */
  async findAll(query: { search?: string; department?: string }, user?: { id: string; role: string }) {
    const campuses = user?.role === 'STUDENT' ? await studentCampuses(user.id) : null;
    return prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        AND: [courseWhereFor(campuses)],
        ...(query.department && { department: query.department }),
        ...(query.search && {
          OR: [
            { name: { contains: query.search } },
            { code: { contains: query.search } },
          ],
        }),
      },
      include: {
        teacher: { select: { id: true, name: true, avatar: true } },
        _count: { select: { enrollments: true } },
      },
    });
  }

  /** Every course of the admin's school (a course belongs to its teacher's school, school-scope.ts). */
  async findAllForAdmin(user: Who) {
    return prisma.course.findMany({
      where: { teacher: usersIn(await schoolsOf(user)) },
      include: {
        teacher: { select: { id: true, name: true, avatar: true, email: true, status: true } },
        _count: { select: { enrollments: true, materials: true, quizzes: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
  }

  /** Courses a teacher teaches, co-teaches or assists in (Stage 5 · B2). */
  async findForTeacher(teacherId: string) {
    return prisma.course.findMany({
      where: taughtBy(teacherId),
      include: {
        _count: { select: { enrollments: true, materials: true, quizzes: true } },
      },
    });
  }

  async findMyStudents(teacherId: string) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        course: { teacherId }
      },
      include: {
        student: { select: { id: true, name: true, email: true, avatar: true } },
        course: { select: { id: true, name: true, code: true } }
      }
    });

    const studentIds = enrollments.map(e => e.student.id);
    const courseIds = enrollments.map(e => e.course.id);

    const grades = await prisma.grade.groupBy({
      by: ['studentId', 'courseId'],
      _avg: { score: true },
      where: { studentId: { in: studentIds }, courseId: { in: courseIds } }
    });

    const attendances = await prisma.attendance.groupBy({
      by: ['studentId', 'courseId', 'status'],
      _count: { id: true },
      where: { studentId: { in: studentIds }, courseId: { in: courseIds } }
    });

    return enrollments.map(e => {
      const studentGrade = grades.find(g => g.studentId === e.student.id && g.courseId === e.course.id);
      const studentAttendance = attendances.filter(a => a.studentId === e.student.id && a.courseId === e.course.id);
      const totalDays = studentAttendance.reduce((acc, curr) => acc + curr._count.id, 0);
      const presentDays = studentAttendance.filter(a => a.status === 'PRESENT').reduce((acc, curr) => acc + curr._count.id, 0);
      const attendancePercent = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) + '%' : 'N/A';
      
      let letterGrade = 'N/A';
      if (studentGrade && studentGrade._avg.score) {
        if (studentGrade._avg.score >= 90) letterGrade = 'A';
        else if (studentGrade._avg.score >= 80) letterGrade = 'B';
        else if (studentGrade._avg.score >= 70) letterGrade = 'C';
        else if (studentGrade._avg.score >= 60) letterGrade = 'D';
        else letterGrade = 'F';
      }

      return {
        id: e.student.id,
        // One row per enrollment: a student in two of the teacher's courses has two rows.
        enrollmentId: e.id,
        courseId: e.course.id,
        name: e.student.name,
        email: e.student.email,
        course: e.course.name,
        grade: letterGrade,
        attendance: attendancePercent
      };
    });
  }

  async findForStudent(studentId: string) {
    return prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: {
          include: {
            teacher: { select: { id: true, name: true, avatar: true } },
            _count: { select: { materials: true, quizzes: true } },
          },
        },
      },
    });
  }

  async findOne(id: string, user: Who) {
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, name: true, avatar: true, email: true, organizationId: true } },
        enrollments: { include: { student: { select: { id: true, name: true, email: true, avatar: true } } } },
        materials: { orderBy: { createdAt: 'desc' } },
        quizzes: { orderBy: { createdAt: 'desc' } },
        staff: { where: { userId: user.id }, select: { role: true }, take: 1 },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    // Only the teaching team, the school's admins and enrolled students see the roster and materials; others get the catalogue view.
    const { staff, teacher: { organizationId: teacherOrg, ...teacher }, ...rest } = course;
    const full = { ...rest, teacher };
    const insider = course.teacherId === user.id || staff.length > 0 || course.enrollments.some((e) => e.studentId === user.id)
      || (user.role === Role.ADMIN && inSchools(await schoolsOf(user), teacherOrg));
    if (insider) return full;
    const { enrollments, materials, quizzes, ...info } = full;
    return { ...info, teacher: course.teacher && { id: course.teacher.id, name: course.teacher.name, avatar: course.teacher.avatar }, _count: { enrollments: enrollments.length, materials: materials.length } };
  }

  /** `by`: the admin creating it for another teacher, who must be in their school. */
  async create(teacherId: string, data: Body, by?: Who) {
    if (by && teacherId !== by.id) await assertInSchool(by, teacherId);
    const fields = pick<Prisma.CourseUncheckedCreateInput>(data, COURSE_FIELDS);
    if (typeof fields.code !== 'string' || !fields.code.trim() || typeof fields.name !== 'string' || !fields.name.trim()) {
      throw new BadRequestException('Course name and code are required');
    }
    if (await prisma.course.findUnique({ where: { code: fields.code.trim() } })) throw new ConflictException('A course with this code already exists');
    return prisma.course.create({
      data: { ...fields, code: fields.code.trim(), name: fields.name.trim(), teacherId, status: 'DRAFT' },
    });
  }

  /** Another school's course looks like it doesn't exist to an admin (school-scope.ts). */
  private async assertAdminOf(user: Who, teacherOrg: string | null | undefined) {
    if (!inSchools(await schoolsOf(user), teacherOrg)) throw new NotFoundException('Course not found');
  }

  async update(id: string, user: Who, data: Body) {
    const course = await prisma.course.findUnique({ where: { id }, include: { teacher: { select: { organizationId: true } }, staff: { where: { userId: user.id, role: 'CO_TEACHER' }, select: { id: true }, take: 1 } } });
    if (!course) throw new NotFoundException('Course not found');
    // The teacher, a co-teacher or the school's admin (only the teacher or an admin deletes it: remove below).
    const team = course.teacherId === user.id || course.staff.length > 0;
    if (user.role !== Role.ADMIN && !team) throw new ForbiddenException();
    if (user.role === Role.ADMIN && !team) await this.assertAdminOf(user, course.teacher?.organizationId);
    // Only admins may reassign a course to another teacher, one of their school.
    const fields = pick<Prisma.CourseUncheckedUpdateInput>(data, user.role === Role.ADMIN ? [...COURSE_FIELDS, 'status', 'teacherId'] : [...COURSE_FIELDS, 'status']);
    if (fields.teacherId !== undefined) {
      if (typeof fields.teacherId !== 'string' || !fields.teacherId) throw new BadRequestException('Choose a teacher');
      if (fields.teacherId !== course.teacherId) await assertInSchool(user, fields.teacherId);
    }
    return prisma.course.update({ where: { id }, data: fields });
  }

  async remove(id: string, user: Who) {
    const course = await prisma.course.findUnique({ where: { id }, include: { teacher: { select: { organizationId: true } } } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.teacherId !== user.id) {
      if (user.role !== Role.ADMIN) throw new ForbiddenException();
      await this.assertAdminOf(user, course.teacher?.organizationId);
    }
    return prisma.course.delete({ where: { id } });
  }

  async enroll(courseId: string, studentId: string) {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { status: true } });
    if (!course || course.status !== 'PUBLISHED') throw new NotFoundException('Course not found');
    await assertCanJoinCourse(courseId, studentId);
    // A place if there is one, else the waitlist (Stage 5 · B2, src/server/course-enrolment.ts).
    return enrolOrWait(courseId, studentId);
  }

  /** Leaving a course (or its waitlist): the next on the waitlist gets the place. */
  async unenroll(courseId: string, studentId: string) {
    await leaveCourse(courseId, studentId);
    return { ok: true };
  }
}
