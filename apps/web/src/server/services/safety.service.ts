
import { AlertSeverity, type Prisma, type User } from '@prisma/client';
import prisma from '@/lib/db';
import { BadRequestException, NotFoundException } from '../http';
import { later, notifyMany } from '../email';
import { schoolsOf, usersIn, type SchoolIds } from '../school-scope';

const SEVERITIES = Object.values(AlertSeverity) as string[];

// A school's admins see only reports by their own school's people. Anonymous reports keep no
// reporter (so no school): only the platform owner sees those in the list.
const scope = (schools: SchoolIds | 'all'): Prisma.SafetyAlertWhereInput => (schools === 'all' ? {} : { reporter: usersIn(schools) });

/** Active admins who look after this school's people (its own admins and the admin who owns it; null = the main school). */
function schoolAdminsWhere(organizationId: string | null | undefined): Prisma.UserWhereInput {
  const school: Prisma.UserWhereInput = organizationId ? { OR: [{ organizationId }, { ownedOrganization: { is: { id: organizationId } } }] } : { organizationId: null };
  return { AND: [{ role: 'ADMIN', status: 'ACTIVE' }, school] };
}

export class SafetyService {
  /** Open reports first, newest first. The reporter only for reports that weren't anonymous. */
  async findAll(admin: User) {
    return prisma.safetyAlert.findMany({
      where: scope(await schoolsOf(admin)),
      orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }],
      take: 300,
      include: { reporter: { select: { id: true, name: true, email: true, role: true } } },
    });
  }
  async create(reporter: Pick<User, 'id' | 'organizationId'>, data: Record<string, unknown> | null) {
    const reporterId = reporter.id;
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
    // The reporter's school's active admins hear about it at once in the app (no email: it keeps the
    // plan's allowance for sign-in codes; urgent reports are marked Urgent in the bell). Anonymous
    // reports still go to every active admin, as before: the report keeps no school to narrow it by.
    later(async () => {
      const admins = await prisma.user.findMany({ where: isAnonymous ? { role: 'ADMIN', status: 'ACTIVE' } : schoolAdminsWhere(reporter.organizationId), select: { id: true }, take: 500 });
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
  /** Only a report the admin can see (another school's, or an anonymous one for a school admin, looks "not found"). */
  async resolve(id: string, admin: User) {
    const found = await prisma.safetyAlert.findFirst({ where: { id, ...scope(await schoolsOf(admin)) }, select: { id: true } });
    if (!found) throw new NotFoundException('Report not found');
    return prisma.safetyAlert.update({ where: { id }, data: { isResolved: true, resolvedAt: new Date() } });
  }
}
