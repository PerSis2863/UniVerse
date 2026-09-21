import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InternshipsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: any) {
    return this.prisma.internship.findMany({
      where: {
        isActive: true,
        ...(query.search && { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }] }),
        ...(query.type && { type: query.type }),
      },
      include: { company: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.internship.findUnique({ where: { id }, include: { company: true, applications: { include: { student: { select: { id: true, name: true, email: true, avatar: true } } } } } });
    if (!item) throw new NotFoundException();
    return item;
  }

  async create(userId: string, data: any) {
    return this.prisma.internship.create({ data: { ...data, postedById: userId } });
  }

  async apply(internshipId: string, studentId: string, body: any) {
    return this.prisma.internshipApplication.upsert({
      where: { internshipId_studentId: { internshipId, studentId } },
      create: { internshipId, studentId, ...body },
      update: body,
    });
  }

  async getMyApplications(studentId: string) {
    return this.prisma.internshipApplication.findMany({ where: { studentId }, include: { internship: { include: { company: true } } } });
  }

  async updateApplication(id: string, data: any) {
    return this.prisma.internshipApplication.update({ where: { id }, data });
  }
}
