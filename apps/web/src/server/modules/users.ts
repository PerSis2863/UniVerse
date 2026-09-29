import type { Role, UserStatus } from '@prisma/client';
import type { Router } from '../router';
import prisma from '@/lib/db';
import { pick } from '../pick';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../http';
import { forgetUser, isOwner, isOwnerEmail } from '../auth';
import { audit } from '../audit';
import { currentApplication } from './applications';
import { TERMS_VERSION } from '@/lib/terms-version';

const USER_STATUSES: UserStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED'];

const safeSelect = {
  id: true, name: true, email: true, role: true, status: true,
  avatar: true, phone: true, googleId: true, emailNotifications: true, termsVersion: true, termsAcceptedAt: true, createdAt: true, updatedAt: true,
  studentProfile: true, teacherProfile: true,
};

async function findOne(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: safeSelect });
  if (!user) throw new NotFoundException('User not found');
  return user;
}

export default function users(router: Router) {
  const r = router.controller('users');

  r.get('', { roles: ['ADMIN'] }, ({ query }) => {
    const where: any = {};
    if (query.role) where.role = query.role as Role;
    if (query.status) where.status = query.status as UserStatus;
    if (query.search) where.OR = [{ name: { contains: query.search } }, { email: { contains: query.search } }];
    return prisma.user.findMany({ where, select: safeSelect, orderBy: { createdAt: 'desc' } });
  });

  r.get('directory', ({ query }) => {
    const where: any = { role: 'STUDENT', status: 'ACTIVE' };
    if (query.search) where.OR = [{ name: { contains: query.search } }, { email: { contains: query.search } }];
    return prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, avatar: true, studentProfile: { select: { department: true, year: true } } },
      orderBy: { name: 'asc' },
    });
  });

  r.get('stats', { roles: ['ADMIN'] }, async () => {
    const [total, students, teachers, pending] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.user.count({ where: { status: 'PENDING' } }),
    ]);
    return { total, students, teachers, pending };
  });

  // `owner` is only ever present (true) for the platform owner, so the app can open the console.
  r.get('me', async ({ user }) => ({ ...(await findOne(user.id)), application: await currentApplication(user.id), ...(isOwner(user) ? { owner: true } : {}) }));

  // Other people's contact details and grades (GPA) are for admins; everyone else gets a public card.
  r.get<{ id: string }>(':id', async ({ params, user }) => {
    if (user.role === 'ADMIN' || params.id === user.id) return findOne(params.id);
    const card = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, avatar: true, role: true, studentProfile: { select: { department: true, year: true } }, teacherProfile: { select: { department: true } } },
    });
    if (!card) throw new NotFoundException('User not found');
    return card;
  });

  r.post('invitations', { roles: ['ADMIN'] }, async ({ body, user, req }) => {
    const email = String(body.email ?? '');
    const role = body.role as Role;
    if (await prisma.user.findUnique({ where: { email } })) throw new ConflictException('User with this email already exists');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const invitation = await prisma.invitation.upsert({
      where: { email },
      update: { role, status: 'PENDING', expiresAt },
      create: { email, role, status: 'PENDING', expiresAt },
    });
    audit(user, { action: 'user.invited', summary: `Invited ${email} as ${role}`, targetType: 'invitation', targetId: invitation.id, metadata: { email, role } }, req);
    return { success: true, invitation };
  });

  // Accepting the Terms of Use & Privacy Notice (first sign-in, or after they change).
  r.post('me/terms', async ({ user, body }) => {
    if (body?.version !== TERMS_VERSION) throw new BadRequestException('Please reload the page to see the latest terms.');
    const updated = await prisma.user.update({ where: { id: user.id }, data: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() }, select: safeSelect });
    forgetUser(user.id);
    return updated;
  });

  // Only profile fields: the old API passed the whole body through, which let users change their role.
  r.patch('me', async ({ user, body }) => {
    const data: Record<string, unknown> = pick(body, ['name', 'phone', 'avatar'] as const);
    if (typeof body?.emailNotifications === 'boolean') data.emailNotifications = body.emailNotifications;
    const updated = await prisma.user.update({ where: { id: user.id }, data, select: safeSelect });
    forgetUser(user.id);
    return updated;
  });

  r.patch<{ id: string }>(':id/status', { roles: ['ADMIN'] }, async ({ params, body, user, req }) => {
    const status = body.status as UserStatus;
    if (!USER_STATUSES.includes(status)) throw new BadRequestException(`status must be one of ${USER_STATUSES.join(', ')}`);
    if (params.id === user.id) throw new BadRequestException("You can't change the status of your own account.");
    await assertNotOwner(params.id);
    const updated = await prisma.user.update({ where: { id: params.id }, data: { status }, select: safeSelect });
    forgetUser(params.id);
    audit(user, { action: 'user.status_changed', summary: `Set ${updated.name}'s account to ${status}`, targetType: 'user', targetId: params.id, metadata: { status } }, req);
    return updated;
  });

  r.delete<{ id: string }>(':id', { roles: ['ADMIN'] }, async ({ params, user, req }) => {
    if (params.id === user.id) throw new BadRequestException("You can't delete your own account here.");
    await assertNotOwner(params.id);
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { name: true, email: true, role: true } });
    if (!target) throw new NotFoundException('User not found');
    await prisma.user.delete({ where: { id: params.id } });
    forgetUser(params.id);
    audit(user, { action: 'user.deleted', summary: `Deleted ${target.name} (${target.email})`, targetType: 'user', targetId: params.id, metadata: target }, req);
    return { success: true };
  });
}

/** The platform owner's account can't be suspended or deleted by other admins. */
async function assertNotOwner(id: string) {
  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (target && isOwnerEmail(target.email)) throw new ForbiddenException('This account is protected.');
}
