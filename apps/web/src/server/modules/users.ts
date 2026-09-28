import type { Role, UserStatus } from '@prisma/client';
import type { Router } from '../router';
import prisma from '@/lib/db';
import { pick } from '../pick';
import { ConflictException, NotFoundException } from '../http';

const safeSelect = {
  id: true, name: true, email: true, role: true, status: true,
  avatar: true, phone: true, googleId: true, createdAt: true, updatedAt: true,
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

  r.get('me', ({ user }) => findOne(user.id));

  r.get<{ id: string }>(':id', ({ params }) => findOne(params.id));

  r.post('invitations', { roles: ['ADMIN'] }, async ({ body }) => {
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
    return { success: true, invitation };
  });

  // Only profile fields: the old API passed the whole body through, which let users change their role.
  r.patch('me', ({ user, body }) =>
    prisma.user.update({ where: { id: user.id }, data: pick(body, ['name', 'phone', 'avatar'] as const), select: safeSelect }),
  );

  r.patch<{ id: string }>(':id/status', { roles: ['ADMIN'] }, ({ params, body }) =>
    prisma.user.update({ where: { id: params.id }, data: { status: body.status as UserStatus }, select: safeSelect }),
  );

  r.delete<{ id: string }>(':id', { roles: ['ADMIN'] }, async ({ params }) => {
    await prisma.user.delete({ where: { id: params.id } });
    return { success: true };
  });
}
