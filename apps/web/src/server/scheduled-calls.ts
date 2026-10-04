import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import { getSystemUser } from '@/lib/chat';
import { planLimits } from '@/lib/plan-limits';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';
import { pushService } from './services/push.service';

// Calls booked ahead, for a class (its teacher books), a study group or a chat (any member).
// They show on the Calls page with a Join button from 10 minutes before; class calls also go on
// the class calendar (and so in everyone's calendar feed). About 15 minutes before, the 15-minute
// cron (cloudflare/worker.ts → /api/cron/reminders) reminds members in the app and by push
// notification. No emails: the Resend allowance is kept for what matters.

export const JOIN_EARLY_MS = 10 * 60_000;
const REMIND_AHEAD_MS = 16 * 60_000;
const MAX_AHEAD_MS = 180 * 86_400_000;

type Room = { kind: 'class'; id: string } | { kind: 'group'; id: string } | { kind: 'chat'; id: string };

const select = {
  id: true, title: true, kind: true, startAt: true, durationMin: true, callId: true, createdById: true,
  course: { select: { id: true, code: true, name: true, teacherId: true } },
  group: { select: { id: true, name: true } },
  conversation: { select: { id: true, isGroup: true, name: true, participants: { take: 2, select: { userId: true, user: { select: { name: true } } } } } },
} as const;

/** Who belongs to the room (capped: a reminder never fans out without limit). */
async function membersOf(s: { courseId?: string | null; groupId?: string | null; conversationId?: string | null }, cap = 500): Promise<string[]> {
  if (s.courseId) {
    const [course, students] = await Promise.all([
      prisma.course.findUnique({ where: { id: s.courseId }, select: { teacherId: true } }),
      prisma.enrollment.findMany({ where: { courseId: s.courseId }, select: { studentId: true }, take: cap }),
    ]);
    return [...new Set([...(course?.teacherId ? [course.teacherId] : []), ...students.map((e) => e.studentId)])];
  }
  if (s.groupId) return (await prisma.groupMembership.findMany({ where: { groupId: s.groupId }, select: { userId: true }, take: cap })).map((m) => m.userId);
  if (s.conversationId) return (await prisma.conversationParticipant.findMany({ where: { conversationId: s.conversationId }, select: { userId: true }, take: cap })).map((m) => m.userId);
  return [];
}

async function checkRoom(room: Room, user: SessionUser) {
  if (room.kind === 'class') {
    const a = await courseAccess(room.id, user);
    if (!a?.canManage) throw new ForbiddenException('Only the class’s teacher can schedule its calls.');
    return { courseId: room.id, name: `${a.course.code} · ${a.course.name}` };
  }
  if (room.kind === 'group') {
    const g = await prisma.group.findUnique({ where: { id: room.id }, select: { name: true, members: { where: { userId: user.id }, select: { id: true } } } });
    if (!g || (!g.members.length && user.role !== 'ADMIN')) throw new NotFoundException('That group isn’t one of yours.');
    return { groupId: room.id, name: g.name };
  }
  const [me, system] = await Promise.all([
    prisma.conversationParticipant.findFirst({ where: { conversationId: room.id, userId: user.id }, select: { conversation: { select: { isGroup: true, name: true } } } }),
    getSystemUser(),
  ]);
  if (!me) throw new NotFoundException('That chat isn’t one of yours.');
  const official = await prisma.conversationParticipant.findFirst({ where: { conversationId: room.id, userId: system.id }, select: { id: true } });
  if (official) throw new BadRequestException('Calls can’t be scheduled in an announcements channel.');
  return { conversationId: room.id, name: me.conversation.name ?? 'Chat' };
}

function shape(s: { id: string; title: string; kind: string; startAt: Date; durationMin: number; callId: string | null; createdById: string | null; course: { id: string; code: string; name: string; teacherId: string | null } | null; group: { id: string; name: string } | null; conversation: { id: string; isGroup: boolean; name: string | null; participants: { userId: string; user: { name: string } }[] } | null }, user: SessionUser) {
  const room = s.course ? 'class' : s.group ? 'group' : 'chat';
  const other = s.conversation?.participants.find((p) => p.userId !== user.id)?.user.name;
  const roomName = s.course ? `${s.course.code} · ${s.course.name}` : s.group ? s.group.name : (s.conversation?.isGroup ? s.conversation.name : other) ?? 'Chat';
  const kind = s.kind === 'audio' ? 'audio' : 'video';
  return {
    id: s.id, title: s.title, kind, startAt: s.startAt, durationMin: s.durationMin, room, roomName,
    /** Where Join goes; chats start (or join) the chat's call through /join. */
    path: s.course ? `/call/c_${s.course.id}?kind=${kind}` : s.group ? `/call/g_${s.group.id}?kind=${kind}` : null,
    conversationId: s.conversation?.id ?? null,
    canCancel: s.createdById === user.id || user.role === 'ADMIN' || (!!s.course && s.course.teacherId === user.id),
  };
}

/** Upcoming (and in-progress) scheduled calls in my classes, groups and chats. */
export async function upcomingCalls(user: SessionUser) {
  const rows = await prisma.scheduledCall.findMany({
    where: {
      startAt: { gte: new Date(Date.now() - 4 * 3600_000), lte: new Date(Date.now() + MAX_AHEAD_MS) },
      OR: [
        { course: { teacherId: user.id } },
        { course: { enrollments: { some: { studentId: user.id } } } },
        { group: { members: { some: { userId: user.id } } } },
        { conversation: { participants: { some: { userId: user.id } } } },
      ],
    },
    orderBy: { startAt: 'asc' },
    take: 50,
    select,
  });
  const now = Date.now();
  return rows.filter((r) => r.startAt.getTime() + r.durationMin * 60_000 > now).map((r) => shape(r, user));
}

/** Places I can schedule a call in, for the Schedule sheet. */
export async function schedulableRooms(user: SessionUser) {
  const system = await getSystemUser();
  const [classes, groups, chats] = await Promise.all([
    prisma.course.findMany({ where: user.role === 'ADMIN' ? {} : { teacherId: user.id }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 50 }),
    prisma.group.findMany({ where: { members: { some: { userId: user.id } } }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 50 }),
    prisma.conversation.findMany({
      where: { participants: { some: { userId: user.id } }, NOT: { participants: { some: { userId: system.id } } } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: { id: true, isGroup: true, name: true, participants: { where: { userId: { not: user.id } }, take: 1, select: { user: { select: { name: true } } } } },
    }),
  ]);
  return {
    classes: classes.map((c) => ({ id: c.id, name: `${c.code} · ${c.name}` })),
    groups,
    chats: chats.map((c) => ({ id: c.id, name: c.isGroup ? c.name ?? 'Group chat' : c.participants[0]?.user.name ?? 'Chat' })),
  };
}

export async function scheduleCall(user: SessionUser, body: Record<string, unknown>) {
  const roomKind = body.room === 'class' || body.room === 'group' || body.room === 'chat' ? body.room : null;
  const roomId = typeof body.roomId === 'string' ? body.roomId : '';
  if (!roomKind || !roomId) throw new BadRequestException('Pick where the call happens.');
  const startAt = new Date(String(body.startAt ?? ''));
  if (Number.isNaN(startAt.getTime())) throw new BadRequestException('Pick a date and time.');
  if (startAt.getTime() < Date.now() - 5 * 60_000) throw new BadRequestException('That time has already passed.');
  if (startAt.getTime() > Date.now() + MAX_AHEAD_MS) throw new BadRequestException('Calls can be scheduled up to 6 months ahead.');
  const durationMin = Math.min(240, Math.max(10, Math.round(Number(body.durationMin) || 60)));
  const kind = body.kind === 'audio' ? 'audio' : 'video';
  const room = await checkRoom({ kind: roomKind, id: roomId } as Room, user);
  const title = String(body.title ?? '').trim().slice(0, 120) || (roomKind === 'class' ? 'Class call' : `${kind === 'video' ? 'Video' : 'Voice'} call`);

  const created = await prisma.scheduledCall.create({
    data: { title, kind, startAt, durationMin, createdById: user.id, courseId: 'courseId' in room ? room.courseId : null, groupId: 'groupId' in room ? room.groupId : null, conversationId: 'conversationId' in room ? room.conversationId : null },
    select,
  });
  // Class calls go on the class calendar (students' calendars and calendar feeds show them).
  if ('courseId' in room) {
    const ev = await prisma.calendarEvent.create({
      data: { userId: user.id, courseId: room.courseId, title: `📹 ${title}`, description: 'Class call on UniVerse. Join from Calls or the class.', startAt, endAt: new Date(startAt.getTime() + durationMin * 60_000), type: 'MEETING' },
      select: { id: true },
    });
    await prisma.scheduledCall.update({ where: { id: created.id }, data: { calendarEventId: ev.id } });
  }
  const members = (await membersOf(created.course ? { courseId: created.course.id } : created.group ? { groupId: created.group.id } : { conversationId: created.conversation?.id })).filter((u) => u !== user.id);
  if (members.length) {
    await prisma.notification.createMany({
      data: members.map((userId) => ({ userId, title: `${user.name} scheduled a call`, body: `${title} · ${room.name}`, type: 'call', link: '/calls' })),
    });
    publish(members.slice(0, planLimits().livePushes), { type: 'refresh', keys: ['/api/calls/scheduled'] });
    publish(members.slice(0, planLimits().livePushes), { type: 'notification' });
  }
  return shape(created, user);
}

export async function cancelScheduled(user: SessionUser, id: string) {
  const s = await prisma.scheduledCall.findUnique({ where: { id }, select: { ...select, calendarEventId: true, courseId: true, groupId: true, conversationId: true } });
  if (!s) throw new NotFoundException('That call isn’t scheduled any more.');
  if (!shape(s, user).canCancel) throw new ForbiddenException('Only whoever scheduled it (or the teacher) can cancel it.');
  await prisma.scheduledCall.delete({ where: { id } });
  if (s.calendarEventId) await prisma.calendarEvent.deleteMany({ where: { id: s.calendarEventId } });
  const members = await membersOf(s);
  publish(members.slice(0, planLimits().livePushes), { type: 'refresh', keys: ['/api/calls/scheduled'] });
  return { ok: true };
}

/**
 * Join a scheduled chat call: the call already started from it (if still going), or null and the
 * browser starts one (a CALL message with scheduledId, which links it here).
 */
export async function joinScheduled(user: SessionUser, id: string) {
  const s = await prisma.scheduledCall.findUnique({ where: { id }, select });
  if (!s) throw new NotFoundException('That call isn’t scheduled any more.');
  const out = shape(s, user);
  if (s.course || s.group) {
    // The call page checks access again when joining; this just avoids a dead end.
    if (s.course ? !(await courseAccess(s.course.id, user)) : !(await prisma.groupMembership.findFirst({ where: { groupId: s.group!.id, userId: user.id }, select: { id: true } })) && user.role !== 'ADMIN') {
      throw new NotFoundException('This call isn’t for one of your classes or groups.');
    }
    return { path: out.path };
  }
  await checkRoom({ kind: 'chat', id: s.conversation!.id }, user);
  if (s.callId) {
    const msg = await prisma.message.findUnique({ where: { id: s.callId }, select: { metadata: true, createdAt: true, deletedAt: true } });
    const meta = (msg?.metadata ?? {}) as { endedAt?: string };
    if (msg && !msg.deletedAt && !meta.endedAt && Date.now() - msg.createdAt.getTime() < 4 * 3600_000) return { path: `/call/${s.callId}` };
  }
  return { path: null, conversationId: s.conversation!.id, kind: out.kind };
}

/** Links a call just started in a chat to its schedule (first one wins). */
export async function linkScheduledCall(scheduledId: string, conversationId: string, callId: string) {
  await prisma.scheduledCall.updateMany({ where: { id: scheduledId, conversationId }, data: { callId } });
}

/**
 * The cron's job: remind members of calls starting within about 15 minutes (each call once).
 * In the app for everyone; by push for as many devices as the plan's subrequest allowance lets
 * this one run reach.
 */
export async function remindDueCalls() {
  const now = Date.now();
  const due = await prisma.scheduledCall.findMany({
    where: { remindedAt: null, startAt: { gt: new Date(now - 5 * 60_000), lte: new Date(now + REMIND_AHEAD_MS) } },
    orderBy: { startAt: 'asc' },
    take: 10,
    select: { ...select, courseId: true, groupId: true, conversationId: true },
  });
  let pushBudget = planLimits().pushes * 2;
  let reminded = 0;
  for (const s of due) {
    // Claim it first, so two overlapping runs never remind twice.
    const claim = await prisma.scheduledCall.updateMany({ where: { id: s.id, remindedAt: null }, data: { remindedAt: new Date() } });
    if (!claim.count) continue;
    const members = await membersOf(s);
    if (!members.length) continue;
    const mins = Math.max(1, Math.round((s.startAt.getTime() - now) / 60_000));
    const roomName = s.course ? s.course.code : s.group?.name ?? (s.conversation?.isGroup ? s.conversation.name : null);
    const body = `${s.kind === 'audio' ? 'Voice' : 'Video'} call in ${mins} min${roomName ? ` · ${roomName}` : ''}`;
    await prisma.notification.createMany({ data: members.map((userId) => ({ userId, title: `Starting soon: ${s.title}`, body, type: 'call', link: '/calls' })) });
    publish(members.slice(0, planLimits().livePushes), { type: 'notification' });
    if (pushBudget > 0) pushBudget -= await pushService.sendToMany(members, { title: `Starting soon: ${s.title}`, body, url: '/calls', tag: `scheduled-${s.id}` }).catch(() => 0) || 1;
    reminded++;
  }
  return { due: due.length, reminded };
}
