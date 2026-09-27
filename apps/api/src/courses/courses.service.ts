import { BadRequestException, ConflictException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, CourseStatus } from '@prisma/client';
import { pick } from '../common/pick';

const COURSE_FIELDS = ['code', 'name', 'description', 'credits', 'department', 'color', 'emoji'] as const;

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { search?: string; department?: string }) {
    return this.prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        ...(query.department && { department: query.department }),
        ...(query.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        teacher: { select: { id: true, name: true, avatar: true } },
        _count: { select: { enrollments: true } },
      },
    });
  }

  async findAllForAdmin() {
    return this.prisma.course.findMany({
      include: {
        teacher: { select: { id: true, name: true, avatar: true } },
        _count: { select: { enrollments: true, materials: true, quizzes: true } },
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findForTeacher(teacherId: string) {
    return this.prisma.course.findMany({
      where: { teacherId },
      include: {
        _count: { select: { enrollments: true, materials: true, quizzes: true } },
      },
    });
  }

  async findMyStudents(teacherId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
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

    const grades = await this.prisma.grade.groupBy({
      by: ['studentId', 'courseId'],
      _avg: { score: true },
      where: { studentId: { in: studentIds }, courseId: { in: courseIds } }
    });

    const attendances = await this.prisma.attendance.groupBy({
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
        name: e.student.name,
        email: e.student.email,
        course: e.course.name,
        grade: letterGrade,
        attendance: attendancePercent
      };
    });
  }

  async findForStudent(studentId: string) {
    return this.prisma.enrollment.findMany({
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

  async findOne(id: string, user: { id: string; role: string }) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, name: true, avatar: true, email: true } },
        enrollments: { include: { student: { select: { id: true, name: true, email: true, avatar: true } } } },
        materials: { orderBy: { createdAt: 'desc' } },
        quizzes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    // Only the teacher, admins and enrolled students see the roster and materials; others get the catalogue view.
    const insider = user.role === Role.ADMIN || course.teacherId === user.id || course.enrollments.some((e) => e.studentId === user.id);
    if (insider) return course;
    const { enrollments, materials, quizzes, ...info } = course;
    return { ...info, teacher: course.teacher && { id: course.teacher.id, name: course.teacher.name, avatar: course.teacher.avatar }, _count: { enrollments: enrollments.length, materials: materials.length } };
  }

  async create(teacherId: string, data: any) {
    const fields = pick(data, COURSE_FIELDS);
    if (typeof fields.code !== 'string' || !fields.code.trim() || typeof fields.name !== 'string' || !fields.name.trim()) {
      throw new BadRequestException('Course name and code are required');
    }
    if (await this.prisma.course.findUnique({ where: { code: fields.code.trim() } })) throw new ConflictException('A course with this code already exists');
    return this.prisma.course.create({
      data: { ...(fields as any), code: fields.code.trim(), name: fields.name.trim(), teacherId, status: 'DRAFT' },
    });
  }

  async update(id: string, teacherId: string, role: Role, data: any) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    if (role !== Role.ADMIN && course.teacherId !== teacherId) throw new ForbiddenException();
    // Only admins may reassign a course to another teacher.
    const fields = pick(data, role === Role.ADMIN ? [...COURSE_FIELDS, 'status', 'teacherId'] as const : [...COURSE_FIELDS, 'status'] as const);
    return this.prisma.course.update({ where: { id }, data: fields as any });
  }

  async remove(id: string, teacherId: string, role: Role) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    if (role !== Role.ADMIN && course.teacherId !== teacherId) throw new ForbiddenException();
    return this.prisma.course.delete({ where: { id } });
  }

  async enroll(courseId: string, studentId: string) {
    return this.prisma.enrollment.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      create: { studentId, courseId },
      update: {},
    });
  }

  async unenroll(courseId: string, studentId: string) {
    return this.prisma.enrollment.delete({
      where: { studentId_courseId: { studentId, courseId } },
    });
  }
}
