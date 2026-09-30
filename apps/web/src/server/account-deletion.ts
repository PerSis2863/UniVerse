import prisma from '@/lib/db';
import { forgetUser, isOwnerEmail } from './auth';
import { notify, sendEmail } from './email';

// Permanent account deletion. The person asks (Settings → Privacy → Delete my account); the
// platform owner reviews the request in the owner console — so nobody can delete someone else's
// account from an unlocked device, and misuse can be stopped — and approves or declines it.
// Approving erases the account: everything that identifies the person is removed or replaced,
// and their personal records are deleted. Records other people rely on (e.g. a course a teacher
// ran, grades in a class register) stay, no longer linked to anyone identifiable.

export async function requestDeletion(user: { id: string; name: string; email: string }, reason: string | null) {
  const open = await prisma.accountDeletionRequest.findFirst({ where: { userId: user.id, status: 'PENDING' } });
  if (open) return open;
  const req = await prisma.accountDeletionRequest.create({ data: { userId: user.id, email: user.email, name: user.name, reason: reason?.slice(0, 1000) || null } });
  const owners = (await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true, email: true } })).filter((u) => isOwnerEmail(u.email));
  await Promise.all(owners.map((o) => notify(o.id, {
    title: 'Account deletion request',
    body: `${user.name} (${user.email}) asked to delete their account${reason ? `: “${reason.slice(0, 200)}”` : '.'} Review it in the owner console.`,
    link: '/console?tab=deletions',
    type: 'warning',
  })));
  return req;
}

export async function cancelDeletion(userId: string) {
  await prisma.accountDeletionRequest.updateMany({ where: { userId, status: 'PENDING' }, data: { status: 'CANCELLED', decidedAt: new Date() } });
}

/** Erases an account (see above). Safe to run twice. */
export async function eraseAccount(userId: string) {
  const anon = `deleted-${userId}@deleted.invalid`;
  await prisma.$transaction([
    prisma.loginEvent.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.pushSubscription.deleteMany({ where: { userId } }),
    prisma.skillPassport.deleteMany({ where: { userId } }),
    prisma.studyCard.deleteMany({ where: { userId } }),
    prisma.studentSkill.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        name: 'Deleted user', email: anon, firebaseUid: null, googleId: null, avatar: null, phone: null,
        dateOfBirth: null, emergencyContacts: [], emailNotifications: false, status: 'SUSPENDED',
      },
    }),
  ]);
  forgetUser(userId);
}

export async function decideDeletion(id: string, decision: 'approve' | 'decline', owner: { id: string }, note: string | null) {
  const req = await prisma.accountDeletionRequest.findUnique({ where: { id } });
  if (!req || req.status !== 'PENDING') return null;
  if (decision === 'approve') {
    // Tell them first, while we still have their address.
    await sendEmail(req.email, 'Your UniVerse account has been deleted',
      `<p>Hello ${escapeHtml(req.name)},</p><p>As you asked, your UniVerse account and the personal data linked to it have been deleted.</p><p>If you didn’t ask for this, reply to this email straight away.</p><p>— UniVerse Impact</p>`,
      `Hello ${req.name},\n\nAs you asked, your UniVerse account and the personal data linked to it have been deleted.\n\nIf you didn't ask for this, reply to this email straight away.\n\n— UniVerse Impact`,
    ).catch(() => {});
    await eraseAccount(req.userId);
  } else {
    await notify(req.userId, {
      title: 'Your account deletion request was declined',
      body: note ? `Reason: ${note.slice(0, 500)}` : 'Please contact support if you still want your account deleted.',
      link: '/student/settings?section=privacy',
      type: 'info',
    });
  }
  return prisma.accountDeletionRequest.update({ where: { id }, data: { status: decision === 'approve' ? 'APPROVED' : 'DECLINED', decidedById: owner.id, decidedAt: new Date(), note: note?.slice(0, 500) || null } });
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
