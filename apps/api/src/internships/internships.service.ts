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

  private async getOrCreateCompany(companyName: string) {
    if (!companyName) return null;
    let company = await this.prisma.company.findFirst({
      where: { name: { equals: companyName, mode: 'insensitive' } }
    });
    if (!company) {
      company = await this.prisma.company.create({
        data: { name: companyName }
      });
    }
    return company.id;
  }

  async create(userId: string, data: any) {
    const { company, ...rest } = data;
    const companyId = await this.getOrCreateCompany(company);
    return this.prisma.internship.create({
      data: {
        ...rest,
        companyId: companyId,
        postedById: userId,
      }
    });
  }

  async update(id: string, data: any) {
    const { company, companyId: _cid, ...rest } = data;
    const updateData: any = { ...rest };
    if (company) {
      updateData.companyId = await this.getOrCreateCompany(company);
    }
    return this.prisma.internship.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    return this.prisma.internship.delete({
      where: { id }
    });
  }
}
