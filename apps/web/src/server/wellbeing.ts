import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { cleanTags, counsellorWorthy, lastDays, lateNights, localParts, moodSignals, nudgesFor, validTimeZone, type Signals } from '@/lib/wellbeing';
import type { Body } from './body';
import { notify, notifyMany } from './email';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';
import { can } from './permissions';
import { publish } from './realtime';

// Wellbeing radar (Stage 5 · D13), opt-in and privacy-first. A student who turns it on checks in
// (mood, tags, a private note) and gets private nudges from plain rules (src/lib/wellbeing.ts; no AI
// on personal data): late nights, "I'm lost" in class, missed deadlines, a heavy few days, hard days.
// Nothing is shared with teachers. The school's counsellors (the "wellbeing.counsel" permission; if
// nobody has it, the school admins) get a request only when the student asks ("Talk to someone"), or
// when their check-ins show a really hard stretch and they agreed to that beforehand.

const DAY = 86_400_000;
const KEEP_DAYS = 90;
const PATTERN_GAP_DAYS = 14;
const NUDGE_GAP_DAYS = 3;

async function settingsOf(userId: string) {
  return prisma.wellbeingSettings.findUnique({ where: { userId } });
}

/** The signals of a student's last days (a handful of small queries). */
export async function signalsOf(userId: string, tz: string, now = new Date()): Promise<Signals> {
  const week = new Date(now.getTime() - 7 * DAY), fortnight = new Date(now.getTime() - 14 * DAY), soon = new Date(now.getTime() + 3 * DAY);
  const mine = { course: { enrollments: { some: { studentId: userId } } } };
  const [uses, subs, quizSubs, lost, missedA, missedQ, soonA, soonQ, checkins] = await Promise.all([
    prisma.aiUse.findMany({ where: { userId, createdAt: { gte: week } }, select: { createdAt: true }, take: 300 }),
    prisma.assignmentSubmission.findMany({ where: { studentId: userId, submittedAt: { gte: week } }, select: { submittedAt: true }, take: 100 }),
    prisma.quizSubmission.findMany({ where: { studentId: userId, submittedAt: { gte: week } }, select: { submittedAt: true }, take: 100 }),
    prisma.classroomCheckin.count({ where: { studentId: userId, mood: 'LOST', moodAt: { gte: fortnight } } }),
    prisma.assignment.count({ where: { ...mine, dueDate: { gte: fortnight, lt: now }, submissions: { none: { studentId: userId } } } }),
    prisma.quiz.count({ where: { ...mine, status: { in: ['PUBLISHED', 'CLOSED'] }, dueDate: { gte: fortnight, lt: now }, submissions: { none: { studentId: userId } } } }),
    prisma.assignment.count({ where: { ...mine, status: 'OPEN', dueDate: { gte: now, lt: soon }, submissions: { none: { studentId: userId } } } }),
    prisma.quiz.count({ where: { ...mine, status: 'PUBLISHED', dueDate: { gte: now, lt: soon }, submissions: { none: { studentId: userId } } } }),
    prisma.wellbeingCheckin.findMany({ where: { userId, createdAt: { gte: new Date(now.getTime() - 8 * DAY) } }, select: { day: true, mood: true } }),
  ]);
  const today = localParts(now, tz).day;
  return {
    lateNights: lateNights([...uses.map((u) => u.createdAt), ...subs.map((x) => x.submittedAt), ...quizSubs.map((x) => x.submittedAt)], tz),
    lost, missed: missedA + missedQ, dueSoon: soonA + soonQ,
    ...moodSignals(checkins, lastDays(today, 7), lastDays(today, 3)),
  };
}

/** Who receives requests: people given the counsellor permission; if there are none, the school admins. */
async function counsellors() {
  const roles = await prisma.staffRole.findMany({ where: { permissions: { contains: 'wellbeing.counsel' } }, select: { members: { select: { userId: true } } }, take: 20 });
  const named = [...new Set(roles.flatMap((r) => r.members.map((m) => m.userId)))];
  if (named.length) return { ids: named, who: 'counsellors' as const };
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: { not: 'SUSPENDED' } }, select: { id: true }, take: 20 });
  return { ids: admins.map((a) => a.id), who: 'admins' as const };
}

async function sendAlert(user: { id: string; name: string | null }, reason: 'ASKED' | 'PATTERN', message: string) {
  const alert = await prisma.wellbeingAlert.create({ data: { userId: user.id, reason, message } });
  const to = await counsellors();
  await notifyMany(to.ids, {
    title: reason === 'ASKED' ? `${user.name ?? 'A student'} would like to talk` : `${user.name ?? 'A student'} may be having a hard time`,
    body: reason === 'ASKED' ? 'They asked a counsellor to reach out to them.' : 'Their wellbeing check-ins show a hard stretch, and they agreed that a counsellor may be told.',
    link: '/admin/wellbeing', type: 'reminder', email: false,
  });
  publish(to.ids, { type: 'refresh', keys: ['/api/wellbeing/requests'] });
  return alert;
}

/** GET /api/wellbeing: my settings, check-ins of the last 14 days, private nudges, my requests. */
export async function wellbeingView(user: SessionUser) {
  if (user.role !== 'STUDENT') throw new ForbiddenException('The wellbeing radar is for students.');
  const s = await settingsOf(user.id);
  const tz = s?.timeZone ?? 'UTC';
  const today = localParts(new Date(), tz).day;
  const [checkins, requests, to] = await Promise.all([
    prisma.wellbeingCheckin.findMany({ where: { userId: user.id, day: { in: lastDays(today, 14) } }, orderBy: { day: 'desc' }, select: { day: true, mood: true, tags: true, note: true } }),
    prisma.wellbeingAlert.findMany({ where: { userId: user.id, reason: 'ASKED' }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, status: true, message: true, createdAt: true, handledAt: true } }),
    counsellors(),
  ]);
  const signals = s?.optedIn ? await signalsOf(user.id, tz) : null;
  return {
    optedIn: !!s?.optedIn, counsellorOk: !!s?.counsellorOk, timeZone: tz, today,
    checkins: checkins.map((c) => ({ ...c, tags: cleanTags(JSON.parse(c.tags || '[]')) })),
    signals, nudges: signals ? nudgesFor(signals) : [],
    requests, requestsGoTo: to.who,
  };
}

/** POST /api/wellbeing { action: 'join' | 'settings' | 'check-in' | 'ask' | 'leave', … }. */
export async function wellbeingAction(user: SessionUser, b: Body) {
  if (user.role !== 'STUDENT') throw new ForbiddenException('The wellbeing radar is for students.');
  const tz = validTimeZone(b.timeZone);
  if (b.action === 'join') {
    const counsellorOk = b.counsellorOk === true;
    await prisma.wellbeingSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, optedIn: true, counsellorOk, timeZone: tz ?? 'UTC' }, update: { optedIn: true, counsellorOk, ...(tz ? { timeZone: tz } : {}) } });
    return { ok: true };
  }
  if (b.action === 'settings') {
    if (typeof b.counsellorOk !== 'boolean') throw new BadRequestException('Nothing to change.');
    const n = await prisma.wellbeingSettings.updateMany({ where: { userId: user.id, optedIn: true }, data: { counsellorOk: b.counsellorOk } });
    if (!n.count) throw new BadRequestException('Turn the wellbeing radar on first.');
    return { ok: true };
  }
  if (b.action === 'check-in') {
    const s = await settingsOf(user.id);
    if (!s?.optedIn) throw new BadRequestException('Turn the wellbeing radar on first.');
    const mood = Math.round(Number(b.mood));
    if (!(mood >= 1 && mood <= 5)) throw new BadRequestException('Choose how today feels.');
    const zone = tz ?? s.timeZone;
    const day = localParts(new Date(), zone).day;
    const tags = JSON.stringify(cleanTags(b.tags));
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 1000) : '';
    await prisma.wellbeingCheckin.upsert({ where: { userId_day: { userId: user.id, day } }, create: { userId: user.id, day, mood, tags, note }, update: { mood, tags, note } });
    if (tz && tz !== s.timeZone) await prisma.wellbeingSettings.update({ where: { userId: user.id }, data: { timeZone: tz } });
    // A really hard stretch reaches a counsellor only if the student agreed, and not more than once a fortnight.
    let told = false;
    if (s.counsellorOk && counsellorWorthy(await signalsOf(user.id, zone))) {
      const recent = await prisma.wellbeingAlert.count({ where: { userId: user.id, reason: 'PATTERN', createdAt: { gte: new Date(Date.now() - PATTERN_GAP_DAYS * DAY) } } });
      if (!recent) { await sendAlert(user, 'PATTERN', ''); told = true; }
    }
    return { ok: true, day, counsellorTold: told };
  }
  if (b.action === 'ask') {
    const open = await prisma.wellbeingAlert.count({ where: { userId: user.id, reason: 'ASKED', status: { in: ['OPEN', 'SEEN'] } } });
    if (open) throw new ConflictException('Your request is with the counsellors already. They’ll reach out to you.');
    const message = typeof b.message === 'string' ? b.message.trim().slice(0, 1000) : '';
    const a = await sendAlert(user, 'ASKED', message);
    return { ok: true, id: a.id };
  }
  if (b.action === 'leave') {
    // Turns it off and deletes the check-ins; requests not yet seen are withdrawn.
    await prisma.wellbeingCheckin.deleteMany({ where: { userId: user.id } });
    await prisma.wellbeingAlert.deleteMany({ where: { userId: user.id, status: 'OPEN' } });
    await prisma.wellbeingSettings.deleteMany({ where: { userId: user.id } });
    return { ok: true };
  }
  throw new BadRequestException('Unknown action.');
}

// ── Counsellors ────────────────────────────────────────────────────────────────────────────────

async function counsellorOnly(user: SessionUser) {
  if (!(await can(user, 'wellbeing.counsel'))) throw new ForbiddenException('Only the school’s counsellors see wellbeing requests.');
}

/** GET /api/wellbeing/requests: requests students sent (open first). Never check-ins or notes. */
export async function wellbeingRequests(user: SessionUser) {
  await counsellorOnly(user);
  const rows = await prisma.wellbeingAlert.findMany({
    orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, reason: true, message: true, status: true, createdAt: true, handledAt: true, user: { select: { id: true, name: true, email: true } } },
  });
  const rank = { OPEN: 0, SEEN: 1, CLOSED: 2 } as Record<string, number>;
  return { requests: rows.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3)) };
}

/** POST /api/wellbeing/requests { id, action: 'seen' | 'close' }: the student is told when it's seen. */
export async function wellbeingRequestAction(user: SessionUser, b: Body) {
  await counsellorOnly(user);
  const a = typeof b.id === 'string' ? await prisma.wellbeingAlert.findUnique({ where: { id: b.id } }) : null;
  if (!a) throw new NotFoundException('Request not found.');
  if (b.action !== 'seen' && b.action !== 'close') throw new BadRequestException('Unknown action.');
  await prisma.wellbeingAlert.update({ where: { id: a.id }, data: { status: b.action === 'seen' ? 'SEEN' : 'CLOSED', handledById: user.id, handledAt: new Date() } });
  if (b.action === 'seen' && a.status === 'OPEN' && a.reason === 'ASKED') {
    await notify(a.userId, { title: 'A counsellor has seen your request', body: `${user.name ?? 'A counsellor'} will reach out to you soon.`, link: '/student/wellbeing', type: 'info', email: false });
    publish([a.userId], { type: 'refresh', keys: ['/api/wellbeing'] });
  }
  return { ok: true };
}

/**
 * Daily cron: a private nudge for students who turned the radar on (at most one every three days,
 * a few students per run), and check-ins older than 90 days are deleted.
 */
export async function wellbeingNudges(limit = 25, now = new Date()) {
  await prisma.wellbeingCheckin.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - KEEP_DAYS * DAY) } } }).catch(() => {});
  const due = await prisma.wellbeingSettings.findMany({
    where: { optedIn: true, OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: new Date(now.getTime() - NUDGE_GAP_DAYS * DAY) } }] },
    orderBy: { lastNudgeAt: 'asc' }, take: limit, select: { userId: true, timeZone: true },
  });
  let sent = 0;
  for (const s of due) {
    const nudge = nudgesFor(await signalsOf(s.userId, s.timeZone, now)).find((x) => x.id !== 'good');
    await prisma.wellbeingSettings.update({ where: { userId: s.userId }, data: { lastNudgeAt: now } });
    if (!nudge) continue;
    await notify(s.userId, { title: nudge.title, body: nudge.body, link: '/student/wellbeing', type: 'info', email: false });
    sent++;
  }
  return { checked: due.length, sent };
}
