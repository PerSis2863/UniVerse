import type { Router } from '../router';
import prisma from '@/lib/db';
import { UnauthorizedException } from '../http';
import { isDemoAccount, isDemoLoginEnabled } from '../auth';

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
  r.post('register', async ({ user, body }) => {
    const data: { name?: string; role?: 'STUDENT' | 'TEACHER' } = {};
    if (body.name && String(body.name).trim()) data.name = String(body.name).trim();
    if (body.role === 'STUDENT' || body.role === 'TEACHER') data.role = body.role;
    if (Object.keys(data).length > 0) await prisma.user.update({ where: { id: user.id }, data });
    return getMe(user.id);
  });
}
