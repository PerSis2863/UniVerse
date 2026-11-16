import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { ForbiddenException } from './http';
import { orgIn, schoolsOf, usersIn } from './school-scope';
import { policyKey, policySchools } from './safety';

// M199: what is kept to the admin's school, counted live, for Admin → Safety → Who can see what.
// The words on the page (who sees what, what's shared on purpose) are written in the page.

/** GET /api/admin/visibility */
export async function schoolVisibility(user: SessionUser) {
  if (user.role !== 'ADMIN' && !user.owner) throw new ForbiddenException('Only school admins see this.');
  const schools = await schoolsOf(user);
  const people = usersIn(schools);
  const [roles, courses, rooms, buildings, policy, orgs] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], where: people, _count: { _all: true } }),
    prisma.course.count({ where: { teacher: people } }),
    prisma.room.count({ where: orgIn(schools) }),
    prisma.campusBuilding.count({ where: { campusId: null, ...orgIn(schools) } }),
    policySchools(user).then((s) => prisma.schoolPolicy.findUnique({ where: { id: policyKey(s[0]) }, select: { updatedAt: true } })),
    schools === 'all' ? Promise.resolve([]) : prisma.organization.findMany({ where: { id: { in: schools.filter((s): s is string => !!s) } }, select: { name: true }, take: 10 }),
  ]);
  const count = (r: string) => roles.find((x) => x.role === r)?._count._all ?? 0;
  return {
    everyone: schools === 'all',
    schools: schools === 'all' ? [] : [...(schools.includes(null) ? ['Your main school'] : []), ...orgs.map((o) => o.name)],
    kept: { students: count('STUDENT'), teachers: count('TEACHER'), parents: count('GUARDIAN'), admins: count('ADMIN'), courses, rooms, buildings },
    ownPolicy: !!policy,
  };
}
