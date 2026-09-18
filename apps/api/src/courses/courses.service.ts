import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, CourseStatus } from '@prisma/client';

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

  async findForTeacher(teacherId: string) {
    return this.prisma.course.findMany({
      where: { teacherId },
      include: {
        _count: { select: { enrollments: true, materials: true, quizzes: true } },
      },
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

  async findOne(id: string) {
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
    return course;
  }

  async create(teacherId: string, data: any) {
    return this.prisma.course.create({
      data: { ...data, teacherId, status: 'DRAFT' },
    });
  }

  async update(id: string, teacherId: string, role: Role, data: any) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    if (role !== Role.ADMIN && course.teacherId !== teacherId) throw new ForbiddenException();
    return this.prisma.course.update({ where: { id }, data });
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
