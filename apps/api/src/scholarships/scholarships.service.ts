import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScholarshipsService {
  constructor(private prisma: PrismaService) {}
  findAll() { return this.prisma.scholarship.findMany({ where: { isActive: true }, include: { _count: { select: { applications: true } } } }); }
  apply(scholarshipId: string, studentId: string, data: any) {
    return this.prisma.scholarshipApplication.upsert({ where: { scholarshipId_studentId: { scholarshipId, studentId } }, create: { essay: typeof data?.essay === 'string' ? data.essay.slice(0, 5000) : undefined, scholarshipId, studentId }, update: { essay: typeof data?.essay === 'string' ? data.essay.slice(0, 5000) : undefined } });
  }
  getMyApplications(studentId: string) { return this.prisma.scholarshipApplication.findMany({ where: { studentId }, include: { scholarship: true } }); }
  create(data: any) { return this.prisma.scholarship.create({ data }); }
  updateApplication(id: string, data: any) { return this.prisma.scholarshipApplication.update({ where: { id }, data }); }
}
