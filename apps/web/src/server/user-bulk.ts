import type { Role, UserStatus } from '@prisma/client';
import prisma from '@/lib/db';
import { forgetUser, isOwnerEmail } from './auth';
import { BadRequestException, NotFoundException } from './http';

// Admin → Users, several people at once (Stage 5 · Phase E): deactivate or reactivate them, or fix
// a wrong role (student ↔ teacher), and renew an invitation that's about to run out. Admins only
// (the routes in modules/users.ts check that); never your own account or the owner's.

/** At most this many people per request for a status change (one update, a lookup). */
export const STATUS_BATCH = 200;
/** At most this many per request for a role change (a profile each: D1 allows 50 queries). */
export const ROLE_BATCH = 20;
const SWITCHABLE: Role[] = ['STUDENT', 'TEACHER'];

type Actor = { id: string };
export interface Skipped { id: string; name: string; why: string }

function cleanIds(ids: string[], max: number) {
  const unique = [...new Set(ids.filter((id) => /^[A-Za-z0-9_-]{1,40}$/.test(id)))];
  if (!unique.length) throw new BadRequestException('Choose at least one person.');
  if (unique.length > max) throw new BadRequestException(`Choose up to ${max} people at a time.`);
  return unique;
}

/** Deactivates or reactivates several accounts. */
export async function bulkStatus(actor: Actor, ids: string[], status: UserStatus) {
  const wanted = cleanIds(ids, STATUS_BATCH);
  const people = await prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true, email: true, status: true } });
  const skipped: Skipped[] = [];
  const change: string[] = [];
  for (const p of people) {
    if (p.id === actor.id) skipped.push({ id: p.id, name: p.name, why: 'Your own account' });
    else if (isOwnerEmail(p.email)) skipped.push({ id: p.id, name: p.name, why: 'This account is protected' });
    else if (p.status !== status) change.push(p.id);
  }
  if (change.length) await prisma.user.updateMany({ where: { id: { in: change } }, data: { status } });
  change.forEach(forgetUser);
  return { changed: change.length, skipped, names: people.filter((p) => change.includes(p.id)).map((p) => p.name) };
}

/**
 * Fixes a wrong role: students become teachers or the other way round. Only for people with no
 * courses yet (a teacher who still teaches a course, or a student enrolled in one, would leave
 * courses in a state nobody chose); admins, guardians and mentors aren't changed here.
 */
export async function bulkRole(actor: Actor, ids: string[], role: Role) {
  if (!SWITCHABLE.includes(role)) throw new BadRequestException('Choose Student or Teacher.');
  const wanted = cleanIds(ids, ROLE_BATCH);
  const people = await prisma.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, name: true, email: true, role: true, _count: { select: { taughtCourses: true, enrollments: true } } },
  });
  const skipped: Skipped[] = [];
  const change: typeof people = [];
  for (const p of people) {
    if (p.id === actor.id) skipped.push({ id: p.id, name: p.name, why: 'Your own account' });
    else if (isOwnerEmail(p.email)) skipped.push({ id: p.id, name: p.name, why: 'This account is protected' });
    else if (p.role === role) continue;
    else if (!SWITCHABLE.includes(p.role)) skipped.push({ id: p.id, name: p.name, why: `${p.role === 'ADMIN' ? 'An admin' : 'Not a student or teacher'}: change it on the Roles tab` });
    else if (p._count.taughtCourses > 0) skipped.push({ id: p.id, name: p.name, why: `Teaches ${p._count.taughtCourses} course${p._count.taughtCourses === 1 ? '' : 's'}: give them to another teacher first` });
    else if (p._count.enrollments > 0) skipped.push({ id: p.id, name: p.name, why: `Enrolled in ${p._count.enrollments} course${p._count.enrollments === 1 ? '' : 's'}: remove them first` });
    else change.push(p);
  }
  if (change.length) {
    await prisma.user.updateMany({ where: { id: { in: change.map((p) => p.id) } }, data: { role, accountType: role === 'STUDENT' ? 'STUDENT' : 'STAFF' } });
    // Each role has its profile (department, year…); the other one stays, harmless, if it existed.
    for (const p of change) {
      if (role === 'STUDENT') await prisma.studentProfile.upsert({ where: { userId: p.id }, update: {}, create: { userId: p.id } });
      else await prisma.teacherProfile.upsert({ where: { userId: p.id }, update: {}, create: { userId: p.id } });
      forgetUser(p.id);
    }
  }
  return { changed: change.length, skipped, names: change.map((p) => p.name) };
}

/** "Resend": another 30 days for an invitation (no email is sent; share the sign-up link). */
export async function renewInvitation(id: string, now = new Date()) {
  const inv = await prisma.invitation.findUnique({ where: { id }, select: { id: true, email: true, status: true } });
  if (!inv || inv.status !== 'PENDING') throw new NotFoundException('Invitation not found');
  const expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  await prisma.invitation.update({ where: { id: inv.id }, data: { expiresAt } });
  return { id: inv.id, email: inv.email, expiresAt };
}
