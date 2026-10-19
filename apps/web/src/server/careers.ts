import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { isAppFileUrl } from '@/lib/storage';
import {
  MAX_BOOKINGS, MAX_SLOTS_AHEAD, SLOT_DAYS_AHEAD, SLOT_MINUTES, builtInQuestions, cleanDocuments, cleanGradYear, cleanLink, cleanQuestions,
  countFillers, isStage, lengthAdvice, overlaps, stageOfApplication, starParts, wordCount, type Stage,
} from '@/lib/careers';
import { skillMatcher, type Level, type Verified } from '@/lib/skills-bridge';
import { parseSkills } from './skill-evidence';
import { cachedAi, saveAi, spendAi } from './ai-budget';
import { logAiUse } from './ai-receipts';
import type { Body } from './body';
import { later, notify, notifyMany } from './email';
import { geminiJson } from './gemini';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';
import { featureOff } from './moderation';
import { publish } from './realtime';
import { pushService } from './services/push.service';
import { directChat } from './direct-chat';

// Careers (Stage 5 · Q15): a student's application tracker, interview practice with feedback, the
// alumni and mentor directory with bookable times, and alerts for new openings that match a
// student's checked skills. Notifications are in the app and by push, never email.

const studentOnly = (user: SessionUser) => {
  if (user.role !== 'STUDENT') throw new ForbiddenException('This is for students.');
};
const day = (v: unknown): Date | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const docsOf = (s: string) => { try { return cleanDocuments(JSON.parse(s), isAppFileUrl); } catch { return []; } };

// ── Application tracker ────────────────────────────────────────────────

/** GET /api/careers/applications: my applications. Ones made on UniVerse join the tracker by themselves. */
export async function listApplications(user: SessionUser) {
  studentOnly(user);
  const [mine, made] = await Promise.all([
    prisma.jobApplication.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, take: 200 }),
    prisma.internshipApplication.findMany({
      where: { studentId: user.id }, take: 100,
      select: { status: true, appliedAt: true, internshipId: true, internship: { select: { title: true, location: true, company: { select: { name: true } } } } },
    }),
  ]);
  const tracked = new Set(mine.map((a) => a.internshipId).filter(Boolean));
  const missing = made.filter((m) => !tracked.has(m.internshipId));
  // About 9 values a row: 10 rows a statement stays under D1's 100.
  for (let i = 0; i < missing.length; i += 10) {
    await prisma.jobApplication.createMany({
      data: missing.slice(i, i + 10).map((m) => ({ userId: user.id, title: m.internship.title, company: m.internship.company?.name ?? 'Company', location: m.internship.location, stage: stageOfApplication(m.status), appliedAt: m.appliedAt, internshipId: m.internshipId })),
    });
  }
  const rows = missing.length ? await prisma.jobApplication.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, take: 200 }) : mine;
  const statusOf = new Map(made.map((m) => [m.internshipId, m.status]));
  return rows.map((a) => ({
    id: a.id, title: a.title, company: a.company, url: a.url, location: a.location,
    // A UniVerse application's stage is the reviewer's decision (an interview stage the student set stays).
    stage: a.internshipId && statusOf.has(a.internshipId) ? universeStage(a.stage as Stage, statusOf.get(a.internshipId)!) : a.stage,
    onUniverse: !!a.internshipId, appliedAt: a.appliedAt, nextStep: a.nextStep, nextAt: a.nextAt, notes: a.notes,
    documents: docsOf(a.documents), updatedAt: a.updatedAt,
  }));
}
function universeStage(own: Stage, status: string): Stage {
  const decided = stageOfApplication(status);
  return decided === 'APPLIED' && own === 'INTERVIEW' ? 'INTERVIEW' : decided;
}

/** POST /api/careers/applications: add one, or { id, … } to change it. */
export async function saveApplication(user: SessionUser, b: Body) {
  studentOnly(user);
  const id = typeof b.id === 'string' ? b.id : null;
  const existing = id ? await prisma.jobApplication.findFirst({ where: { id, userId: user.id } }) : null;
  if (id && !existing) throw new NotFoundException('Application not found.');
  const data: Record<string, unknown> = {};
  const onUniverse = !!existing?.internshipId;
  if (!onUniverse) {
    if ('title' in b || !existing) { const t = clip(b.title, 140); if (!t) throw new BadRequestException('Add the role you applied for.'); data.title = t; }
    if ('company' in b || !existing) { const c = clip(b.company, 120); if (!c) throw new BadRequestException('Add the company.'); data.company = c; }
    if ('url' in b) data.url = cleanLink(b.url);
    if ('location' in b) data.location = clip(b.location, 120) || null;
  }
  if ('stage' in b) {
    if (!isStage(b.stage)) throw new BadRequestException('Unknown stage.');
    // On UniVerse the reviewer decides: the student can only note an interview.
    if (onUniverse && !['APPLIED', 'INTERVIEW'].includes(b.stage)) throw new BadRequestException('The company updates this application’s result.');
    data.stage = b.stage;
    if (b.stage === 'APPLIED' && !existing?.appliedAt) data.appliedAt = new Date();
  } else if (!existing) data.stage = 'APPLIED';
  if ('appliedAt' in b) data.appliedAt = day(b.appliedAt);
  if ('nextStep' in b) data.nextStep = clip(b.nextStep, 140) || null;
  if ('nextAt' in b) {
    const at = day(b.nextAt);
    if (at && at.getTime() > Date.now() + 366 * 86_400_000) throw new BadRequestException('Pick a date within a year.');
    data.nextAt = at;
    data.remindedAt = null;
  }
  if ('notes' in b) data.notes = clip(b.notes, 4000) || null;
  if ('documents' in b) data.documents = JSON.stringify(cleanDocuments(b.documents, isAppFileUrl));
  if (!existing) {
    if ((await prisma.jobApplication.count({ where: { userId: user.id } })) >= 200) throw new BadRequestException('You can track up to 200 applications. Remove old ones first.');
    if (!('appliedAt' in data) && data.stage !== 'SAVED') data.appliedAt = new Date();
    await prisma.jobApplication.create({ data: { ...(data as { title: string; company: string }), userId: user.id } });
  } else {
    await prisma.jobApplication.update({ where: { id: existing.id }, data: { ...data, updatedAt: new Date() } });
  }
  return listApplications(user);
}

/** DELETE /api/careers/applications?id=: remove one I added (UniVerse ones stay: withdraw them from Openings). */
export async function deleteApplication(user: SessionUser, id: string) {
  studentOnly(user);
  const a = await prisma.jobApplication.findFirst({ where: { id, userId: user.id }, select: { internshipId: true } });
  if (!a) throw new NotFoundException('Application not found.');
  if (a.internshipId) throw new BadRequestException('This one was made on UniVerse: withdraw it from Openings instead.');
  await prisma.jobApplication.delete({ where: { id } });
  return listApplications(user);
}

/** The 15-minute cron: "next step" reminders that are due (an hour before, or at the time for a date only). */
export async function remindApplications() {
  const now = Date.now();
  const due = await prisma.jobApplication.findMany({
    where: { remindedAt: null, nextAt: { gt: new Date(now - 86_400_000), lte: new Date(now + 60 * 60_000) } },
    take: 80,
    select: { id: true, userId: true, title: true, company: true, nextStep: true, nextAt: true },
  });
  for (const a of due) {
    const title = `${a.nextStep || 'Next step'}: ${a.title} at ${a.company}`;
    const body = `Due ${a.nextAt!.toISOString().slice(0, 16).replace('T', ' ')} (UTC). Open your application tracker for notes and documents.`;
    await notify(a.userId, { type: 'reminder', title, body, link: '/student/internships/applications', email: false });
    await pushService.sendToMany([a.userId], { title, body, url: '/student/internships/applications', tag: `remind-job-${a.id}` }).catch(() => 0);
  }
  if (due.length) await prisma.jobApplication.updateMany({ where: { id: { in: due.map((a) => a.id) } }, data: { remindedAt: new Date() } });
  return due.length;
}

// ── Interview practice ─────────────────────────────────────────────────

const aiOn = async () => !!process.env.GEMINI_API_KEY && !(await featureOff('ai'));

async function roleFor(b: Body) {
  if (typeof b.internshipId === 'string' && b.internshipId) {
    const i = await prisma.internship.findFirst({ where: { id: b.internshipId, isActive: true }, select: { title: true, description: true, skills: true, company: { select: { name: true } } } });
    if (!i) throw new NotFoundException('That opening isn’t available.');
    return { role: `${i.title} at ${i.company?.name ?? 'the company'}`.slice(0, 160), about: `${i.description.slice(0, 600)}\nSkills: ${parseSkills(JSON.stringify(i.skills)).join(', ')}` };
  }
  const role = clip(b.role, 120);
  if (role.length < 2) throw new BadRequestException('Say which role you’re practising for.');
  return { role, about: '' };
}

/** POST /api/careers/interview { action: 'questions', role | internshipId }: questions for the role (AI when on, built in otherwise). */
export async function interviewQuestions(user: SessionUser, b: Body) {
  studentOnly(user);
  const { role, about } = await roleFor(b);
  const key = ['interview-q', role.toLowerCase(), about.slice(0, 200)];
  const cached = await cachedAi<{ questions: string[] }>(key, 30);
  if (cached?.questions?.length) return { role, questions: cached.questions, ai: true };
  if (!(await aiOn())) return { role, questions: builtInQuestions(role), ai: false };
  const spend = await spendAi(user);
  if (!spend.ok) return { role, questions: builtInQuestions(role), ai: false, note: spend.message };
  const out = await geminiJson<{ questions: string[] }>(
    'You are an interviewer preparing a student for a real interview. Write 6 interview questions for the role: 3 behavioural questions that invite a STAR answer (a real example) and 3 about the role\'s skills and motivation, from easy to harder. One sentence each, plain words, no numbering.',
    `Role: ${role}\n${about}`,
    { type: 'OBJECT', properties: { questions: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['questions'] },
    500, true,
  );
  const questions = cleanQuestions(out?.questions);
  await logAiUse(user.id, { kind: 'interview', detail: `Questions: ${role}` });
  if (questions.length < 4) return { role, questions: builtInQuestions(role), ai: false };
  await saveAi(key, { questions });
  return { role, questions, ai: true };
}

type Feedback = { score: number; strengths: string[]; improve: string[]; outline: string };
const FEEDBACK_SCHEMA = {
  type: 'OBJECT',
  properties: { score: { type: 'NUMBER' }, strengths: { type: 'ARRAY', items: { type: 'STRING' } }, improve: { type: 'ARRAY', items: { type: 'STRING' } }, outline: { type: 'STRING' } },
  required: ['score', 'strengths', 'improve', 'outline'],
};

/** POST /api/careers/interview { action: 'feedback', role, question, answer }: checks that need no AI, then AI feedback when on. */
export async function interviewFeedback(user: SessionUser, b: Body) {
  studentOnly(user);
  const role = clip(b.role, 160);
  const question = clip(b.question, 300);
  const answer = clip(b.answer, 4000);
  if (!role || !question) throw new BadRequestException('Pick a question first.');
  const words = wordCount(answer);
  if (words < 15) throw new BadRequestException('Say a bit more first: at least a few sentences.');
  const fillers = countFillers(answer);
  const star = starParts(answer);
  const checks = { words, minutes: Math.max(0.1, Math.round((words / 130) * 10) / 10), fillers, star, length: lengthAdvice(words) };
  let feedback: Feedback | null = null;
  let note: string | null = null;
  if (!(await aiOn())) note = 'AI feedback isn’t available right now; the checks above still work.';
  else {
    const spend = await spendAi(user);
    if (!spend.ok) note = spend.message;
    else {
      const out = await geminiJson<Feedback>(
        'You coach a student for a job or internship interview. Judge the answer to the question for this role kindly and specifically. Give a score from 1 (weak) to 5 (excellent); up to 2 strengths and up to 2 things to improve, each one short sentence quoting or naming what they said; and an outline of a stronger answer in STAR form (Situation, Task, Action, Result), four short lines, using their own example where there is one and never inventing facts about them. The answer may come from speech recognition: ignore small recognition errors.',
        `Role: ${role}\nQuestion: ${question}\nAnswer: ${answer}`,
        FEEDBACK_SCHEMA, 700, true,
      );
      await logAiUse(user.id, { kind: 'interview', detail: `Feedback: ${question}` });
      if (out) {
        feedback = {
          score: Math.max(1, Math.min(5, Math.round(Number(out.score) || 1))),
          strengths: (out.strengths ?? []).filter((x) => typeof x === 'string').slice(0, 2).map((x) => x.slice(0, 300)),
          improve: (out.improve ?? []).filter((x) => typeof x === 'string').slice(0, 2).map((x) => x.slice(0, 300)),
          outline: typeof out.outline === 'string' ? out.outline.slice(0, 800) : '',
        };
      } else note = 'No AI feedback right now. Try again in a moment.';
    }
  }
  const saved = await prisma.interviewAnswer.create({
    data: { userId: user.id, role, question, answer, fillers: fillers.total, star, score: feedback?.score ?? null, feedback: JSON.stringify(feedback ?? {}) },
    select: { id: true, createdAt: true },
  });
  return { id: saved.id, createdAt: saved.createdAt, checks, feedback, note };
}

/** GET /api/careers/interview: my recent practice answers. */
export async function interviewHistory(user: SessionUser) {
  studentOnly(user);
  const rows = await prisma.interviewAnswer.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, role: true, question: true, fillers: true, star: true, score: true, createdAt: true } });
  return { answers: rows };
}

/** DELETE /api/careers/interview?id= (or all=1): forget practice answers. */
export async function deleteInterview(user: SessionUser, id: string | null) {
  studentOnly(user);
  await prisma.interviewAnswer.deleteMany({ where: { userId: user.id, ...(id ? { id } : {}) } });
  return interviewHistory(user);
}

// ── Alumni and mentors ─────────────────────────────────────────────────

// Students (alumni and seniors) and teachers set up mentoring in the app (Internships → Mentors, and
// the teacher's Volunteer & Mentor page).
const canMentor = (user: SessionUser) => user.role === 'STUDENT' || user.role === 'TEACHER';
const mentoringPage = (role: string) => (role === 'STUDENT' ? '/student/internships/mentors' : role === 'TEACHER' ? '/teacher/mentorship' : '/calls');
const skillsOf = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 10);

/** GET /api/careers/mentors: mentors taking bookings, with their next free times (no emails). */
export async function mentorDirectory(user: SessionUser) {
  const now = new Date();
  const mentors = await prisma.mentorProfile.findMany({
    where: { isAvailable: true },
    take: 60,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, company: true, jobTitle: true, skills: true, isAlumni: true, gradYear: true, bio: true,
      user: { select: { id: true, name: true, avatar: true, role: true } },
      slots: { where: { startAt: { gt: new Date(now.getTime() + 30 * 60_000) }, bookingId: null }, orderBy: { startAt: 'asc' }, take: 6, select: { id: true, startAt: true, minutes: true } },
    },
  });
  return {
    mentors: mentors.filter((m) => m.user.id !== user.id).map((m) => ({ ...m, skills: skillsOf(m.skills) })),
  };
}

/** GET /api/careers/mentoring: my mentor profile, my offered times and my bookings (as a student and as a mentor). */
export async function myMentoring(user: SessionUser) {
  const profile = await prisma.mentorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, company: true, jobTitle: true, skills: true, isAlumni: true, gradYear: true, bio: true, isAvailable: true },
  });
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [slots, asStudent, asMentor] = await Promise.all([
    profile ? prisma.mentorSlot.findMany({ where: { mentorId: profile.id, startAt: { gt: since } }, orderBy: { startAt: 'asc' }, take: 80, select: { id: true, startAt: true, minutes: true, bookingId: true } }) : [],
    prisma.mentorshipBooking.findMany({ where: { studentId: user.id, slotId: { not: null }, date: { gt: since } }, orderBy: { date: 'asc' }, take: 30, select: { id: true, date: true, topic: true, status: true, scheduledCallId: true, mentor: { select: { user: { select: { id: true, name: true } } } } } }),
    profile ? prisma.mentorshipBooking.findMany({ where: { mentorId: profile.id, slotId: { not: null }, date: { gt: since } }, orderBy: { date: 'asc' }, take: 60, select: { id: true, date: true, topic: true, status: true, scheduledCallId: true, student: { select: { id: true, name: true } } } }) : [],
  ]);
  return {
    profile: profile && { ...profile, skills: skillsOf(profile.skills) },
    slots,
    bookings: [
      ...asStudent.map((b) => ({ id: b.id, at: b.date, topic: b.topic, status: b.status, callId: b.scheduledCallId, with: b.mentor.user, as: 'student' as const })),
      ...asMentor.map((b) => ({ id: b.id, at: b.date, topic: b.topic, status: b.status, callId: b.scheduledCallId, with: b.student, as: 'mentor' as const })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime()),
  };
}

/** POST /api/careers/mentoring { action: 'profile', … }: become a mentor or change my profile. */
export async function saveMentorProfile(user: SessionUser, b: Body) {
  if (!canMentor(user)) throw new ForbiddenException('Students and teachers can set up mentoring here.');
  const data = {
    company: clip(b.company, 120) || null,
    jobTitle: clip(b.jobTitle, 120) || null,
    skills: skillsOf(b.skills),
    isAlumni: b.isAlumni === true,
    gradYear: b.isAlumni === true ? cleanGradYear(b.gradYear) : null,
    bio: clip(b.bio, 600) || null,
    isAvailable: b.isAvailable !== false,
  };
  if (!data.jobTitle && !data.bio) throw new BadRequestException('Add what you do, or a short bio, so students know who you are.');
  await prisma.mentorProfile.upsert({ where: { userId: user.id }, update: data, create: { ...data, userId: user.id } });
  return myMentoring(user);
}

/** POST /api/careers/mentoring { action: 'slots', startAt, minutes, weeks? }: offer a time (repeated weekly up to 8 weeks). */
export async function addSlots(user: SessionUser, b: Body) {
  const profile = await prisma.mentorProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!profile) throw new BadRequestException('Set up your mentor profile first.');
  const start = day(b.startAt);
  const minutes = (SLOT_MINUTES as readonly number[]).includes(Number(b.minutes)) ? Number(b.minutes) : 30;
  const weeks = Math.min(8, Math.max(1, Math.round(Number(b.weeks) || 1)));
  if (!start || start.getTime() < Date.now() + 30 * 60_000) throw new BadRequestException('Pick a time at least 30 minutes from now.');
  const wanted = Array.from({ length: weeks }, (_, i) => ({ startAt: new Date(start.getTime() + i * 7 * 86_400_000), minutes }))
    .filter((s) => s.startAt.getTime() <= Date.now() + SLOT_DAYS_AHEAD * 86_400_000);
  if (!wanted.length) throw new BadRequestException(`Offer times within the next ${SLOT_DAYS_AHEAD} days.`);
  const existing = await prisma.mentorSlot.findMany({ where: { mentorId: profile.id, startAt: { gt: new Date() } }, take: MAX_SLOTS_AHEAD + 10, select: { startAt: true, minutes: true } });
  const fresh = wanted.filter((w) => !existing.some((e) => overlaps(e, w)));
  if (!fresh.length) throw new ConflictException('You already offer that time.');
  if (existing.length + fresh.length > MAX_SLOTS_AHEAD) throw new BadRequestException(`You can offer up to ${MAX_SLOTS_AHEAD} times ahead.`);
  await prisma.mentorSlot.createMany({ data: fresh.map((s) => ({ ...s, mentorId: profile.id })) });
  return myMentoring(user);
}

/** DELETE /api/careers/mentoring?slot=: take back a time nobody booked. */
export async function deleteSlot(user: SessionUser, slotId: string) {
  const slot = await prisma.mentorSlot.findFirst({ where: { id: slotId, mentor: { userId: user.id } }, select: { bookingId: true } });
  if (!slot) throw new NotFoundException('That time isn’t yours.');
  if (slot.bookingId) throw new BadRequestException('Someone booked this time: cancel the booking instead.');
  await prisma.mentorSlot.delete({ where: { id: slotId } });
  return myMentoring(user);
}

/** POST /api/careers/mentoring { action: 'book', slotId, topic }: book a mentor's free time; a call goes into both Calls lists and calendars. */
export async function bookSlot(user: SessionUser, b: Body) {
  studentOnly(user);
  const slotId = typeof b.slotId === 'string' ? b.slotId : '';
  const topic = clip(b.topic, 200);
  if (!topic) throw new BadRequestException('Say briefly what you’d like to talk about.');
  const slot = await prisma.mentorSlot.findUnique({ where: { id: slotId }, select: { id: true, startAt: true, minutes: true, bookingId: true, mentorId: true, mentor: { select: { isAvailable: true, user: { select: { id: true, name: true } } } } } });
  if (!slot || !slot.mentor.isAvailable) throw new NotFoundException('That time isn’t available any more.');
  if (slot.mentor.user.id === user.id) throw new BadRequestException('You can’t book your own time.');
  if (slot.startAt.getTime() < Date.now() + 30 * 60_000) throw new BadRequestException('That time is too soon to book.');
  const upcoming = await prisma.mentorshipBooking.count({ where: { studentId: user.id, slotId: { not: null }, status: 'CONFIRMED', date: { gt: new Date() } } });
  if (upcoming >= MAX_BOOKINGS) throw new BadRequestException(`You can have up to ${MAX_BOOKINGS} mentor sessions booked at once.`);
  // Claim the time first: only one person can (D1 has no transactions, so this update decides).
  const hold = `hold-${randomBytes(6).toString('hex')}`;
  const claimed = await prisma.mentorSlot.updateMany({ where: { id: slot.id, bookingId: null }, data: { bookingId: hold } });
  if (claimed.count !== 1) throw new ConflictException('Someone has just booked that time. Pick another.');
  try {
    const mentor = slot.mentor.user;
    const conversationId = await directChat(user.id, mentor.id);
    const end = new Date(slot.startAt.getTime() + slot.minutes * 60_000);
    const title = `Mentoring: ${user.name} with ${mentor.name}`.slice(0, 120);
    const call = await prisma.scheduledCall.create({ data: { title, kind: 'video', startAt: slot.startAt, durationMin: slot.minutes, conversationId, createdById: user.id, template: 'office' }, select: { id: true } });
    const booking = await prisma.mentorshipBooking.create({
      data: { mentorId: slot.mentorId, studentId: user.id, date: slot.startAt, time: slot.startAt.toISOString().slice(11, 16), topic, status: 'CONFIRMED', slotId: slot.id, scheduledCallId: call.id },
      select: { id: true },
    });
    await prisma.mentorSlot.update({ where: { id: slot.id }, data: { bookingId: booking.id } });
    const batch = `mentor:${booking.id}`;
    await prisma.calendarEvent.createMany({
      data: [
        { userId: user.id, title: `🎓 Mentoring with ${mentor.name}`, description: `${topic}\nJoin from Calls.`, startAt: slot.startAt, endAt: end, type: 'MEETING', batch },
        { userId: mentor.id, title: `🎓 Mentoring ${user.name}`, description: `${topic}\nJoin from Calls.`, startAt: slot.startAt, endAt: end, type: 'MEETING', batch },
      ],
    });
    await notify(mentor.id, { type: 'meeting', title: `${user.name} booked a mentoring session`, body: `${topic} · ${slot.startAt.toISOString().slice(0, 16).replace('T', ' ')} UTC. It’s in your Calls and calendar.`, link: '/calls', email: false });
    publish([user.id, mentor.id], { type: 'refresh', keys: ['/api/careers/mentoring', '/api/careers/mentors', '/api/calls/scheduled'] });
    return myMentoring(user);
  } catch (e) {
    await prisma.mentorSlot.updateMany({ where: { id: slot.id, bookingId: hold }, data: { bookingId: null } });
    throw e;
  }
}

/** POST /api/careers/mentoring { action: 'cancel', bookingId }: either side cancels; the time is offered again. */
export async function cancelBooking(user: SessionUser, b: Body) {
  const id = typeof b.bookingId === 'string' ? b.bookingId : '';
  const booking = await prisma.mentorshipBooking.findUnique({ where: { id }, select: { id: true, status: true, date: true, slotId: true, scheduledCallId: true, studentId: true, student: { select: { name: true } }, mentor: { select: { userId: true, user: { select: { name: true, role: true } } } } } });
  if (!booking || (booking.studentId !== user.id && booking.mentor.userId !== user.id)) throw new NotFoundException('Booking not found.');
  if (booking.status === 'CANCELLED') return myMentoring(user);
  await prisma.mentorshipBooking.update({ where: { id }, data: { status: 'CANCELLED' } });
  if (booking.slotId) {
    // A future time becomes free again; a past one just ends.
    if (booking.date.getTime() > Date.now()) await prisma.mentorSlot.updateMany({ where: { id: booking.slotId, bookingId: id }, data: { bookingId: null } });
  }
  if (booking.scheduledCallId) await prisma.scheduledCall.deleteMany({ where: { id: booking.scheduledCallId } });
  await prisma.calendarEvent.deleteMany({ where: { batch: `mentor:${id}` } });
  const other = booking.studentId === user.id ? booking.mentor.userId : booking.studentId;
  await notify(other, { type: 'meeting', title: `${user.name} cancelled a mentoring session`, body: `${booking.date.toISOString().slice(0, 16).replace('T', ' ')} UTC`, link: other === booking.studentId ? '/student/internships/mentors' : mentoringPage(booking.mentor.user.role), email: false });
  publish([booking.studentId, booking.mentor.userId], { type: 'refresh', keys: ['/api/careers/mentoring', '/api/careers/mentors', '/api/calls/scheduled'] });
  return myMentoring(user);
}

// ── Job alerts ─────────────────────────────────────────────────────────

/** GET/POST /api/careers/alerts { on }: my job alerts switch. */
export async function jobAlerts(user: SessionUser, b?: Body) {
  if (b && typeof b.on === 'boolean') await prisma.user.update({ where: { id: user.id }, data: { jobAlerts: b.on } });
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { jobAlerts: true } });
  return { on: me?.jobAlerts ?? true };
}

const RANK: Record<string, number> = { Developing: 1, Proficient: 2, Advanced: 3 };
/**
 * A new (or newly opened) internship with skills: tell students whose checked skills cover at least
 * half of what it asks for, and who haven't turned job alerts off or applied already. Once per
 * opening, after the reply.
 */
export function alertNewOpening(internshipId: string) {
  later(async () => {
    const opening = await prisma.internship.findUnique({ where: { id: internshipId }, select: { id: true, title: true, isActive: true, alertedAt: true, skills: true, company: { select: { name: true } }, applications: { select: { studentId: true }, take: 500 } } });
    if (!opening?.isActive || opening.alertedAt) return;
    const asked = parseSkills(JSON.stringify(opening.skills));
    if (!asked.length) return;
    // Once per opening: the first save that gets here claims it.
    const claimed = await prisma.internship.updateMany({ where: { id: opening.id, alertedAt: null }, data: { alertedAt: new Date() } });
    if (claimed.count !== 1) return;
    // Everyone's checked skills, newest first (a few thousand rows at most on one campus).
    const rows = await prisma.skillEvidence.findMany({ where: { hidden: false, user: { role: 'STUDENT', jobAlerts: true } }, orderBy: { occurredAt: 'desc' }, take: 6000, select: { userId: true, skill: true, label: true, level: true } });
    const byUser = new Map<string, Map<string, Verified>>();
    for (const r of rows) {
      const mine = byUser.get(r.userId) ?? new Map<string, Verified>();
      const v = mine.get(r.skill) ?? { key: r.skill, label: r.label, level: null, count: 0 };
      v.count += 1;
      if (r.level && (RANK[r.level] ?? 0) > (RANK[v.level ?? ''] ?? 0)) v.level = r.level as Level;
      mine.set(r.skill, v);
      byUser.set(r.userId, mine);
    }
    const applied = new Set(opening.applications.map((a) => a.studentId));
    const matched = [...byUser.entries()]
      .filter(([userId]) => !applied.has(userId))
      .map(([userId, skills]) => ({ userId, m: skillMatcher([...skills.values()])(asked) }))
      .filter(({ m }) => m.matched.length >= 1 && m.percent >= 50)
      .slice(0, 300);
    if (!matched.length) return;
    const ids = matched.map((x) => x.userId);
    const title = `New opening for you: ${opening.title}`;
    const body = `${opening.company?.name ?? 'A company'} is looking for skills you’ve shown in your work. See how you match in Internships.`;
    await notifyMany(ids, { type: 'job', title, body, link: '/student/internships/match', email: false });
    await pushService.sendToMany(ids, { title, body, url: '/student/internships/match', tag: `job-${opening.id}` }).catch(() => 0);
  });
}

