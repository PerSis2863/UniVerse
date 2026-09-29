import type { Router } from '../router';
import prisma from '@/lib/db';
import { ForbiddenException, UnauthorizedException } from '../http';
import { forgetUser, isDemoAccount, isDemoLoginEnabled } from '../auth';
import { audit } from '../audit';
import { later, notify } from '../email';

const userSelect = {
  id: true, name: true, email: true, role: true, status: true, avatar: true,
  phone: true, googleId: true, createdAt: true, updatedAt: true,
  studentProfile: true, teacherProfile: true,
};

const getMe = (id: string) => prisma.user.findUnique({ where: { id }, select: userSelect });

export default function auth(router: Router) {
  const r = router.controller('auth');

  r.get('me', ({ user }) => getMe(user.id));

  r.post('login', { public: true }, async ({ body }) => {
    if (isDemoLoginEnabled() && isDemoAccount(body?.email)) {
      const user = await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() }, select: userSelect });
      if (user) return { accessToken: `mock-token-${user.id}`, refreshToken: `mock-token-${user.id}`, user };
    }
    throw new UnauthorizedException('Invalid credentials');
  });

  // Update name/role after Firebase sign-up. ADMIN can never be self-assigned.
  r.post('register', async ({ user, body, req }) => {
    const data: { name?: string; role?: 'STUDENT' | 'TEACHER' } = {};
    if (body?.name && String(body.name).trim()) data.name = String(body.name).trim().slice(0, 100);
    // The role is chosen once, while signing up; afterwards only an admin can change it.
    // (Before, any student could make themselves a teacher at any time.)
    const fresh = Date.now() - new Date((await prisma.user.findUnique({ where: { id: user.id }, select: { createdAt: true } }))!.createdAt).getTime() < 60 * 60_000;
    if ((body.role === 'STUDENT' || body.role === 'TEACHER') && body.role !== user.role) {
      if (!fresh || user.role === 'ADMIN') throw new ForbiddenException('Your role can only be changed by an administrator.');
      data.role = body.role;
    }
    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data });
      forgetUser(user.id);
      if (data.role && data.role !== user.role) {
        audit(user, { action: 'user.role_changed', summary: `${data.name ?? user.name} signed up as ${data.role}`, targetType: 'user', targetId: user.id, metadata: { from: user.role, to: data.role } }, req);
      }
      if (data.role === 'TEACHER' && user.role !== 'TEACHER') {
        // Anyone can sign up as a teacher, so admins hear about it straight away.
        const name = data.name ?? user.name;
        later(async () => {
          const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
          await Promise.all(admins.map((a) => notify(a.id, { type: 'signup', title: 'New teacher sign-up', body: `${name} (${user.email}) signed up as a teacher. Check the account in Users.`, link: '/admin/users' })));
        });
      }
    }
    return getMe(user.id);
  });
}
