
import { AlertSeverity } from '@prisma/client';
import prisma from '@/lib/db';
import { BadRequestException } from '../http';
import { later, notifyMany } from '../email';

const SEVERITIES = Object.values(AlertSeverity) as string[];

export class SafetyService {
  /** Open reports first, newest first. The reporter only for reports that weren't anonymous. */
  findAll() {
    return prisma.safetyAlert.findMany({
      orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }],
      take: 300,
      include: { reporter: { select: { id: true, name: true, email: true, role: true } } },
    });
  }
  async create(reporterId: string, data: Record<string, unknown> | null) {
    // Only the report itself comes from the request (not isResolved etc.).
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const title = str(data?.title, 200);
    const description = str(data?.description, 5000);
    if (!title || !description) throw new BadRequestException('title and description are required');
    const severity = typeof data?.severity === 'string' && SEVERITIES.includes(data.severity) ? (data.severity as AlertSeverity) : undefined;
    const isAnonymous = !!data?.isAnonymous;
    const alert = await prisma.safetyAlert.create({
      data: { title, description, location: str(data?.location, 300) || null, severity, reporterId: isAnonymous ? null : reporterId, isAnonymous },
    });
    // Every active admin hears about it at once in the app (no email: it keeps the plan's allowance
    // for sign-in codes; urgent reports are marked Urgent in the bell).
    later(async () => {
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true }, take: 500 });
      const urgent = alert.severity === 'HIGH' || alert.severity === 'CRITICAL';
      await notifyMany(admins.map((a) => a.id), {
        title: `${urgent ? 'Urgent ' : ''}BeeSafe report: ${title}`,
        body: `${alert.location ? `Location: ${alert.location}\n` : ''}${description.slice(0, 300)}${description.length > 300 ? '…' : ''}`,
        link: '/admin/safety',
        type: 'safety',
        email: false,
      });
    });
    return { id: alert.id, createdAt: alert.createdAt };
  }
  resolve(id: string) { return prisma.safetyAlert.update({ where: { id }, data: { isResolved: true, resolvedAt: new Date() } }); }
}
