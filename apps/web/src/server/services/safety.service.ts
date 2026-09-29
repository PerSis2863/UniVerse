
import { AlertSeverity } from '@prisma/client';
import prisma from '@/lib/db';
import { BadRequestException } from '../http';

const SEVERITIES = Object.values(AlertSeverity) as string[];

export class SafetyService {
  findAll() { return prisma.safetyAlert.findMany({ orderBy: { createdAt: 'desc' } }); }
  create(reporterId: string, data: any) {
    // Only the report itself comes from the request (not isResolved etc.).
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const title = str(data?.title, 200);
    const description = str(data?.description, 5000);
    if (!title || !description) throw new BadRequestException('title and description are required');
    const severity = SEVERITIES.includes(data?.severity) ? data.severity : undefined;
    const isAnonymous = !!data?.isAnonymous;
    return prisma.safetyAlert.create({
      data: { title, description, location: str(data?.location, 300) || null, severity, reporterId: isAnonymous ? null : reporterId, isAnonymous },
    });
  }
  resolve(id: string) { return prisma.safetyAlert.update({ where: { id }, data: { isResolved: true, resolvedAt: new Date() } }); }
}
