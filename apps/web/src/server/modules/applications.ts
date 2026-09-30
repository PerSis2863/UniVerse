import type { Prisma, Role, RoleApplicationStatus } from '@prisma/client';
import type { Router } from '../router';
import prisma from '@/lib/db';
import { isAppFileUrl } from '@/lib/storage';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../http';
import { forgetUser } from '../auth';
import { audit } from '../audit';
import { later, notify } from '../email';

// Applications to become a teacher or NGO representative.
//
// Choosing "teacher" when signing up (or applying later from Settings) no longer grants the role:
// the account keeps student permissions until an admin approves the application. Admins can
// approve, decline (with a reason the applicant sees) or ask for more information; every step is
// kept in the application's history, written to the Activity Log and notified to the people
// involved. Admins can skip the review by inviting someone (Users → Invite): an invited person who
// signs up with that (verified) email address gets the role straight away.

export const REQUESTABLE_ROLES = ['STUDENT', 'TEACHER', 'ADMIN'] as const;
type RequestableRole = (typeof REQUESTABLE_ROLES)[number];
const OPEN: RoleApplicationStatus[] = ['DRAFT', 'PENDING', 'NEEDS_INFO'];
const REAPPLY_AFTER_DAYS = 7;
const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|aol|proton(mail)?|gmx|mail|yandex|zoho)\.[a-z.]+$/i;

export const ROLE_LABEL: Record<RequestableRole, string> = { STUDENT: 'verified student', TEACHER: 'teacher', ADMIN: 'organization representative' };

type HistoryEvent = { at: string; by?: string | null; byName?: string | null; type: string; note?: string | null };
type Actor = { id: string; name?: string | null; role: string };

const historyOf = (v: Prisma.JsonValue | null): HistoryEvent[] => (Array.isArray(v) ? (v as unknown as HistoryEvent[]) : []);
const withEvent = (v: Prisma.JsonValue | null, e: Omit<HistoryEvent, 'at'>) => [...historyOf(v), { at: new Date().toISOString(), ...e }] as unknown as Prisma.InputJsonValue;

const applicantSelect = { id: true, name: true, email: true, avatar: true, role: true, status: true, createdAt: true, phone: true, googleId: true, firebaseUid: true } as const;

/** The latest application of a user, in the short form the app needs everywhere. */
export async function currentApplication(userId: string) {
  return prisma.roleApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, source: true, requestedRole: true, adminNote: true, submittedAt: true, reviewedAt: true },
  });
}

/** Starts an application when someone picks "teacher" / "NGO" while signing up. */
export async function startSignupApplication(user: Actor, requestedRole: RequestableRole) {
  const open = await prisma.roleApplication.findFirst({ where: { userId: user.id, status: { in: OPEN } }, select: { id: true } });
  if (open) return;
  await prisma.roleApplication.create({
    data: { userId: user.id, requestedRole, source: 'SIGNUP', status: 'DRAFT', history: [{ at: new Date().toISOString(), by: user.id, byName: user.name, type: 'created' }] },
  });
}

/** Grants the role at once for someone an admin invited, and records it as an approved application. */
export async function approveInvited(user: Actor & { email: string }, role: RequestableRole, invitationId: string) {
  await prisma.user.update({ where: { id: user.id }, data: { role, status: 'ACTIVE' } });
  await prisma.invitation.update({ where: { id: invitationId }, data: { status: 'ACTIVE' } });
  await prisma.roleApplication.create({
    data: {
      userId: user.id, requestedRole: role, source: 'SIGNUP', status: 'APPROVED', submittedAt: new Date(), reviewedAt: new Date(),
      history: [{ at: new Date().toISOString(), type: 'invited', note: 'Approved automatically: invited by an admin' }],
    },
  });
  forgetUser(user.id);
}

// ─── Validation ────────────────────────────────────────────────────────────────────────────────

const TEXT_FIELDS = {
  institution: 150, department: 120, position: 100, staffId: 60, workEmail: 150, phone: 30, subjects: 300, profileUrl: 300, message: 2000,
} as const;

/** Picks and cleans the fields an applicant may set. */
function applicantFields(body: Record<string, any> | null | undefined) { // eslint-disable-line @typescript-eslint/no-explicit-any -- request body
  const data: Record<string, unknown> = {};
  for (const [k, max] of Object.entries(TEXT_FIELDS)) {
    if (body?.[k] === undefined) continue;
    const v = typeof body[k] === 'string' ? body[k].trim().slice(0, max) : '';
    data[k] = v || null;
  }
  if (typeof data.workEmail === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.workEmail)) throw new BadRequestException('Enter a valid work email address.');
  if (typeof data.phone === 'string' && !/^\+?[0-9 ()-]{7,20}$/.test(data.phone)) throw new BadRequestException('Enter a valid phone number, e.g. +91 98765 43210.');
  if (typeof data.profileUrl === 'string' && !/^https?:\/\/[^\s]+$/i.test(data.profileUrl)) throw new BadRequestException('The profile link must start with https://');
  if (body?.experienceYears !== undefined) {
    const n = body.experienceYears === null || body.experienceYears === '' ? null : Number(body.experienceYears);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 60)) throw new BadRequestException('Years of experience must be a whole number from 0 to 60.');
    data.experienceYears = n;
  }
  if (body?.proofUrl !== undefined) {
    if (body.proofUrl === null || body.proofUrl === '') {
      data.proofUrl = null;
      data.proofName = null;
    } else {
      if (!isAppFileUrl(body.proofUrl)) throw new BadRequestException('Upload the document through the form.');
      data.proofUrl = body.proofUrl;
      data.proofName = typeof body.proofName === 'string' ? body.proofName.slice(0, 200) : 'document';
    }
  }
  return data;
}

/** What must be filled in before an application can be sent. */
function missingForSubmit(app: { requestedRole: string; [k: string]: unknown }): string[] {
  const missing: string[] = [];
  const need = (k: string, label: string) => { if (!app[k]) missing.push(label); };
  if (app.requestedRole === 'STUDENT') {
    need('institution', 'university or school');
    need('department', 'programme');
    if (!app.proofUrl && !app.workEmail) missing.push('your student card or enrolment certificate (or your university email)');
    return missing;
  }
  if (app.requestedRole === 'ADMIN') {
    need('institution', 'organization');
    need('position', 'your role at the organization');
    need('message', 'what your organization does');
  } else {
    need('institution', 'institution');
    need('department', 'department');
    need('position', 'position');
  }
  if (!app.staffId && !app.workEmail && !app.proofUrl) missing.push('at least one way to verify you (staff ID, work email or a document)');
  return missing;
}

// ─── Routes ────────────────────────────────────────────────────────────────────────────────────

export default function applicationsModule(router: Router) {
  const r = router.controller('applications');

  // ── For applicants ──

  /** Your latest application, and whether you can start a new one. */
  r.get('mine', async ({ user }) => {
    const app = await prisma.roleApplication.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    let canApply = user.role === 'STUDENT' && (!app || !OPEN.includes(app.status));
    let reapplyAfter: string | null = null;
    if (canApply && app?.status === 'REJECTED' && app.reviewedAt) {
      const at = new Date(app.reviewedAt.getTime() + REAPPLY_AFTER_DAYS * 86_400_000);
      if (at.getTime() > Date.now()) {
        canApply = false;
        reapplyAfter = at.toISOString();
      }
    }
    return { application: app && { ...app, history: historyOf(app.history), reviewedById: undefined }, canApply, reapplyAfter };
  });

  /** Start an application (students applying later; people who signed up as teacher already have one). */
  r.post('', async ({ user, body }) => {
    if (user.role !== 'STUDENT') throw new ForbiddenException('Your account already has staff access.');
    const requestedRole = (REQUESTABLE_ROLES as readonly string[]).includes(body?.requestedRole) ? (body.requestedRole as RequestableRole) : 'TEACHER';
    const last = await prisma.roleApplication.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { status: true, reviewedAt: true } });
    if (last && OPEN.includes(last.status)) throw new ConflictException('You already have an application in progress.');
    if (last?.status === 'REJECTED' && last.reviewedAt && Date.now() - last.reviewedAt.getTime() < REAPPLY_AFTER_DAYS * 86_400_000) {
      throw new ForbiddenException(`You can apply again ${REAPPLY_AFTER_DAYS} days after a decision.`);
    }
    const app = await prisma.roleApplication.create({
      data: { userId: user.id, requestedRole, source: 'UPGRADE', status: 'DRAFT', ...applicantFields(body), history: [{ at: new Date().toISOString(), by: user.id, byName: user.name, type: 'created' }] },
    });
    return body?.submit ? submit(app.id, user) : app;
  });

  /** Update your application while it's open; `submit: true` sends it for review. */
  r.patch('mine', async ({ user, body }) => {
    const app = await prisma.roleApplication.findFirst({ where: { userId: user.id, status: { in: OPEN } }, orderBy: { createdAt: 'desc' } });
    if (!app) throw new NotFoundException('You have no open application.');
    const data = applicantFields(body);
    if ((REQUESTABLE_ROLES as readonly string[]).includes(body?.requestedRole) && app.status === 'DRAFT') data.requestedRole = body.requestedRole;
    const changed = Object.keys(data).length > 0;
    const updated = changed
      ? await prisma.roleApplication.update({
          where: { id: app.id },
          data: { ...data, ...(app.status !== 'DRAFT' && !body?.submit ? { history: withEvent(app.history, { by: user.id, byName: user.name, type: 'updated' }) } : {}) },
        })
      : app;
    return body?.submit ? submit(updated.id, user) : updated;
  });

  /** Withdraw your application. If you signed up as a teacher you carry on as a student. */
  r.post('mine/withdraw', async ({ user, req }) => {
    const app = await prisma.roleApplication.findFirst({ where: { userId: user.id, status: { in: OPEN } }, orderBy: { createdAt: 'desc' } });
    if (!app) throw new NotFoundException('You have no open application.');
    const done = await prisma.roleApplication.update({ where: { id: app.id }, data: { status: 'WITHDRAWN', history: withEvent(app.history, { by: user.id, byName: user.name, type: 'withdrawn' }) } });
    audit(user, { action: 'application.withdrawn', summary: `${user.name} withdrew their ${ROLE_LABEL[app.requestedRole as RequestableRole] ?? 'staff'} application`, targetType: 'role_application', targetId: app.id }, req);
    return done;
  });

  // ── For admins ──

  /** Applications with a status filter and search, plus counts for the tabs. */
  r.get('', { roles: ['ADMIN'] }, async ({ query }) => {
    const status = (['PENDING', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const).find((s) => s === query.status) ?? 'PENDING';
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    const where: Prisma.RoleApplicationWhereInput = {
      status,
      ...(q ? { OR: [{ user: { name: { contains: q } } }, { user: { email: { contains: q } } }, { institution: { contains: q } }, { department: { contains: q } }] } : {}),
    };
    const [items, grouped] = await Promise.all([
      prisma.roleApplication.findMany({
        where,
        orderBy: status === 'PENDING' || status === 'NEEDS_INFO' ? { submittedAt: 'asc' } : { reviewedAt: 'desc' },
        take: 100,
        include: { user: { select: applicantSelect }, reviewedBy: { select: { id: true, name: true } } },
      }),
      prisma.roleApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    return { items: items.map((a) => ({ ...a, history: historyOf(a.history), user: publicApplicant(a.user) })), counts };
  });

  /** One application with automatic checks to help the review. */
  r.get<{ id: string }>(':id', { roles: ['ADMIN'] }, async ({ params }) => {
    const app = await prisma.roleApplication.findUnique({
      where: { id: params.id },
      include: { user: { select: applicantSelect }, reviewedBy: { select: { id: true, name: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    const [previous, sameStaffId] = await Promise.all([
      prisma.roleApplication.findMany({ where: { userId: app.userId, id: { not: app.id }, status: { not: 'DRAFT' } }, select: { id: true, status: true, submittedAt: true, adminNote: true }, orderBy: { createdAt: 'desc' } }),
      app.staffId ? prisma.roleApplication.count({ where: { staffId: app.staffId, userId: { not: app.userId } } }) : 0,
    ]);
    return { ...app, history: historyOf(app.history), user: publicApplicant(app.user), previous, checks: reviewChecks(app, app.user, previous, sameStaffId) };
  });

  r.post<{ id: string }>(':id/approve', { roles: ['ADMIN'] }, async ({ params, body, user, req }) => {
    const app = await openForReview(params.id, user);
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : '';
    const role = app.requestedRole as RequestableRole;
    await prisma.user.update({ where: { id: app.userId }, data: { role, status: 'ACTIVE', accountType: role === 'STUDENT' ? 'STUDENT' : role === 'TEACHER' ? 'STAFF' : 'ORGANIZATION' } });
    if (role === 'STUDENT') {
      await prisma.studentProfile.upsert({ where: { userId: app.userId }, update: { department: app.department ?? undefined }, create: { userId: app.userId, department: app.department ?? null } });
    }
    if (role === 'TEACHER') {
      await prisma.teacherProfile.upsert({
        where: { userId: app.userId },
        update: { department: app.department ?? undefined },
        create: { userId: app.userId, department: app.department ?? null },
      });
    }
    const done = await prisma.roleApplication.update({
      where: { id: app.id },
      data: { status: 'APPROVED', adminNote: note || null, reviewedById: user.id, reviewedAt: new Date(), history: withEvent(app.history, { by: user.id, byName: user.name, type: 'approved', note: note || null }) },
    });
    forgetUser(app.userId);
    audit(user, { action: 'application.approved', summary: `Approved ${app.user.name} (${app.user.email}) as ${ROLE_LABEL[role]}`, targetType: 'user', targetId: app.userId, metadata: { applicationId: app.id, role } }, req);
    later(() => notify(app.userId, {
      type: 'application',
      title: `You're approved as a ${ROLE_LABEL[role]}`,
      body: `Your application was approved${note ? `: ${note}` : '.'} Sign out and back in if you don't see your new dashboard.`,
      link: role === 'TEACHER' ? '/teacher' : role === 'ADMIN' ? '/admin' : '/student',
    }));
    return done;
  });

  r.post<{ id: string }>(':id/reject', { roles: ['ADMIN'] }, async ({ params, body, user, req }) => {
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
    if (!reason) throw new BadRequestException('Tell the applicant why (they will see this).');
    const app = await openForReview(params.id, user);
    const done = await prisma.roleApplication.update({
      where: { id: app.id },
      data: { status: 'REJECTED', adminNote: reason, reviewedById: user.id, reviewedAt: new Date(), history: withEvent(app.history, { by: user.id, byName: user.name, type: 'rejected', note: reason }) },
    });
    audit(user, { action: 'application.rejected', summary: `Declined ${app.user.name}'s ${ROLE_LABEL[app.requestedRole as RequestableRole]} application: ${reason}`, targetType: 'user', targetId: app.userId, metadata: { applicationId: app.id } }, req);
    later(() => notify(app.userId, {
      type: 'application',
      title: 'Your application was not approved',
      body: `${reason}\nYour account works as a student account. You can apply again in ${REAPPLY_AFTER_DAYS} days.`,
      link: '/application',
    }));
    return done;
  });

  r.post<{ id: string }>(':id/request-info', { roles: ['ADMIN'] }, async ({ params, body, user, req }) => {
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1000) : '';
    if (!message) throw new BadRequestException('Say what information you need.');
    const app = await openForReview(params.id, user);
    const done = await prisma.roleApplication.update({
      where: { id: app.id },
      data: { status: 'NEEDS_INFO', adminNote: message, reviewedById: user.id, history: withEvent(app.history, { by: user.id, byName: user.name, type: 'info_requested', note: message }) },
    });
    audit(user, { action: 'application.info_requested', summary: `Asked ${app.user.name} for more information: ${message}`, targetType: 'user', targetId: app.userId, metadata: { applicationId: app.id } }, req);
    later(() => notify(app.userId, { type: 'application', title: 'More information needed for your application', body: message, link: '/application' }));
    return done;
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────────────────────

async function submit(id: string, user: Actor) {
  const app = await prisma.roleApplication.findUniqueOrThrow({ where: { id } });
  const missing = missingForSubmit(app);
  if (missing.length) throw new BadRequestException(`Please add: ${missing.join(', ')}.`);
  if (app.status === 'PENDING') return app; // already sent (and possibly just updated)
  const answeringQuestion = app.status === 'NEEDS_INFO';
  const done = await prisma.roleApplication.update({
    where: { id },
    data: {
      status: 'PENDING',
      submittedAt: app.submittedAt ?? new Date(),
      history: withEvent(app.history, { by: user.id, byName: user.name, type: answeringQuestion ? 'info_provided' : 'submitted' }),
    },
  });
  const label = ROLE_LABEL[app.requestedRole as RequestableRole] ?? 'staff';
  later(async () => {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
    await Promise.all(
      admins.map((a) => notify(a.id, {
        type: 'application',
        title: answeringQuestion ? `${user.name} answered your question` : `New ${label} application`,
        body: answeringQuestion
          ? `${user.name} updated their ${label} application. It's ready for review again.`
          : `${user.name}${app.institution ? ` (${app.institution})` : ''} applied to become a ${label}.`,
        link: `/admin/approvals?id=${id}`,
      })),
    );
  });
  return done;
}

async function openForReview(id: string, admin: Actor) {
  const app = await prisma.roleApplication.findUnique({ where: { id }, include: { user: { select: { name: true, email: true, role: true, status: true } } } });
  if (!app) throw new NotFoundException('Application not found');
  if (app.userId === admin.id) throw new ForbiddenException("You can't review your own application.");
  if (app.status !== 'PENDING' && app.status !== 'NEEDS_INFO') throw new ConflictException(`This application is already ${app.status.toLowerCase().replace('_', ' ')}.`);
  if (app.user.role !== 'STUDENT') throw new ConflictException('This account already has staff access.');
  if (app.user.status === 'SUSPENDED') throw new ConflictException('This account is suspended. Reactivate it in Users first.');
  return app;
}

function publicApplicant(u: { id: string; name: string; email: string; avatar: string | null; role: Role; status: string; createdAt: Date; phone: string | null; googleId: string | null; firebaseUid: string | null }) {
  return { id: u.id, name: u.name, email: u.email, avatar: u.avatar, role: u.role, status: u.status, createdAt: u.createdAt, phone: u.phone };
}

/** Plain-language hints for the reviewer: what supports the application and what to double-check. */
function reviewChecks(
  app: { workEmail: string | null; staffId: string | null; proofUrl: string | null; institution: string | null; profileUrl: string | null },
  user: { email: string; createdAt: Date; status: string },
  previous: { status: string }[],
  sameStaffId: number,
) {
  const checks: { ok: boolean; text: string }[] = [];
  const ageDays = Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000);
  checks.push({ ok: ageDays >= 1, text: ageDays < 1 ? 'Account created today' : `Account is ${ageDays} day${ageDays === 1 ? '' : 's'} old` });
  if (app.workEmail) {
    checks.push({ ok: !FREE_MAIL.test(app.workEmail), text: FREE_MAIL.test(app.workEmail) ? `Work email ${app.workEmail} is a personal address` : `Work email at ${app.workEmail.split('@')[1]}` });
    if (app.workEmail.toLowerCase() !== user.email.toLowerCase()) checks.push({ ok: true, text: 'Work email differs from sign-in email: contact them there to confirm' });
  }
  if (FREE_MAIL.test(user.email) && !app.workEmail) checks.push({ ok: false, text: 'Signed in with a personal email and gave no work email' });
  checks.push({ ok: !!app.proofUrl, text: app.proofUrl ? 'Document attached' : 'No document attached' });
  if (app.staffId) checks.push({ ok: sameStaffId === 0, text: sameStaffId ? `Staff ID also used by ${sameStaffId} other applicant${sameStaffId === 1 ? '' : 's'}` : 'Staff ID not used by anyone else' });
  if (app.profileUrl) checks.push({ ok: true, text: 'Public profile link given: open it to confirm' });
  const rejected = previous.filter((p) => p.status === 'REJECTED').length;
  if (rejected) checks.push({ ok: false, text: `Declined ${rejected} time${rejected === 1 ? '' : 's'} before` });
  if (user.status === 'SUSPENDED') checks.push({ ok: false, text: 'Account is suspended' });
  return checks;
}
