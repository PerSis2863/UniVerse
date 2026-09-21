import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ElectivesService {
  constructor(private prisma: PrismaService) {}

  async getAvailableElectives(studentId: string) {
    // Return courses that the student hasn't requested or enrolled in
    return this.prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        enrollments: { none: { studentId } },
        electiveRequests: { none: { studentId } },
      },
      include: {
        teacher: { select: { id: true, name: true } },
      },
    });
  }

  async getMyElectives(studentId: string) {
    return this.prisma.electiveRequest.findMany({ where: { studentId }, include: { course: { include: { teacher: { select: { id: true, name: true } } } } } });
  }

  async selectElective(studentId: string, data: any) {
    return this.prisma.electiveRequest.upsert({
      where: { studentId_courseId_semesterId: { studentId, courseId: data.courseId, semesterId: data.semesterId ?? '' } },
      create: { studentId, ...data },
      update: { status: 'PENDING' },
    });
  }

  async withdrawElective(id: string) {
    return this.prisma.electiveRequest.update({ where: { id }, data: { status: 'WITHDRAWN' } });
  }

  async getMyMajorRequests(studentId: string) {
    return this.prisma.majorChangeRequest.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } });
  }

  async submitMajorRequest(studentId: string, data: any) {
    return this.prisma.majorChangeRequest.create({ data: { studentId, ...data } });
  }

  async reviewMajorRequest(id: string, reviewedById: string, data: any) {
    return this.prisma.majorChangeRequest.update({ where: { id }, data: { reviewedById, ...data } });
  }
}
