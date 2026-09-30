import type { Role, UserStatus } from '@prisma/client';
import type { Router } from '../router';
import prisma from '@/lib/db';
import { pick } from '../pick';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../http';
import { forgetUser, isDemoAccount, isOwner, isOwnerEmail } from '../auth';
import { audit } from '../audit';
import { currentApplication } from './applications';
import { TERMS_VERSION } from '@/lib/terms-version';
import { exportUserData } from '../export';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const INVITABLE: Role[] = ['STUDENT', 'TEACHER', 'ADMIN'];
/** Invitations stay valid for 30 days: a class may take a few weeks to sign up. */
const inviteExpiry = () => new Date(Date.now() + 30 * 24 * 3600 * 1000);
import { cancelDeletion, requestDeletion } from '../account-deletion';

const USER_STATUSES: UserStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED'];

const safeSelect = {
  id: true, name: true, email: true, role: true, status: true,
  avatar: true, phone: true, googleId: true, emailNotifications: true, termsVersion: true, termsAcceptedAt: true, onboardedAt: true, createdAt: true, updatedAt: true,
  studentProfile: true, teacherProfile: true,
};

async function findOne(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: safeSelect });
  if (!user) throw new NotFoundException('User not found');
  return user;
}

export default function users(router: Router) {
  const r = router.controller('users');

  // "Delete my account": ask; the platform owner reviews the request (see server/account-deletion.ts).
  r.get('me/deletion', ({ user }) => prisma.accountDeletionRequest.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, reason: true, note: true, createdAt: true, decidedAt: true } }));
  r.post('me/deletion', async ({ user, body, req }) => {
    if (body?.confirm !== 'DELETE') throw new BadRequestException('Type DELETE to confirm.');
    if (isOwnerEmail(user.email)) throw new BadRequestException('The platform owner account can’t be deleted from here.');
    if (isDemoAccount(user.email)) throw new BadRequestException('Demo accounts can’t be deleted.');
    const r = await requestDeletion(user, typeof body?.reason === 'string' ? body.reason.trim() : null);
    audit(user, { action: 'account.deletion_requested', summary: `${user.name} asked to delete their account`, targetType: 'user', targetId: user.id }, req);
    return { id: r.id, status: r.status, createdAt: r.createdAt };
  });
  r.delete('me/deletion', async ({ user }) => { await cancelDeletion(user.id); return { ok: true }; });

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

  // Invitations: people an admin invites are approved automatically when they sign up with that
  // (verified) address: students are verified, staff and organizations get their role.
  r.post('invitations', { roles: ['ADMIN'] }, async ({ body, user, req }) => {
    const email = String(body.email ?? '').trim().toLowerCase();
    const role = body.role as Role;
    if (!EMAIL_RE.test(email)) throw new BadRequestException('Enter a valid email address.');
    if (!INVITABLE.includes(role)) throw new BadRequestException('Choose Student, Staff or Organization.');
    if (await prisma.user.findUnique({ where: { email } })) throw new ConflictException('User with this email already exists');
    const invitation = await prisma.invitation.upsert({
      where: { email },
      update: { role, status: 'PENDING', expiresAt: inviteExpiry() },
      create: { email, role, status: 'PENDING', expiresAt: inviteExpiry() },
    });
    audit(user, { action: 'user.invited', summary: `Invited ${email} as ${role}`, targetType: 'invitation', targetId: invitation.id, metadata: { email, role } }, req);
    return { success: true, invitation };
  });

  /** Invite many at once: a pasted list of addresses (commas, spaces or new lines), up to 1,000. */
  r.post('invitations/bulk', { roles: ['ADMIN'] }, async ({ body, user, req }) => {
    const role = body?.role as Role;
    if (!INVITABLE.includes(role)) throw new BadRequestException('Choose Student, Staff or Organization.');
    const found = String(body?.emails ?? '').toLowerCase().split(/[\s,;]+/).map((e) => e.replace(/^<|>$/g, '').trim()).filter(Boolean);
    const unique = [...new Set(found)];
    const invalid = unique.filter((e) => !EMAIL_RE.test(e));
    const valid = unique.filter((e) => EMAIL_RE.test(e));
    if (!valid.length) throw new BadRequestException('No valid email addresses found.');
    if (valid.length > 1000) throw new BadRequestException('Invite up to 1,000 people at a time.');
    const existing = new Set<string>();
    for (let i = 0; i < valid.length; i += 90) {
      const rows = await prisma.user.findMany({ where: { email: { in: valid.slice(i, i + 90) } }, select: { email: true } });
      rows.forEach((r) => existing.add(r.email.toLowerCase()));
    }
    const toInvite = valid.filter((e) => !existing.has(e));
    const expiresAt = inviteExpiry();
    for (let i = 0; i < toInvite.length; i += 25) {
      await prisma.$transaction(toInvite.slice(i, i + 25).map((email) => prisma.invitation.upsert({
        where: { email }, update: { role, status: 'PENDING', expiresAt }, create: { email, role, status: 'PENDING', expiresAt },
      })));
    }
    audit(user, { action: 'user.invited', summary: `Invited ${toInvite.length} people as ${role}`, targetType: 'invitation', metadata: { count: toInvite.length, role } }, req);
    return { invited: toInvite.length, alreadyMembers: [...existing], invalid, expiresAt };
  });

  r.get('invitations', { roles: ['ADMIN'] }, async () => {
    const rows = await prisma.invitation.findMany({ where: { status: 'PENDING', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, take: 1000, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true } });
    return { items: rows, total: rows.length };
  });

  r.delete<{ id: string }>('invitations/:id', { roles: ['ADMIN'] }, async ({ params, user, req }) => {
    const inv = await prisma.invitation.findUnique({ where: { id: params.id } });
    if (!inv) throw new NotFoundException('Invitation not found');
    await prisma.invitation.delete({ where: { id: inv.id } });
    audit(user, { action: 'user.invitation_revoked', summary: `Cancelled the invitation for ${inv.email}`, targetType: 'invitation', targetId: inv.id }, req);
    return { success: true };
  });

  // Accepting the Terms of Use & Privacy Notice (first sign-in, or after they change).
  // "Download my data": a JSON file of everything that belongs to the signed-in person.
  r.get('me/export', async ({ user, req }) => {
    const data = await exportUserData(user.id);
    audit(user, { action: 'user.data_exported', summary: `${user.name} downloaded their personal data`, targetType: 'User', targetId: user.id }, req);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="universe-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  });

  r.post('me/terms', async ({ user, body }) => {
    if (body?.version !== TERMS_VERSION) throw new BadRequestException('Please reload the page to see the latest terms.');
    const updated = await prisma.user.update({ where: { id: user.id }, data: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() }, select: safeSelect });
    forgetUser(user.id);
    return updated;
  });

  // Only profile fields: the old API passed the whole body through, which let users change their role.
  r.patch('me', async ({ user, body }) => {
    const data: Record<string, unknown> = pick(body, ['name', 'phone', 'avatar'] as const);
    // A profile photo must be an uploaded file or an https image address (a letter or other text
    // was being stored and loaded as an image, failing on every page that shows the person).
    if (data.avatar !== undefined && data.avatar !== null) {
      const a = String(data.avatar).trim();
      if (a === '') data.avatar = null;
      else if (a.length > 1000 || !(/^https:\/\/\S+$/.test(a) || /^\/api\/files\/[A-Za-z0-9_-]{16,}(\/\S*)?$/.test(a))) throw new BadRequestException('Upload a photo, or use an https image link.');
      else data.avatar = a;
    }
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
