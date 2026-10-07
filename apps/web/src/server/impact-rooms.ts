import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { spendAi } from './ai-budget';
import { later, notifyMany } from './email';
import { geminiJson } from './gemini';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { featureOff } from './moderation';
import { publish } from './realtime';
import { CredentialSigner, publicAppUrl } from './services/credential-signer';

// Impact rooms (Stage 4 · 4.12). Every NGO project has a room where volunteers, sponsors and
// students meet: live updates (anyone who follows may post; staff can make a post public), verified
// volunteer hours from shifts (upgrade 5), donations of time (hours a month, checked against those
// verified hours), and a monthly live "impact call" (call id i_<project>, src/server/calls.ts) whose
// meeting notes (2.8) and the month's figures become a signed report for sponsors. Staff (admins,
// teachers) run rooms. A room can have a public page (/impact/<project>) with the figures, public
// posts and reports: never students' names or anything they wrote.

const HOUR = 3600_000, DAY = 24 * HOUR;
const MAX_BODY = 2000, POSTS_PER_DAY = 20, MAX_UPCOMING_CALLS = 3;
const ROLES = ['VOLUNTEER', 'SPONSOR', 'SUPPORTER'] as const;
type FollowRole = (typeof ROLES)[number];

export const isStaff = (u: SessionUser) => u.role === 'ADMIN' || u.role === 'TEACHER';
export const impactCallId = (projectId: string) => `i_${projectId}`;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** A call can be joined from 15 minutes before it starts until 3 hours after. */
const isOpen = (startsAt: Date, now = Date.now()) => now >= startsAt.getTime() - 15 * 60_000 && now <= startsAt.getTime() + 3 * HOUR;

async function project(id: string) {
  const p = await prisma.nGOProject.findUnique({
    where: { id },
    select: {
      id: true, name: true, description: true, type: true, location: true, duration: true, sdgNumber: true, skillsRequired: true, isActive: true, roomPublic: true,
      ngo: { select: { name: true, logoUrl: true, websiteUrl: true, sector: true, isVerified: true } },
    },
  });
  if (!p) throw new NotFoundException('This impact room doesn’t exist.');
  return p;
}

/** Verified volunteer hours per project (from shifts checked in on site, or marked present by staff). */
async function figures(projectIds: string[], from?: Date, to?: Date) {
  const out = new Map<string, { minutes: number; volunteers: Set<string>; shifts: Set<string> }>();
  if (!projectIds.length) return out;
  const rows = await prisma.shiftCheckin.findMany({
    where: { verified: true, minutes: { gt: 0 }, shift: { projectId: { in: projectIds } }, ...(from || to ? { checkOutAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}) },
    select: { minutes: true, studentId: true, shiftId: true, shift: { select: { projectId: true } } },
    take: 20_000,
  });
  for (const r of rows) {
    const f = out.get(r.shift.projectId) ?? { minutes: 0, volunteers: new Set<string>(), shifts: new Set<string>() };
    f.minutes += r.minutes;
    f.volunteers.add(r.studentId);
    f.shifts.add(r.shiftId);
    out.set(r.shift.projectId, f);
  }
  return out;
}
const shown = (f?: { minutes: number; volunteers: Set<string>; shifts: Set<string> }) => ({ hours: Math.round(((f?.minutes ?? 0) / 60) * 10) / 10, volunteers: f?.volunteers.size ?? 0, shifts: f?.shifts.size ?? 0 });

/** Pledges still running (started, and not past their months). */
const running = (p: { startAt: Date; months: number }, now = new Date()) => {
  const end = new Date(p.startAt);
  end.setUTCMonth(end.getUTCMonth() + p.months);
  return p.startAt <= now && end > now;
};

/** Who hears about a room: its followers (up to 1,000). */
async function followers(projectId: string) {
  return (await prisma.impactFollower.findMany({ where: { projectId }, select: { userId: true }, take: 1000 })).map((f) => f.userId);
}
async function refresh(projectId: string, also: string[] = []) {
  publish([...(await followers(projectId)), ...also], { type: 'refresh', keys: [`/api/impact-rooms/${projectId}`, '/api/impact-rooms'] });
}

// ── Rooms ─────────────────────────────────────────────────────────────────────────────────────

/** GET /api/impact-rooms: the active projects' rooms, the ones I follow first. */
export async function listRooms(user: SessionUser) {
  const projects = await prisma.nGOProject.findMany({
    where: { isActive: true }, orderBy: { createdAt: 'desc' }, take: 60,
    select: { id: true, name: true, description: true, location: true, sdgNumber: true, roomPublic: true, ngo: { select: { name: true, logoUrl: true, isVerified: true } }, _count: { select: { impactFollowers: true } } },
  });
  const ids = projects.map((p) => p.id);
  const [fig, mine, calls, last] = await Promise.all([
    figures(ids),
    prisma.impactFollower.findMany({ where: { userId: user.id, projectId: { in: ids } }, select: { projectId: true, role: true } }),
    prisma.impactCall.findMany({ where: { projectId: { in: ids }, startsAt: { gte: new Date(Date.now() - 3 * HOUR) } }, orderBy: { startsAt: 'asc' }, select: { projectId: true, startsAt: true, title: true } }),
    prisma.impactUpdate.groupBy({ by: ['projectId'], where: { projectId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const role = new Map(mine.map((m) => [m.projectId, m.role]));
  const lastAt = new Map(last.map((l) => [l.projectId, l._max.createdAt?.getTime() ?? 0]));
  const rooms = projects.map((p) => {
    const next = calls.find((c) => c.projectId === p.id);
    return {
      id: p.id, name: p.name, description: p.description.slice(0, 220), location: p.location, sdgNumber: p.sdgNumber, isPublic: p.roomPublic,
      ngo: p.ngo, followers: p._count.impactFollowers, following: role.get(p.id) ?? null, ...shown(fig.get(p.id)),
      nextCall: next ? { startsAt: next.startsAt, title: next.title, open: isOpen(next.startsAt) } : null,
      lastActivity: lastAt.get(p.id) ? new Date(lastAt.get(p.id)!) : null,
    };
  });
  rooms.sort((a, b) => Number(!!b.following) - Number(!!a.following) || (b.lastActivity?.getTime() ?? 0) - (a.lastActivity?.getTime() ?? 0));
  return { rooms, staff: isStaff(user) };
}

/** GET /api/impact-rooms/:id: the room. */
export async function getRoom(id: string, user: SessionUser) {
  const p = await project(id);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [all, month, people, counts, me, pledges, myPledge, updates, calls, shifts] = await Promise.all([
    figures([id]),
    figures([id], monthStart),
    prisma.impactFollower.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' }, take: 24, select: { role: true, user: { select: { id: true, name: true, avatar: true, role: true } } } }),
    prisma.impactFollower.groupBy({ by: ['role'], where: { projectId: id }, _count: { _all: true } }),
    prisma.impactFollower.findUnique({ where: { projectId_userId: { projectId: id, userId: user.id } }, select: { role: true } }),
    prisma.timePledge.findMany({ where: { projectId: id }, select: { hoursPerMonth: true, months: true, startAt: true }, take: 2000 }),
    prisma.timePledge.findUnique({ where: { projectId_userId: { projectId: id, userId: user.id } } }),
    prisma.impactUpdate.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, body: true, kind: true, isPublic: true, callId: true, createdAt: true, author: { select: { id: true, name: true, avatar: true, role: true } } } }),
    prisma.impactCall.findMany({ where: { projectId: id }, orderBy: { startsAt: 'desc' }, take: 12, select: { id: true, startsAt: true, title: true, reportAt: true } }),
    prisma.volunteerShift.findMany({ where: { projectId: id, endAt: { gte: now } }, orderBy: { startAt: 'asc' }, take: 3, select: { id: true, title: true, startAt: true, endAt: true, location: true, capacity: true, _count: { select: { checkins: true } } } }),
  ]);
  const active = pledges.filter((x) => running(x, now));
  let pledge = null;
  if (myPledge) {
    const done = await prisma.shiftCheckin.findMany({ where: { studentId: user.id, verified: true, shift: { projectId: id }, checkOutAt: { gte: myPledge.startAt } }, select: { minutes: true, checkOutAt: true }, take: 2000 });
    const end = new Date(myPledge.startAt);
    end.setUTCMonth(end.getUTCMonth() + myPledge.months);
    const minutes = (from: Date) => done.filter((d) => d.checkOutAt && d.checkOutAt >= from).reduce((t, d) => t + d.minutes, 0);
    pledge = {
      hoursPerMonth: myPledge.hoursPerMonth, months: myPledge.months, skill: myPledge.skill, note: myPledge.note, startAt: myPledge.startAt, endsAt: end, running: end > now,
      hoursThisMonth: Math.round((minutes(monthStart > myPledge.startAt ? monthStart : myPledge.startAt) / 60) * 10) / 10,
      hoursSoFar: Math.round((minutes(myPledge.startAt) / 60) * 10) / 10,
    };
  }
  const staff = isStaff(user);
  const upcoming = calls.filter((c) => c.startsAt.getTime() >= now.getTime() - 3 * HOUR).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return {
    id: p.id, name: p.name, description: p.description, type: p.type, location: p.location, duration: p.duration, sdgNumber: p.sdgNumber,
    skills: Array.isArray(p.skillsRequired) ? (p.skillsRequired as string[]).slice(0, 12) : [], active: p.isActive, isPublic: p.roomPublic, ngo: p.ngo,
    publicUrl: p.roomPublic ? `/impact/${p.id}` : null,
    total: shown(all.get(id)), month: shown(month.get(id)),
    pledged: { people: active.length, hoursPerMonth: active.reduce((t, x) => t + x.hoursPerMonth, 0) },
    followers: { count: counts.reduce((t, c) => t + c._count._all, 0), byRole: Object.fromEntries(counts.map((c) => [c.role, c._count._all])), people: people.map((f) => ({ ...f.user, followRole: f.role })) },
    following: (me?.role as FollowRole | undefined) ?? null, pledge, staff,
    canPost: staff || !!me,
    updates: updates.map((u) => ({ ...u, mine: u.author.id === user.id, canDelete: u.author.id === user.id || staff })),
    calls: {
      callId: impactCallId(id),
      canJoin: staff || !!me,
      upcoming: upcoming.map((c) => ({ ...c, open: isOpen(c.startsAt) })),
      past: calls.filter((c) => !upcoming.includes(c)).map((c) => ({ ...c, hasReport: !!c.reportAt })),
    },
    shifts: shifts.map((s) => ({ id: s.id, title: s.title, startAt: s.startAt, endAt: s.endAt, location: s.location, left: Math.max(0, s.capacity - s._count.checkins) })),
  };
}

/** PATCH /api/impact-rooms/:id { public }: staff turn the public page on or off. */
export async function setRoomPublic(id: string, user: SessionUser, b: Record<string, unknown>) {
  if (!isStaff(user)) throw new ForbiddenException('Only admins and teachers run impact rooms.');
  await project(id);
  await prisma.nGOProject.update({ where: { id }, data: { roomPublic: b.public === true } });
  await refresh(id, [user.id]);
  return { ok: true, isPublic: b.public === true };
}

/** POST /api/impact-rooms/:id/follow { role }; DELETE leaves (and drops my pledge). */
export async function followRoom(id: string, user: SessionUser, b: Record<string, unknown>) {
  await project(id);
  let role: FollowRole = ROLES.includes(b.role as FollowRole) ? (b.role as FollowRole) : 'SUPPORTER';
  if (role === 'SPONSOR' && user.role === 'STUDENT') role = 'SUPPORTER';
  await prisma.impactFollower.upsert({ where: { projectId_userId: { projectId: id, userId: user.id } }, update: { role }, create: { projectId: id, userId: user.id, role } });
  await refresh(id, [user.id]);
  return { ok: true, role };
}
export async function leaveRoom(id: string, user: SessionUser) {
  await prisma.$transaction([
    prisma.impactFollower.deleteMany({ where: { projectId: id, userId: user.id } }),
    prisma.timePledge.deleteMany({ where: { projectId: id, userId: user.id } }),
  ]);
  await refresh(id, [user.id]);
  return { ok: true };
}

// ── Updates ───────────────────────────────────────────────────────────────────────────────────

/** POST /api/impact-rooms/:id/updates { body, public? }: followers and staff post; staff may make it public. */
export async function postUpdate(id: string, user: SessionUser, b: Record<string, unknown>) {
  const p = await project(id);
  const staff = isStaff(user);
  if (!staff && !(await prisma.impactFollower.findUnique({ where: { projectId_userId: { projectId: id, userId: user.id } }, select: { role: true } }))) {
    throw new ForbiddenException('Follow this room to post in it.');
  }
  const body = clean(b.body, MAX_BODY);
  if (!body) throw new BadRequestException('Write something first.');
  if ((await prisma.impactUpdate.count({ where: { projectId: id, authorId: user.id, createdAt: { gt: new Date(Date.now() - DAY) } } })) >= POSTS_PER_DAY) {
    throw new BadRequestException('That’s a lot of posts today. Please try again tomorrow.');
  }
  const update = await prisma.impactUpdate.create({ data: { projectId: id, authorId: user.id, body, isPublic: staff && b.public === true }, select: { id: true } });
  await refresh(id, [user.id]);
  // News from the people running the room reaches its followers (in the app only).
  if (staff) {
    const ids = (await followers(id)).filter((u) => u !== user.id);
    if (ids.length) later(() => notifyMany(ids, { type: 'info', title: `${p.name}: new update`, body: body.slice(0, 140), link: `/impact-rooms/${id}`, email: false }));
  }
  return update;
}

/** DELETE /api/impact-rooms/updates/:uid: the author or staff. */
export async function deleteUpdate(uid: string, user: SessionUser) {
  const u = await prisma.impactUpdate.findUnique({ where: { id: uid }, select: { id: true, projectId: true, authorId: true } });
  if (!u || (u.authorId !== user.id && !isStaff(user))) throw new NotFoundException('This post isn’t there any more.');
  await prisma.impactUpdate.delete({ where: { id: uid } });
  await refresh(u.projectId, [user.id]);
  return { ok: true };
}

// ── Donations of time ─────────────────────────────────────────────────────────────────────────

/** POST /api/impact-rooms/:id/pledge { hoursPerMonth, months, skill?, note? }; DELETE takes it back. */
export async function pledgeTime(id: string, user: SessionUser, b: Record<string, unknown>) {
  const p = await project(id);
  if (!p.isActive) throw new BadRequestException('This project has ended.');
  const hoursPerMonth = Math.round(Number(b.hoursPerMonth));
  const months = Math.round(Number(b.months) || 3);
  if (!Number.isFinite(hoursPerMonth) || hoursPerMonth < 1 || hoursPerMonth > 40) throw new BadRequestException('Pledge between 1 and 40 hours a month.');
  if (months < 1 || months > 12) throw new BadRequestException('Pledge for 1 to 12 months.');
  const data = { hoursPerMonth, months, skill: clean(b.skill, 60) || null, note: clean(b.note, 300) || null };
  const before = await prisma.timePledge.findUnique({ where: { projectId_userId: { projectId: id, userId: user.id } }, select: { startAt: true, months: true } });
  // A pledge that had run out starts again from today.
  const restart = !before || !running(before);
  await prisma.timePledge.upsert({
    where: { projectId_userId: { projectId: id, userId: user.id } },
    update: { ...data, ...(restart ? { startAt: new Date() } : {}) },
    create: { projectId: id, userId: user.id, ...data },
  });
  const f = await prisma.impactFollower.findUnique({ where: { projectId_userId: { projectId: id, userId: user.id } }, select: { role: true } });
  if (!f || f.role === 'SUPPORTER') await prisma.impactFollower.upsert({ where: { projectId_userId: { projectId: id, userId: user.id } }, update: { role: 'VOLUNTEER' }, create: { projectId: id, userId: user.id, role: 'VOLUNTEER' } });
  await refresh(id, [user.id]);
  return { ok: true };
}
export async function cancelPledge(id: string, user: SessionUser) {
  await prisma.timePledge.deleteMany({ where: { projectId: id, userId: user.id } });
  await refresh(id, [user.id]);
  return { ok: true };
}

// ── The monthly impact call ───────────────────────────────────────────────────────────────────

/** For callAccess (src/server/calls.ts): staff run the call; followers may join it. */
export async function impactCallAccess(projectId: string, user: SessionUser) {
  const p = await prisma.nGOProject.findUnique({ where: { id: projectId }, select: { name: true } });
  if (!p) throw new NotFoundException('This impact room doesn’t exist.');
  const host = isStaff(user);
  if (!host && !(await prisma.impactFollower.findUnique({ where: { projectId_userId: { projectId, userId: user.id } }, select: { role: true } }))) {
    throw new NotFoundException('Follow this impact room to join its calls.');
  }
  return { title: `Impact call · ${p.name}`, host };
}

/** POST /api/impact-rooms/:id/calls { startsAt, title? }: staff plan the next impact call. */
export async function scheduleCall(id: string, user: SessionUser, b: Record<string, unknown>) {
  if (!isStaff(user)) throw new ForbiddenException('Only admins and teachers plan impact calls.');
  const p = await project(id);
  const startsAt = new Date(String(b.startsAt));
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() < Date.now() - 5 * 60_000 || startsAt.getTime() > Date.now() + 120 * DAY) throw new BadRequestException('Pick a time in the next four months.');
  if ((await prisma.impactCall.count({ where: { projectId: id, startsAt: { gt: new Date() } } })) >= MAX_UPCOMING_CALLS) throw new BadRequestException('There are already three calls planned.');
  const title = clean(b.title, 100) || `Impact call · ${startsAt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
  const call = await prisma.impactCall.create({ data: { projectId: id, startsAt, title, createdById: user.id }, select: { id: true, startsAt: true, title: true } });
  await refresh(id, [user.id]);
  const ids = (await followers(id)).filter((u) => u !== user.id);
  if (ids.length) later(() => notifyMany(ids, { type: 'event', title: `${p.name}: impact call planned`, body: `${title}. Join from the room when it starts.`, link: `/impact-rooms/${id}`, email: false }));
  return call;
}

/** DELETE /api/impact-rooms/calls/:cid: staff cancel a call that has no report yet. */
export async function deleteCall(cid: string, user: SessionUser) {
  if (!isStaff(user)) throw new ForbiddenException('Only admins and teachers plan impact calls.');
  const c = await prisma.impactCall.findUnique({ where: { id: cid }, select: { projectId: true, reportAt: true } });
  if (!c) throw new NotFoundException('This call isn’t there any more.');
  if (c.reportAt) throw new BadRequestException('This call has a report, so it stays.');
  await prisma.impactCall.delete({ where: { id: cid } });
  await refresh(c.projectId, [user.id]);
  return { ok: true };
}

interface CallReport {
  project: string; ngo: string | null; title: string; callAt: string;
  period: { from: string; to: string };
  figures: { hours: number; volunteers: number; shifts: number; newFollowers: number; pledgers: number; pledgedHoursPerMonth: number };
  call: { summary: string | null; decisions: string[]; nextSteps: string[]; minutes: number; recorded: boolean } | null;
  highlights: string[];
  headline: string; narrative: string; ai: boolean;
  method: string; issuedAt: string; issuedBy: string;
}
const reportSub = (projectId: string, callId: string) => `${publicAppUrl()}/impact/${projectId}#report-${callId}`;
const NARRATIVE_SCHEMA = { type: 'OBJECT', properties: { headline: { type: 'STRING' }, narrative: { type: 'STRING' } }, required: ['headline', 'narrative'] };
const NARRATIVE_SYSTEM = 'You write short monthly reports for the sponsors of a volunteering project run by a school with an NGO. Use only the facts given. Never invent numbers, names or outcomes, and never name students. Warm, plain, factual English. headline: one sentence, at most 14 words. narrative: 2 short paragraphs, at most 110 words in all.';

/** POST /api/impact-rooms/calls/:cid/report: staff make (or remake) the report for sponsors after the call. */
export async function makeCallReport(cid: string, user: SessionUser) {
  if (!isStaff(user)) throw new ForbiddenException('Only admins and teachers make impact reports.');
  const c = await prisma.impactCall.findUnique({ where: { id: cid } });
  if (!c) throw new NotFoundException('This call isn’t there any more.');
  if (c.startsAt.getTime() > Date.now()) throw new BadRequestException('Make the report after the call.');
  const p = await project(c.projectId);
  // The month the call looks back on: since the call before it (or 31 days), until the day after it.
  const prev = await prisma.impactCall.findFirst({ where: { projectId: c.projectId, startsAt: { lt: c.startsAt } }, orderBy: { startsAt: 'desc' }, select: { startsAt: true } });
  const from = prev?.startsAt ?? new Date(c.startsAt.getTime() - 31 * DAY);
  const to = new Date(Math.min(Date.now(), c.startsAt.getTime() + DAY));
  const callId = impactCallId(c.projectId);
  const [fig, newFollowers, pledges, notes, recordings, posts] = await Promise.all([
    figures([c.projectId], from, to),
    prisma.impactFollower.count({ where: { projectId: c.projectId, createdAt: { gte: from, lt: to } } }),
    prisma.timePledge.findMany({ where: { projectId: c.projectId }, select: { hoursPerMonth: true, months: true, startAt: true }, take: 2000 }),
    prisma.callNote.findFirst({ where: { callId, status: 'READY', createdAt: { gte: new Date(c.startsAt.getTime() - HOUR), lte: new Date(c.startsAt.getTime() + 12 * HOUR) } }, orderBy: { createdAt: 'desc' }, select: { summary: true, decisions: true, actions: true, durationSec: true, people: true } }),
    prisma.callRecording.count({ where: { callId, createdAt: { gte: new Date(c.startsAt.getTime() - HOUR), lte: new Date(c.startsAt.getTime() + 12 * HOUR) } } }),
    // Highlights: what staff shared publicly that month (students' posts stay in the room).
    prisma.impactUpdate.findMany({ where: { projectId: c.projectId, kind: 'UPDATE', isPublic: true, createdAt: { gte: from, lt: to } }, orderBy: { createdAt: 'desc' }, take: 5, select: { body: true } }),
  ]);
  const active = pledges.filter((x) => running(x, to));
  const f = shown(fig.get(c.projectId));
  const parse = <T,>(v: string): T[] => { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } };
  // The report may go public: the names of everyone who was in the call come out of the notes.
  const names = notes ? (await prisma.user.findMany({ where: { id: { in: parse<string>(notes.people).slice(0, 500) } }, select: { name: true } })).flatMap((u) => [u.name, ...u.name.split(/\s+/)]) : [];
  const nameRe = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 3 && !/^(dr|mr|mrs|ms|prof)\.?$/i.test(n)))]
    .sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const nameMatch = nameRe.length ? new RegExp(`(?<!\\p{L})(${nameRe.join('|')})(?!\\p{L})`, 'giu') : null;
  const scrub = (t: string) => (nameMatch ? t.replace(nameMatch, 'a team member').replace(/a team member(\s+a team member)+/g, 'a team member') : t);
  const call = notes ? {
    summary: notes.summary ? scrub(notes.summary) : null, decisions: parse<string>(notes.decisions).slice(0, 8).map(scrub),
    // Next steps without who does them: the report is for people outside the school.
    nextSteps: parse<{ text: string }>(notes.actions).map((a) => scrub(a.text ?? '')).filter(Boolean).slice(0, 8),
    minutes: Math.round(notes.durationSec / 60), recorded: recordings > 0,
  } : null;
  const figuresOut = { ...f, newFollowers, pledgers: active.length, pledgedHoursPerMonth: active.reduce((t, x) => t + x.hoursPerMonth, 0) };
  const highlights = posts.map((x) => x.body.slice(0, 240));

  let headline = f.hours ? `${f.hours} verified volunteer hours for ${p.name} this month` : `${p.name}: this month’s impact report`;
  const pledgedLine = figuresOut.pledgers ? `${figuresOut.pledgers} ${figuresOut.pledgers === 1 ? 'person has' : 'people have'} pledged ${figuresOut.pledgedHoursPerMonth} hours a month.` : '';
  let narrative = [
    `${f.hours ? `${f.volunteers} ${f.volunteers === 1 ? 'volunteer' : 'volunteers'} gave ${f.hours} verified hours over ${f.shifts} ${f.shifts === 1 ? 'shift' : 'shifts'}${p.ngo ? ` with ${p.ngo.name}` : ''}.` : 'No volunteer hours were verified in this period.'} ${pledgedLine}`.trim(),
    call?.summary ? `At the impact call: ${call.summary}` : '',
  ].filter(Boolean).join('\n\n');
  let ai = false;
  if (process.env.GEMINI_API_KEY && !(await featureOff('ai')) && (await spendAi(user)).ok) {
    const facts = JSON.stringify({ project: p.name, ngo: p.ngo?.name ?? null, description: p.description.slice(0, 400), period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }, figures: figuresOut, call, highlights });
    const out = await geminiJson<{ headline: string; narrative: string }>(NARRATIVE_SYSTEM, facts, NARRATIVE_SCHEMA, 600, true).catch(() => null);
    if (out?.headline && out.narrative) { headline = out.headline.slice(0, 160); narrative = out.narrative.slice(0, 1200); ai = true; }
  }

  const report: CallReport = {
    project: p.name, ngo: p.ngo?.name ?? null, title: c.title, callAt: c.startsAt.toISOString(),
    period: { from: from.toISOString(), to: to.toISOString() }, figures: figuresOut, call, highlights, headline, narrative, ai,
    method: 'Hours count only volunteer shifts on this project that were checked in on site (rotating QR code or GPS) or marked present by staff, then checked out, in the period. Pledges are hours a month people have promised and are still running. The call summary comes from the call’s meeting notes.',
    issuedAt: new Date().toISOString(), issuedBy: user.name,
  };
  let jwt: string | null = null;
  try {
    jwt = CredentialSigner.signJwt({ iss: `${publicAppUrl()}/api/passport/issuer`, sub: reportSub(c.projectId, c.id), iat: Math.floor(Date.now() / 1000), report }, `${publicAppUrl()}/api/passport/jwks#${CredentialSigner.jwks().keys[0].kid}`);
  } catch { /* no signing key: the report is kept unsigned */ }
  await prisma.impactCall.update({ where: { id: c.id }, data: { report: { ...report, jwt } as object, reportAt: new Date() } });
  // The report as a public post in the room (replacing an earlier version of it).
  await prisma.impactUpdate.deleteMany({ where: { projectId: c.projectId, callId: c.id, kind: 'REPORT' } });
  await prisma.impactUpdate.create({ data: { projectId: c.projectId, authorId: user.id, kind: 'REPORT', isPublic: true, callId: c.id, body: `${headline}\n\n${narrative}`.slice(0, MAX_BODY) } });
  await refresh(c.projectId, [user.id]);
  const ids = (await followers(c.projectId)).filter((u) => u !== user.id);
  if (ids.length) later(() => notifyMany(ids, { type: 'info', title: `${p.name}: this month’s impact report`, body: headline, link: `/impact-rooms/${c.projectId}`, email: false }));
  return { ok: true, signed: !!jwt, ai };
}

/** A report with its check: signed by UniVerse, and the stored figures match the signature. */
function verified(projectId: string, callId: string, stored: unknown) {
  const { jwt, ...report } = (stored ?? {}) as CallReport & { jwt?: string | null };
  let ok = false;
  if (jwt) {
    try {
      const payload = CredentialSigner.verifyJwt(jwt);
      ok = !!payload && payload.sub === reportSub(projectId, callId) && JSON.stringify(payload.report) === JSON.stringify(report);
    } catch { /* signing key unavailable */ }
  }
  return { report, verified: ok };
}

/** GET /api/impact-rooms/calls/:cid/report: the report, for anyone who may see the room. */
export async function getCallReport(cid: string) {
  const c = await prisma.impactCall.findUnique({ where: { id: cid }, select: { id: true, projectId: true, report: true } });
  if (!c?.report) throw new NotFoundException('This report isn’t ready.');
  return { id: c.id, projectId: c.projectId, ...verified(c.projectId, c.id, c.report) };
}

// ── The public page ───────────────────────────────────────────────────────────────────────────

/** GET /api/impact-rooms/:id/public (no sign-in): figures, public posts and reports. Never students. */
export async function publicRoom(id: string) {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return null;
  const p = await prisma.nGOProject.findUnique({ where: { id }, select: { id: true, name: true, description: true, location: true, sdgNumber: true, isActive: true, roomPublic: true, ngo: { select: { name: true, logoUrl: true, websiteUrl: true, isVerified: true } } } });
  if (!p?.roomPublic) return null;
  const now = new Date();
  const [all, followerCount, pledges, posts, calls] = await Promise.all([
    figures([id]),
    prisma.impactFollower.count({ where: { projectId: id } }),
    prisma.timePledge.findMany({ where: { projectId: id }, select: { hoursPerMonth: true, months: true, startAt: true }, take: 2000 }),
    prisma.impactUpdate.findMany({ where: { projectId: id, isPublic: true, kind: 'UPDATE' }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, body: true, createdAt: true, author: { select: { name: true } } } }),
    prisma.impactCall.findMany({ where: { projectId: id }, orderBy: { startsAt: 'desc' }, take: 12, select: { id: true, startsAt: true, title: true, report: true } }),
  ]);
  const active = pledges.filter((x) => running(x, now));
  const next = calls.filter((c) => c.startsAt > now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  return {
    id: p.id, name: p.name, description: p.description, location: p.location, sdgNumber: p.sdgNumber, active: p.isActive, ngo: p.ngo,
    total: shown(all.get(id)), followers: followerCount,
    pledged: { people: active.length, hoursPerMonth: active.reduce((t, x) => t + x.hoursPerMonth, 0) },
    // Only staff can make a post public, so it's shown with their name.
    updates: posts.map((u) => ({ id: u.id, body: u.body, createdAt: u.createdAt, by: u.author.name })),
    nextCall: next ? { startsAt: next.startsAt, title: next.title } : null,
    reports: calls.filter((c) => c.report).map((c) => ({ id: c.id, startsAt: c.startsAt, title: c.title, ...verified(id, c.id, c.report) })),
  };
}
