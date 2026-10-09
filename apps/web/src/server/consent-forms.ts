import prisma from '@/lib/db';
import { isOwnBlobUrl } from '@/lib/chat';
import type { SessionUser } from '@/lib/server-auth';
import { notify, notifyMany } from './email';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { publish } from './realtime';
import { pushService } from './services/push.service';

// Consent forms with an e-signature (Stage 5 · B16.4). The school (admins: any class, or every
// student) or a teacher (one of their classes) sends a form: a trip permission, photo consent, a
// medical form. Parents linked to those students get it in the parent app (in-app + push, never
// email) and answer for each child: yes or no (when declining is allowed), a note, and a signature:
// their typed full name, the box "I'm their parent or guardian and sign electronically", and, if
// they like, a drawn signature. One answer per child; it can be changed while the form is open.
// The sender follows who answered, reminds the rest (at most twice a day) and closes the form.

const MAX_TITLE = 120, MAX_BODY = 5000, MAX_NOTE = 500, MAX_SIGNATURE = 20_000;
const REMIND_EVERY_MS = 12 * 3600_000;
/** Drawn signatures: SVG path data starting with a move, with move/line commands and whole numbers only. */
const PATH = /^M-?\d+ -?\d+(?: [ML]-?\d+ -?\d+)*$/;
const isStaff = (u: SessionUser) => u.role === 'TEACHER' || u.role === 'ADMIN';
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const isOpen = (f: { closedAt: Date | null }) => !f.closedAt;
/** A drawn signature as the parent app sends it, or null when it's missing or not one. */
export const cleanSignature = (v: unknown) => (typeof v === 'string' && v.length <= MAX_SIGNATURE && PATH.test(v) ? v : null);
/** The name a parent typed to sign, tidied; '' when it's too short to count. */
export function cleanName(v: unknown) {
  const name = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 100) : '';
  return name.length >= 2 ? name : '';
}
/** An answer-by date ("2026-11-14" means the end of that day): null when not given; throws when it's wrong or past. */
export function dueDate(v: unknown, now = Date.now()) {
  if (typeof v !== 'string' || !v) return null;
  const at = new Date(/T/.test(v) ? v : `${v}T23:59:59`);
  if (!Number.isFinite(at.getTime())) throw new BadRequestException('That date doesn’t look right.');
  if (at.getTime() < now - 86_400_000) throw new BadRequestException('The answer-by date has passed.');
  return at;
}
/** Where the sender follows a form: admins in Administrative, teachers next to their students. */
export const senderLink = (role: string, id: string) => (role === 'ADMIN' ? `/admin/administrative?tab=forms&form=${id}` : `/teacher/forms?form=${id}`);

/** Who a form is for: a class's students, or every active student. */
const forWhom = (form: { courseId: string | null }) =>
  form.courseId ? { enrollments: { some: { courseId: form.courseId } }, status: { not: 'SUSPENDED' as const } } : { role: 'STUDENT' as const, status: 'ACTIVE' as const };

/** Parent accounts linked to the students a form is for (one query, even for the whole school). */
const linksFor = (form: { courseId: string | null }) =>
  prisma.guardianLink.findMany({ where: { student: forWhom(form) }, select: { guardianId: true, studentId: true }, take: 10_000 });

async function tellParents(form: { id: string; title: string; dueAt: Date | null }, guardianIds: string[], from: string, again = false) {
  const ids = [...new Set(guardianIds)];
  if (!ids.length) return 0;
  const due = form.dueAt ? ` · please answer by ${form.dueAt.toISOString().slice(0, 10)}` : '';
  const title = again ? `Reminder: ${form.title}` : `Form to sign: ${form.title}`;
  const body = `From ${from}${due}`;
  const link = `/parent?tab=forms&form=${form.id}`;
  // In the app (two queries per 90 people, so within D1's 50 a request) and a push for as many
  // as the plan allows. Never email (src/server/email.ts budget).
  await notifyMany(ids.slice(0, 900), { type: 'consent', title, body, link, email: false });
  await pushService.sendToMany(ids, { title, body, url: link, tag: `consent-${form.id}` }).catch(() => 0);
  return Math.min(ids.length, 900);
}

// ── Senders (teachers and admins) ───────────────────────────────────────────────────────────

/** GET /api/consent-forms: the forms I sent (admins: all), with how many answered; and where I can send one. */
export async function staffForms(user: SessionUser) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers and school admins send forms.');
  const admin = user.role === 'ADMIN';
  const [forms, courses, allStudents] = await Promise.all([
    prisma.consentForm.findMany({
      where: admin ? {} : { createdById: user.id }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, title: true, courseId: true, dueAt: true, closedAt: true, createdAt: true, course: { select: { code: true, name: true } }, createdBy: { select: { name: true } } },
    }),
    prisma.course.findMany({ where: admin ? {} : { teacherId: user.id }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 200 }),
    admin ? prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }) : Promise.resolve(0),
  ]);
  const ids = forms.map((f) => f.id);
  const courseIds = [...new Set(forms.map((f) => f.courseId).filter((c): c is string => !!c))];
  const [answers, sizes] = await Promise.all([
    ids.length ? prisma.consentResponse.groupBy({ by: ['formId', 'answer'], where: { formId: { in: ids } }, _count: { _all: true } }) : Promise.resolve([]),
    courseIds.length ? prisma.enrollment.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: { _all: true } }) : Promise.resolve([]),
  ]);
  const count = (formId: string, answer: string) => answers.find((a) => a.formId === formId && a.answer === answer)?._count._all ?? 0;
  return {
    canSendToSchool: admin,
    courses,
    forms: forms.map((f) => ({
      id: f.id, title: f.title, dueAt: f.dueAt, closed: !isOpen(f), createdAt: f.createdAt, from: f.createdBy.name,
      to: f.course ? `${f.course.code} · ${f.course.name}` : 'Every student',
      students: f.courseId ? sizes.find((s) => s.courseId === f.courseId)?._count._all ?? 0 : allStudents,
      yes: count(f.id, 'YES'), no: count(f.id, 'NO'),
    })),
  };
}

/** POST /api/consent-forms { title, body, courseId?, dueAt?, allowDecline?, attachmentUrl?, attachmentName? } */
export async function createConsentForm(user: SessionUser, b: Record<string, unknown>) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers and school admins send forms.');
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, MAX_TITLE) : '';
  const body = typeof b.body === 'string' ? b.body.trim().slice(0, MAX_BODY) : '';
  if (!title) throw new BadRequestException('Give the form a title.');
  if (!body) throw new BadRequestException('Say what parents are agreeing to.');
  const courseId = typeof b.courseId === 'string' && b.courseId ? b.courseId : null;
  if (!courseId && user.role !== 'ADMIN') throw new BadRequestException('Pick one of your classes.');
  const course = courseId ? await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, teacherId: true } }) : null;
  if (courseId && (!course || (user.role !== 'ADMIN' && course.teacherId !== user.id))) throw new NotFoundException('That class isn’t one of yours.');
  const dueAt = dueDate(b.dueAt);
  const attachmentUrl = typeof b.attachmentUrl === 'string' && b.attachmentUrl ? b.attachmentUrl : null;
  if (attachmentUrl && !isOwnBlobUrl(attachmentUrl)) throw new BadRequestException('Attach a file uploaded here.');
  const form = await prisma.consentForm.create({
    data: {
      title, body, courseId, dueAt, allowDecline: b.allowDecline !== false, createdById: user.id,
      attachmentUrl, attachmentName: attachmentUrl ? (typeof b.attachmentName === 'string' ? b.attachmentName.slice(0, 200) : 'Attachment') : null,
    },
    select: { id: true, title: true, dueAt: true },
  });
  const links = await linksFor({ courseId });
  const told = await tellParents(form, links.map((l) => l.guardianId), course ? `${user.name} · ${course.code}` : user.name);
  return { id: form.id, told };
}

async function staffForm(user: SessionUser, id: string) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers and school admins send forms.');
  const form = await prisma.consentForm.findUnique({ where: { id }, include: { course: { select: { code: true, name: true } }, createdBy: { select: { name: true } } } });
  if (!form || (user.role !== 'ADMIN' && form.createdById !== user.id)) throw new NotFoundException('That form doesn’t exist.');
  return form;
}

/** GET /api/consent-forms/:id: every student and where their answer stands. */
export async function consentFormDetail(user: SessionUser, id: string) {
  const form = await staffForm(user, id);
  const [people, links, responses] = await Promise.all([
    prisma.user.findMany({ where: forWhom(form), select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 2000 }),
    linksFor(form),
    prisma.consentResponse.findMany({ where: { formId: id }, select: { studentId: true, answer: true, note: true, signedName: true, signedAt: true, signature: true, guardian: { select: { name: true } } } }),
  ]);
  const byStudent = new Map(responses.map((r) => [r.studentId, r]));
  const linked = new Set(links.map((l) => l.studentId));
  const rows = people.map((p) => {
    const r = byStudent.get(p.id);
    const status = r ? (r.answer === 'YES' ? 'yes' : 'no') : linked.has(p.id) ? 'waiting' : 'no-parent';
    return { studentId: p.id, name: p.name, status, answer: r ? { by: r.guardian.name, signedName: r.signedName, signedAt: r.signedAt, note: r.note, drawn: !!r.signature } : null };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const tally = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    form: { id: form.id, title: form.title, body: form.body, attachmentUrl: form.attachmentUrl, attachmentName: form.attachmentName, dueAt: form.dueAt, allowDecline: form.allowDecline, closed: !isOpen(form), remindedAt: form.remindedAt, createdAt: form.createdAt, from: form.createdBy.name, to: form.course ? `${form.course.code} · ${form.course.name}` : 'Every student' },
    counts: { students: rows.length, yes: tally('yes'), no: tally('no'), waiting: tally('waiting'), noParent: tally('no-parent') },
    rows,
  };
}

/** POST /api/consent-forms/:id { action: 'remind' | 'close' | 'reopen' } */
export async function consentFormAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  const form = await staffForm(user, id);
  if (b.action === 'close' || b.action === 'reopen') {
    await prisma.consentForm.update({ where: { id }, data: { closedAt: b.action === 'close' ? new Date() : null } });
    return { closed: b.action === 'close' };
  }
  if (b.action !== 'remind') throw new BadRequestException('Unknown action.');
  if (!isOpen(form)) throw new BadRequestException('Reopen the form to remind parents.');
  if (form.remindedAt && Date.now() - form.remindedAt.getTime() < REMIND_EVERY_MS) throw new HttpException('Parents were reminded in the last 12 hours.', 429);
  const [links, done] = await Promise.all([linksFor(form), prisma.consentResponse.findMany({ where: { formId: id }, select: { studentId: true } })]);
  const answered = new Set(done.map((r) => r.studentId));
  await prisma.consentForm.update({ where: { id }, data: { remindedAt: new Date() } });
  const told = await tellParents(form, links.filter((l) => !answered.has(l.studentId)).map((l) => l.guardianId), form.course ? `${form.createdBy.name} · ${form.course.code}` : form.createdBy.name, true);
  return { told };
}

// ── Parents ─────────────────────────────────────────────────────────────────────────────────

/** GET /api/parent/forms: forms for my children (open ones, and those closed in the last 30 days), each with every child's answer. */
export async function parentForms(user: SessionUser) {
  if (user.role !== 'GUARDIAN') throw new ForbiddenException('This is for parent accounts.');
  const links = await prisma.guardianLink.findMany({ where: { guardianId: user.id }, select: { studentId: true, student: { select: { name: true, enrollments: { select: { courseId: true }, take: 60 } } } } });
  if (!links.length) return { waiting: 0, forms: [] };
  const courseIds = [...new Set(links.flatMap((l) => l.student.enrollments.map((e) => e.courseId)))];
  const forms = await prisma.consentForm.findMany({
    where: {
      createdAt: { gt: new Date(Date.now() - 180 * 86_400_000) },
      OR: [{ closedAt: null }, { closedAt: { gt: new Date(Date.now() - 30 * 86_400_000) } }],
      AND: [{ OR: [{ courseId: null }, ...(courseIds.length ? [{ courseId: { in: courseIds.slice(0, 90) } }] : [])] }],
    },
    orderBy: { createdAt: 'desc' }, take: 50,
    select: { id: true, title: true, body: true, attachmentUrl: true, attachmentName: true, courseId: true, dueAt: true, allowDecline: true, closedAt: true, createdAt: true, course: { select: { code: true } }, createdBy: { select: { name: true } } },
  });
  const responses = forms.length ? await prisma.consentResponse.findMany({
    where: { formId: { in: forms.map((f) => f.id) }, studentId: { in: links.map((l) => l.studentId) } },
    select: { formId: true, studentId: true, answer: true, note: true, signedName: true, signedAt: true, guardianId: true, guardian: { select: { name: true } } },
  }) : [];
  let waiting = 0;
  const out = forms.map((f) => {
    const kids = links.filter((l) => !f.courseId || l.student.enrollments.some((e) => e.courseId === f.courseId));
    const children = kids.map((k) => {
      const r = responses.find((x) => x.formId === f.id && x.studentId === k.studentId);
      if (!r && isOpen(f)) waiting++;
      return { studentId: k.studentId, firstName: firstName(k.student.name), response: r ? { answer: r.answer, note: r.note, signedName: r.signedName, signedAt: r.signedAt, mine: r.guardianId === user.id, by: r.guardian.name } : null };
    });
    return {
      id: f.id, title: f.title, body: f.body, attachmentUrl: f.attachmentUrl, attachmentName: f.attachmentName, dueAt: f.dueAt, allowDecline: f.allowDecline,
      closed: !isOpen(f), createdAt: f.createdAt, from: f.course ? `${f.createdBy.name} · ${f.course.code}` : f.createdBy.name, children,
    };
  });
  return { waiting, forms: out };
}

/** POST /api/parent/forms/:id { studentId, answer: 'YES' | 'NO', note?, signedName, signature?, agree: true } */
export async function signConsentForm(user: SessionUser, formId: string, b: Record<string, unknown>) {
  if (user.role !== 'GUARDIAN') throw new ForbiddenException('This is for parent accounts.');
  const form = await prisma.consentForm.findUnique({ where: { id: formId }, select: { id: true, title: true, courseId: true, allowDecline: true, closedAt: true, createdById: true, createdBy: { select: { role: true } } } });
  if (!form) throw new NotFoundException('That form doesn’t exist.');
  if (!isOpen(form)) throw new BadRequestException('This form is closed. Contact the school if something changed.');
  const studentId = typeof b.studentId === 'string' ? b.studentId : '';
  const link = await prisma.guardianLink.findUnique({ where: { guardianId_studentId: { guardianId: user.id, studentId } }, select: { studentId: true } });
  if (!link) throw new NotFoundException('That child isn’t linked to your account.');
  if (form.courseId && !(await prisma.enrollment.findFirst({ where: { courseId: form.courseId, studentId }, select: { id: true } }))) throw new NotFoundException('This form isn’t for that child.');
  const answer = b.answer === 'YES' || (b.answer === 'NO' && form.allowDecline) ? b.answer : null;
  if (!answer) throw new BadRequestException(form.allowDecline ? 'Choose yes or no.' : 'This form can only be agreed to.');
  if (b.agree !== true) throw new BadRequestException('Tick the box to sign electronically.');
  const signedName = cleanName(b.signedName);
  if (!signedName) throw new BadRequestException('Type your full name to sign.');
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, MAX_NOTE) || null : null;
  const signature = cleanSignature(b.signature);
  const data = { guardianId: user.id, answer, note, signedName, signature, signedAt: new Date() };
  const before = await prisma.consentResponse.findUnique({ where: { formId_studentId: { formId, studentId } }, select: { id: true } });
  await prisma.consentResponse.upsert({ where: { formId_studentId: { formId, studentId } }, update: data, create: { formId, studentId, ...data } });
  publish([form.createdById], { type: 'refresh', keys: ['/api/consent-forms*'] });
  // The last child with a parent account was just answered for: the sender hears it once.
  if (!before) {
    const [links, done] = await Promise.all([linksFor(form), prisma.consentResponse.findMany({ where: { formId }, select: { studentId: true } })]);
    const answered = new Set(done.map((r) => r.studentId));
    if (links.every((l) => answered.has(l.studentId))) {
      await notify(form.createdById, { type: 'consent', title: `Everyone answered: ${form.title}`, body: 'Every parent with an account has answered the form.', link: senderLink(form.createdBy.role, form.id), email: false });
    }
  }
  return { ok: true, answer, signedAt: data.signedAt };
}
