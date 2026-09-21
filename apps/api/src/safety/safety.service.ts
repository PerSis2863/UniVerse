import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SafetyService {
  constructor(private prisma: PrismaService) {}
  findAll() { return this.prisma.safetyAlert.findMany({ orderBy: { createdAt: 'desc' } }); }
  create(reporterId: string, data: any) {
    const { isAnonymous, ...rest } = data;
    return this.prisma.safetyAlert.create({ data: { ...rest, reporterId: isAnonymous ? null : reporterId, isAnonymous: !!isAnonymous } });
  }
  resolve(id: string) { return this.prisma.safetyAlert.update({ where: { id }, data: { isResolved: true, resolvedAt: new Date() } }); }
}
