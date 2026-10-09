import prisma from '@/lib/db';
import { HHMM, validZone } from '@/lib/local-time';
import { isLanguage } from '@/lib/languages';
import type { SessionUser } from '@/lib/server-auth';
import { afterSend } from './chat-notify';
import { getSystemUser } from '@/lib/chat';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { chatMuted } from './moderation';
import { schoolPolicy } from './safety';
import { storedTranslations, translateMessages } from './translate';
import { DEFAULT_HOURS, hoursOf, hoursText, inHours, parseDays } from './parent-hours';

// Parent–teacher messages (Stage 5 · B16.2). A parent–teacher chat is an ordinary one-to-one chat
// marked with the child it's about (conversations.aboutStudentId), so the teacher answers from
// their usual inbox, with translation, read receipts and the chat safety check (src/server/safety.ts).
// Parents never touch the chat API itself (their accounts reach only /api/parent/*): they read and
// send through these functions, text only. School rules:
//   - a parent can write only to the teachers of a child linked to them, and a teacher only to the
//     parents of a student in their classes; the school can switch parent messages off;
//   - each teacher sets the hours they answer parents: outside them messages still arrive, without
//     a push to the teacher (src/server/chat-notify.ts), and the parent sees when to expect a reply;
//   - quiet hours, the safety check and moderation apply as in any chat;
//   - a parent can send at most PER_HOUR messages an hour.

const MAX_BODY = 2000;
const PER_HOUR = 30;

async function requireOn() {
  if (!(await schoolPolicy()).parentMessaging) throw new ForbiddenException('Your school hasn’t turned on parent messages.');
}

/** The teachers of a student (of their courses), with the course codes. */
async function teachersOf(studentId: string) {
  const rows = await prisma.enrollment.findMany({ where: { studentId }, select: { course: { select: { code: true, teacher: { select: { id: true, name: true, avatar: true, status: true } } } } }, take: 60 });
  const map = new Map<string, { id: string; name: string; avatar: string | null; courses: string[] }>();
  for (const { course } of rows) {
    const t = course.teacher;
    if (!t || t.status === 'SUSPENDED') continue;
    const had = map.get(t.id);
    map.set(t.id, { id: t.id, name: t.name, avatar: t.avatar, courses: [...(had?.courses ?? []), course.code] });
  }
  return [...map.values()];
}

async function linkedChild(guardianId: string, studentId: string) {
  const link = await prisma.guardianLink.findUnique({ where: { guardianId_studentId: { guardianId, studentId } }, select: { student: { select: { id: true, name: true } } } });
  if (!link) throw new NotFoundException('That child isn’t linked to your account.');
  return link.student;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Finds the chat between a parent and a teacher about a child, or makes it. */
async function chatFor(guardian: { id: string; name: string }, teacher: { id: string; name: string }, child: { id: string; name: string }, starter: string, lang?: string | null) {
  const found = await prisma.conversation.findFirst({
    where: { aboutStudentId: child.id, AND: [{ participants: { some: { userId: guardian.id } } }, { participants: { some: { userId: teacher.id } } }] },
    select: { id: true },
  });
  if (found) return found.id;
  const convo = await prisma.conversation.create({
    data: {
      isGroup: false, createdById: starter, aboutStudentId: child.id,
      participants: { create: [{ userId: guardian.id, translateTo: lang && isLanguage(lang) ? lang : null }, { userId: teacher.id }] },
    },
    select: { id: true },
  });
  await prisma.message.create({
    data: {
      conversationId: convo.id, senderId: starter, type: 'SYSTEM',
      body: `${guardian.name} and ${teacher.name}, about ${child.name}. Messages are checked for safety, and the school’s rules apply.`,
    },
  });
  return convo.id;
}

// ── Parents ─────────────────────────────────────────────────────────────────────────────────

/** GET /api/parent/chats?studentId=: the child's teachers, each with our chat (if any). */
export async function parentChats(user: SessionUser, studentIdRaw: unknown) {
  if (user.role !== 'GUARDIAN') throw new ForbiddenException('This is for parent accounts.');
  const policy = await schoolPolicy();
  const studentId = typeof studentIdRaw === 'string' ? studentIdRaw : '';
  const child = await linkedChild(user.id, studentId);
  if (!policy.parentMessaging) return { allowed: false, child: firstName(child.name), teachers: [] };
  const [teachers, convos] = await Promise.all([
    teachersOf(child.id),
    prisma.conversation.findMany({
      where: { aboutStudentId: child.id, participants: { some: { userId: user.id } } },
      select: { id: true, participants: { select: { userId: true, lastReadAt: true } } },
      take: 60,
    }),
  ]);
  const ids = convos.map((c) => c.id);
  const recent = ids.length ? await prisma.message.findMany({
    where: { conversationId: { in: ids }, deletedAt: null, type: { not: 'SYSTEM' } }, orderBy: { createdAt: 'desc' }, take: 300,
    select: { conversationId: true, body: true, senderId: true, createdAt: true },
  }) : [];
  const hours = await hoursOf(teachers.map((t) => t.id));
  return {
    allowed: true,
    child: firstName(child.name),
    teachers: teachers.map((t) => {
      const c = convos.find((x) => x.participants.some((p) => p.userId === t.id));
      const mine = c?.participants.find((p) => p.userId === user.id);
      const msgs = c ? recent.filter((m) => m.conversationId === c.id) : [];
      const last = msgs[0];
      const h = hours(t.id);
      return {
        ...t,
        conversationId: c?.id ?? null,
        last: last ? { body: last.body.slice(0, 140), at: last.createdAt, mine: last.senderId === user.id } : null,
        unread: msgs.filter((m) => m.senderId !== user.id && (!mine?.lastReadAt || m.createdAt > mine.lastReadAt)).length,
        hours: { text: hoursText(h), now: inHours(h) },
      };
    }),
  };
}

/** A parent–teacher chat this parent is in. */
async function parentChat(user: SessionUser, conversationId: string) {
  if (user.role !== 'GUARDIAN') throw new ForbiddenException('This is for parent accounts.');
  const c = await prisma.conversation.findFirst({
    where: { id: conversationId, aboutStudentId: { not: null }, participants: { some: { userId: user.id } } },
    select: { id: true, aboutStudentId: true, participants: { select: { id: true, userId: true, lastReadAt: true, translateTo: true, user: { select: { id: true, name: true, avatar: true, role: true } } } } },
  });
  if (!c) throw new NotFoundException('This chat doesn’t exist.');
  const me = c.participants.find((p) => p.userId === user.id)!;
  const teacher = c.participants.find((p) => p.userId !== user.id);
  return { c, me, teacher };
}

/** GET /api/parent/chats/:id: the messages (newest 100), in my language when I chose one. Marks them read. */
export async function openParentChat(user: SessionUser, conversationId: string) {
  const { c, me, teacher } = await parentChat(user, conversationId);
  const [rows, child] = await Promise.all([
    prisma.message.findMany({ where: { conversationId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, body: true, type: true, senderId: true, createdAt: true, editedAt: true, attachmentName: true } }),
    prisma.user.findUnique({ where: { id: c.aboutStudentId! }, select: { name: true } }),
  ]);
  const messages = rows.reverse();
  const lang = me.translateTo && isLanguage(me.translateTo) ? me.translateTo : null;
  const theirs = messages.filter((m) => m.senderId !== user.id && m.type === 'TEXT').map((m) => m.id);
  const tr = lang && theirs.length ? await storedTranslations(theirs, lang) : {};
  await prisma.conversationParticipant.update({ where: { id: me.id }, data: { lastReadAt: new Date() } });
  const h = teacher ? (await hoursOf([teacher.userId]))(teacher.userId) : DEFAULT_HOURS;
  return {
    id: c.id,
    studentId: c.aboutStudentId,
    teacher: teacher ? { name: teacher.user.name, avatar: teacher.user.avatar } : null,
    child: firstName(child?.name ?? ''),
    hours: { text: hoursText(h), now: inHours(h) },
    lang,
    // When the teacher last read the chat: my messages before it are "Seen".
    seenAt: teacher?.lastReadAt ?? null,
    messages: messages.map((m) => ({
      id: m.id, mine: m.type !== 'SYSTEM' && m.senderId === user.id, system: m.type === 'SYSTEM',
      body: m.type === 'TEXT' || m.type === 'SYSTEM' ? m.body : m.attachmentName ? `📎 ${m.attachmentName}` : m.body,
      translated: tr[m.id] && !tr[m.id].same ? tr[m.id].text : null,
      at: m.createdAt, edited: !!m.editedAt,
    })),
  };
}

/** Sends a parent's text in a parent–teacher chat (rate-limited; the usual chat follow-up). */
async function send(user: SessionUser, conversationId: string, participantId: string, bodyRaw: unknown) {
  const body = typeof bodyRaw === 'string' ? bodyRaw.trim().slice(0, MAX_BODY) : '';
  if (!body) throw new BadRequestException('Write a message first.');
  const muted = await chatMuted(user.id);
  if (muted) throw new ForbiddenException(muted);
  const lastHour = await prisma.message.count({ where: { senderId: user.id, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (lastHour >= PER_HOUR) throw new HttpException('You’ve sent a lot of messages in the last hour. Please wait a little before sending more.', 429);
  const [message] = await prisma.$transaction([
    prisma.message.create({ data: { conversationId, senderId: user.id, type: 'TEXT', body }, select: { id: true, body: true, createdAt: true } }),
    prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    prisma.conversationParticipant.update({ where: { id: participantId }, data: { lastReadAt: new Date() } }),
  ]);
  const system = await getSystemUser();
  // Live update, notification (or not, outside the teacher's hours), translation, safety check.
  afterSend({ id: message.id, conversationId, type: 'TEXT', body, metadata: null }, { id: user.id, name: user.name }, { communityId: null, systemUserId: system.id });
  return { id: message.id, mine: true, system: false, body: message.body, translated: null, at: message.createdAt, edited: false };
}

/** POST /api/parent/chats { studentId, teacherId, body, lang? }: the first message to a teacher (or the next one). */
export async function startParentChat(user: SessionUser, b: Record<string, unknown>) {
  if (user.role !== 'GUARDIAN') throw new ForbiddenException('This is for parent accounts.');
  await requireOn();
  const child = await linkedChild(user.id, typeof b.studentId === 'string' ? b.studentId : '');
  const teacher = (await teachersOf(child.id)).find((t) => t.id === b.teacherId);
  if (!teacher) throw new NotFoundException('That teacher doesn’t teach your child.');
  const conversationId = await chatFor({ id: user.id, name: user.name }, teacher, child, user.id, typeof b.lang === 'string' ? b.lang : null);
  const { me } = await parentChat(user, conversationId);
  const message = await send(user, conversationId, me.id, b.body);
  return { conversationId, message };
}

/** POST /api/parent/chats/:id { body } sends; { lang } sets the language I read in (null: as written). */
export async function postParentChat(user: SessionUser, conversationId: string, b: Record<string, unknown>) {
  await requireOn();
  const { me } = await parentChat(user, conversationId);
  if ('lang' in b) {
    const lang = typeof b.lang === 'string' && isLanguage(b.lang) ? b.lang : null;
    await prisma.conversationParticipant.update({ where: { id: me.id }, data: { translateTo: lang } });
    // The teacher's recent messages, translated once now (kept for next time; the site's AI allowance).
    if (lang) {
      const recent = await prisma.message.findMany({ where: { conversationId, senderId: { not: user.id }, type: 'TEXT', deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, body: true } });
      if (recent.length) await translateMessages(recent, lang).catch(() => null);
    }
    return { lang };
  }
  return { message: await send(user, conversationId, me.id, b.body) };
}

// ── Teachers ────────────────────────────────────────────────────────────────────────────────

const isStaff = (u: SessionUser) => u.role === 'TEACHER' || u.role === 'ADMIN';

/** A student in one of my classes (admins: any student). */
async function myStudent(user: SessionUser, studentId: string) {
  const s = await prisma.user.findFirst({
    where: { id: studentId, role: 'STUDENT', ...(user.role === 'ADMIN' ? {} : { enrollments: { some: { course: { teacherId: user.id } } } }) },
    select: { id: true, name: true },
  });
  if (!s) throw new NotFoundException('That student isn’t in one of your classes.');
  return s;
}

/** GET /api/teacher/parents?studentId=: a student's linked parents (to message them). */
export async function studentParents(user: SessionUser, studentIdRaw: unknown) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers can message parents.');
  const student = await myStudent(user, typeof studentIdRaw === 'string' ? studentIdRaw : '');
  const links = await prisma.guardianLink.findMany({ where: { studentId: student.id }, orderBy: { createdAt: 'asc' }, select: { relation: true, guardian: { select: { id: true, name: true, avatar: true } } } });
  return { allowed: (await schoolPolicy()).parentMessaging, student: { id: student.id, name: student.name }, parents: links.map((l) => ({ id: l.guardian.id, name: l.guardian.name, avatar: l.guardian.avatar, relation: l.relation })) };
}

/** POST /api/teacher/parents { studentId, guardianId }: opens (or makes) my chat with that parent; the teacher writes in their inbox. */
export async function teacherParentChat(user: SessionUser, b: Record<string, unknown>) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers can message parents.');
  await requireOn();
  const student = await myStudent(user, typeof b.studentId === 'string' ? b.studentId : '');
  const link = await prisma.guardianLink.findFirst({ where: { studentId: student.id, guardianId: typeof b.guardianId === 'string' ? b.guardianId : '' }, select: { guardian: { select: { id: true, name: true } } } });
  if (!link) throw new NotFoundException('That parent isn’t linked to this student.');
  return { conversationId: await chatFor(link.guardian, { id: user.id, name: user.name }, student, user.id) };
}

/** GET /api/teacher/parent-hours: my hours for parents. */
export async function myContactHours(user: SessionUser) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers have parent hours.');
  const h = (await hoursOf([user.id]))(user.id);
  return { ...h, text: hoursText(h) };
}

/** POST /api/teacher/parent-hours { open, days, start, end, tz }. */
export async function setContactHours(user: SessionUser, b: Record<string, unknown>) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers have parent hours.');
  const now = (await hoursOf([user.id]))(user.id);
  const days = Array.isArray(b.days) ? parseDays((b.days as unknown[]).join(',')) : now.days;
  const start = typeof b.start === 'string' && HHMM.test(b.start) ? b.start : now.start;
  const end = typeof b.end === 'string' && HHMM.test(b.end) ? b.end : now.end;
  if (!days.length) throw new BadRequestException('Pick at least one day.');
  if (start === end) throw new BadRequestException('The hours need to start and end at different times.');
  const data = { open: typeof b.open === 'boolean' ? b.open : now.open, days: days.join(','), start, end, timeZone: validZone(b.tz ?? now.timeZone), updatedAt: new Date() };
  await prisma.parentContactHours.upsert({ where: { teacherId: user.id }, update: data, create: { teacherId: user.id, ...data } });
  const h = { ...data, days };
  return { ...h, text: hoursText(h) };
}
