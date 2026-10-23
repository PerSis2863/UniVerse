import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { isOwner } from './auth';
import { NotFoundException } from './http';

// Which school's people an admin may see and change (security fix, 22 Oct 2026). UniVerse can host
// several schools: each person has `organizationId`, and people in none belong to the main school.
// An admin's school is their own `organizationId`; an admin in none runs the main school (people in
// no school) and the school they own (`organizations.ownerId`: OneRoster puts imported people
// there). The platform owner sees everyone. Before this, every admin saw every school's people,
// activity log and data exports.

type Who = { id: string; role?: string; organizationId?: string | null; owner?: boolean; email?: string };
/** A school id, or null for the main school (people in no school). */
export type SchoolIds = (string | null)[];

// The answer per signed-in user object (the sign-in cache keeps the same object for a minute; a
// changed user gets a new object). Only the finished answer is kept: a promise still waiting on the
// database must never be shared between requests. Workers can't hand one request's I/O to another,
// so a second request awaiting it hangs and is cancelled ("your Worker's code had hung").
const memo = new WeakMap<object, SchoolIds | 'all'>();

/** The schools this person's admin views cover, or 'all' for the platform owner. */
export async function schoolsOf(user: Who): Promise<SchoolIds | 'all'> {
  const known = memo.get(user);
  if (known) return known;
  let answer: SchoolIds | 'all';
  if (user.owner === true || isOwner(user as Parameters<typeof isOwner>[0])) answer = 'all';
  else {
    const owned = await prisma.organization.findUnique({ where: { ownerId: user.id }, select: { id: true } });
    answer = [user.organizationId ?? null];
    if (owned && owned.id !== user.organizationId) answer.push(owned.id);
  }
  memo.set(user, answer);
  return answer;
}

/** Whether a person of this school (organizationId) is in these schools. */
export function inSchools(schools: SchoolIds | 'all', organizationId: string | null | undefined): boolean {
  return schools === 'all' || schools.includes(organizationId ?? null);
}

/** A Prisma filter for users in these schools ({} for the owner). */
export function usersIn(schools: SchoolIds | 'all'): Prisma.UserWhereInput {
  return orgIn(schools);
}

/** The same filter for any record with its own `organizationId` (null: the main school). */
export function orgIn(schools: SchoolIds | 'all'): { organizationId?: string | null | { in: string[] }; OR?: { organizationId: string | null | { in: string[] } }[] } {
  if (schools === 'all') return {};
  const ids = schools.filter((s): s is string => !!s);
  const main = schools.includes(null);
  if (main && ids.length) return { OR: [{ organizationId: null }, { organizationId: { in: ids } }] };
  if (main) return { organizationId: null };
  return { organizationId: { in: ids } };
}

/** The people an admin may see: a Prisma filter on User. */
export async function peopleWhere(user: Who): Promise<Prisma.UserWhereInput> {
  return usersIn(await schoolsOf(user));
}

/** An SQL condition on a users table alias, with its values: `(u.organizationId IS NULL OR u.organizationId IN (?))`. */
export function schoolSql(schools: SchoolIds | 'all', alias = 'u'): { sql: string; args: string[] } {
  if (schools === 'all') return { sql: '1 = 1', args: [] };
  const ids = schools.filter((s): s is string => !!s);
  const parts = [...(schools.includes(null) ? [`${alias}.organizationId IS NULL`] : []), ...(ids.length ? [`${alias}.organizationId IN (${ids.map(() => '?').join(', ')})`] : [])];
  return { sql: `(${parts.join(' OR ') || '1 = 0'})`, args: ids };
}

/** Throws "not found" unless the person is in the admin's school (so another school's people can't even be confirmed). */
export async function assertInSchool(user: Who, personId: string): Promise<void> {
  const schools = await schoolsOf(user);
  if (schools === 'all') return;
  const ok = await prisma.user.findFirst({ where: { id: personId, ...usersIn(schools) }, select: { id: true } });
  if (!ok) throw new NotFoundException('User not found');
}

/** Of these people, the ones in the admin's school (for bulk actions). */
export async function keepInSchool(user: Who, ids: string[]): Promise<string[]> {
  const schools = await schoolsOf(user);
  if (schools === 'all' || !ids.length) return ids;
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 90) {
    const rows = await prisma.user.findMany({ where: { id: { in: ids.slice(i, i + 90) }, ...usersIn(schools) }, select: { id: true } });
    rows.forEach((r) => found.add(r.id));
  }
  return ids.filter((id) => found.has(id));
}
