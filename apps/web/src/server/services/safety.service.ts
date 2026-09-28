
import prisma from '@/lib/db';

export class SafetyService {
  findAll() { return prisma.safetyAlert.findMany({ orderBy: { createdAt: 'desc' } }); }
  create(reporterId: string, data: any) {
    const { isAnonymous, ...rest } = data;
    return prisma.safetyAlert.create({ data: { ...rest, reporterId: isAnonymous ? null : reporterId, isAnonymous: !!isAnonymous } });
  }
  resolve(id: string) { return prisma.safetyAlert.update({ where: { id }, data: { isResolved: true, resolvedAt: new Date() } }); }
}
