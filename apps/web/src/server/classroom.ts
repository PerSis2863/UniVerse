import prisma from '@/lib/db';
import { addPlayer } from './live-game';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { publish } from './realtime';
import { cleanTranscript, createClassSession } from './class-companion';
import { AttendanceService } from './services/attendance.service';
import { assertOnCampus } from './attendance-plus';
import { cleanRule } from '@/lib/tutor-rules';
import { recentHeard } from '@/lib/whisper';
import { sameQuestion, spendAi } from './ai-budget';
import { logAiUse } from './ai-receipts';
import { featureOff } from './moderation';
import { taAnswer } from './whisper';
import { callPeople, callPulse } from './calls';

// Stage 5 · D7: phone clicker for in-person classes. The teacher starts a session for a course and
// projects a code that changes every 30 seconds (the QR opens /student/live?checkin=<code>).
// Students join on their phones: that marks them present (or late) in Attendance. While class
// runs they can say they're lost (the teacher sees a live meter), send questions (shown without a
// name) and answer the course's live polls (src/server/live.ts, which remote students see too).
// The teacher's laptop can take notes (browser speech recognition); ending the session turns them
// into the usual study pack (class-companion.ts). Nothing is emailed.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L look-alikes
const WINDOW_MS = 30_000;
const OPEN_MS = 8 * 3600_000; // a session left open longer than this counts as ended
const LATE_AFTER_MS = 15 * 60_000;
const MOOD_MS = 5 * 60_000; // "I'm lost" counts for five minutes, then it resets
const MAX_LINES = 4000;
const MAX_QUESTIONS = 10;
const TA_PER_CLASS_HOUR = 60;
const TA_REUSE_MS = 15 * 60_000;
/** A student's question as they see it, with the class TA's answer if they asked for one (Stage 5 · Q22). */
const QUESTION = { id: true, text: true, answeredAt: true, createdAt: true, answer: true, citations: true, grounded: true } as const;
const questionView = (q: { id: string; text: string; answeredAt: Date | null; createdAt: Date; answer: string | null; citations: string | null; grounded: boolean }) => ({ ...q, citations: parse<{ n: number; title: string }[]>(q.citations, []) });
/** Whether the class TA answers in this course now: AI is on and the teacher hasn't turned the TA off. */
const taOn = async (tutorRule: string | null) => !!process.env.GEMINI_API_KEY && !cleanRule(tutorRule).whisperOff && !(await featureOff('ai'));

const attendance = new AttendanceService();

// ─── Codes (pure) ────────────────────────────────────────────────────────────────────────────────

export const codeWindow = (now: number) => Math.floor(now / WINDOW_MS);

/** The 6-character code for a session's secret in a 30-second window. */
export async function classCode(secret: string, window: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(window))));
  let code = '';
  for (const b of mac) {
    if (b < 248) code += ALPHABET[b % ALPHABET.length]; // 248 = 8 × 31: every character equally likely
    if (code.length === 6) break;
  }
  return code;
}

/** What someone typed ("abc-234", spaces, lower case) → the code, or null. */
export function normalizeClassCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return code.length === 6 && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

/** Lost and fine right now (each answer counts for five minutes). */
export function moodCounts(checkins: { mood: string | null; moodAt: Date | null }[], now: number) {
  const recent = (m: string) => checkins.filter((c) => c.mood === m && c.moodAt && now - c.moodAt.getTime() < MOOD_MS).length;
  return { lost: recent('LOST'), ok: recent('OK'), total: checkins.length };
}

const parse = <T,>(json: string | null | undefined, fallback: T): T => { try { return json ? (JSON.parse(json) as T) : fallback; } catch { return fallback; } };
const randomSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/[+/=]/g, '');

// ─── Teacher ─────────────────────────────────────────────────────────────────────────────────────

async function teacherSession(sessionId: string, user: SessionUser) {
  const s = await prisma.classroomSession.findUnique({ where: { id: sessionId }, select: { id: true, courseId: true, teacherId: true, secret: true, startedAt: true, endedAt: true, transcript: true, pulse: true, classSessionId: true, linkedCall: true } });
  if (!s) throw new NotFoundException('Session not found.');
  const access = await courseAccess(s.courseId, user);
  if (!access?.canManage) throw new NotFoundException('Session not found.');
  return { ...s, course: access.course };
}

const open = (s: { endedAt: Date | null; startedAt: Date }, now = Date.now()) => !s.endedAt && now - s.startedAt.getTime() < OPEN_MS;

/** The course's running session, if any (for the teacher's Live page). */
export async function activeSession(courseId: string, user: SessionUser) {
  const access = await courseAccess(courseId, user);
  if (!access?.canManage) throw new NotFoundException('Course not found.');
  const s = await prisma.classroomSession.findFirst({ where: { courseId, endedAt: null, startedAt: { gt: new Date(Date.now() - OPEN_MS) } }, orderBy: { startedAt: 'desc' }, select: { id: true } });
  return { session: s };
}

/** Starts an in-person session for a course (or returns the one already running). */
export async function startSession(courseIdRaw: unknown, user: SessionUser) {
  const courseId = typeof courseIdRaw === 'string' ? courseIdRaw : '';
  const access = await courseAccess(courseId, user);
  if (!access?.canManage) throw new NotFoundException('Course not found.');
  const now = Date.now();
  const running = await prisma.classroomSession.findFirst({ where: { courseId, endedAt: null }, orderBy: { startedAt: 'desc' }, select: { id: true, startedAt: true } });
  if (running && now - running.startedAt.getTime() < OPEN_MS) return { id: running.id };
  // One left open from an earlier day: close it.
  await prisma.classroomSession.updateMany({ where: { courseId, endedAt: null }, data: { endedAt: new Date(now) } });
  const s = await prisma.classroomSession.create({ data: { courseId, teacherId: user.id, secret: randomSecret() }, select: { id: true } });
  return { id: s.id };
}

/** The code to show on the projector now, and how long it lasts. */
export async function currentCode(sessionId: string, user: SessionUser) {
  const s = await teacherSession(sessionId, user);
  if (!open(s)) throw new BadRequestException('This session has ended.');
  const now = Date.now();
  return { code: await classCode(s.secret, codeWindow(now)), expiresIn: Math.ceil((WINDOW_MS - (now % WINDOW_MS)) / 1000) };
}

/** What the teacher sees: who's here, the lost meter, questions and notes. */
export async function teacherView(sessionId: string, user: SessionUser) {
  const s = await teacherSession(sessionId, user);
  const [checkins, questions, call] = await Promise.all([
    prisma.classroomCheckin.findMany({ where: { sessionId }, select: { mood: true, moodAt: true }, take: 1000 }),
    prisma.classroomQuestion.findMany({ where: { sessionId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, text: true, answeredAt: true, createdAt: true } }),
    // The course's class call, if it's running (a hybrid class, Stage 5 · Q22): its students, lost and following.
    open(s) ? callPulse(`c_${s.courseId}`).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    id: s.id,
    course: { id: s.course.id, code: s.course.code, name: s.course.name },
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    open: open(s),
    classSessionId: s.classSessionId,
    enrolled: s.course._count.enrollments,
    mood: moodCounts(checkins, Date.now()),
    questions,
    notes: parse<unknown[]>(s.transcript, []).length,
    pulse: parse<unknown[]>(s.pulse, []).slice(-40),
    call: call ? { ...call, linked: s.linkedCall } : null,
    linked: s.linkedCall,
  };
}

/** The teacher's actions: transcript (notes from the laptop mic), answer (a question), end. */
export async function teacherAction(sessionId: string, user: SessionUser, b: Record<string, unknown>) {
  const s = await teacherSession(sessionId, user);
  if (b.action === 'answer') {
    const q = await prisma.classroomQuestion.findFirst({ where: { id: String(b.questionId ?? ''), sessionId }, select: { id: true, studentId: true, answeredAt: true } });
    if (!q) throw new NotFoundException('Question not found.');
    await prisma.classroomQuestion.update({ where: { id: q.id }, data: { answeredAt: q.answeredAt ? null : new Date() } });
    publish([q.studentId], { type: 'refresh', keys: ['/api/classroom/current'] });
    return { ok: true };
  }
  if (!open(s)) throw new BadRequestException('This session has ended.');
  if (b.action === 'transcript') {
    const have = parse<{ t: number; who: string; text: string }[]>(s.transcript, []);
    if (have.length >= MAX_LINES) return { notes: have.length };
    const lines = cleanTranscript(b.lines).slice(0, MAX_LINES - have.length);
    if (!lines.length) return { notes: have.length };
    const all = [...have, ...lines];
    await prisma.classroomSession.update({ where: { id: s.id }, data: { transcript: JSON.stringify(all) } });
    return { notes: all.length };
  }
  if (b.action === 'link') {
    // One class in the room and online: the call's students count on the lost meter and are marked present.
    const on = b.on === true;
    await prisma.classroomSession.update({ where: { id: s.id }, data: { linkedCall: on } });
    const marked = on ? await markOnline(s.courseId, (await callPeople(`c_${s.courseId}`)).ids) : 0;
    return { ok: true, linked: on, marked };
  }
  if (b.action === 'end') {
    const now = Date.now();
    // Whoever is in the linked call at the end counts too (they may have joined it before the link).
    if (s.linkedCall) await markOnline(s.courseId, (await callPeople(`c_${s.courseId}`).catch(() => ({ ids: [] as string[] }))).ids);
    await prisma.classroomSession.update({ where: { id: s.id }, data: { endedAt: new Date(now) } });
    const lines = parse<unknown[]>(s.transcript, []);
    let pack: { id?: string; message?: string } | null = null;
    let note = 'Session ended.';
    if (lines.length) {
      try {
        pack = await createClassSession(`c_${s.courseId}`, user, { transcript: lines, durationSec: Math.round((now - s.startedAt.getTime()) / 1000), pulse: parse<unknown[]>(s.pulse, []) });
        if (pack?.id) await prisma.classroomSession.update({ where: { id: s.id }, data: { classSessionId: pack.id } });
        note = pack?.message ?? note;
      } catch (e) {
        note = e instanceof HttpException ? `Session ended. The study pack wasn’t made: ${e.message}` : 'Session ended. The study pack couldn’t be made right now.';
      }
    }
    const joined = await prisma.classroomCheckin.findMany({ where: { sessionId }, select: { studentId: true }, take: 1000 });
    publish(joined.map((j) => j.studentId), { type: 'refresh', keys: ['/api/classroom/current'] });
    return { ok: true, classSessionId: pack?.id ?? null, message: note };
  }
  throw new BadRequestException('Unknown action.');
}

/**
 * Students in a class call while its in-person class is linked to it (Stage 5 · Q22): present, or
 * late after the first 15 minutes, as for those who joined in the room; a mark the teacher made stays
 * (only "absent" or no mark changes). Only the course's students; a few statements however many.
 */
export async function markOnline(courseId: string, userIds: string[]) {
  const now = Date.now();
  const s = await prisma.classroomSession.findFirst({ where: { courseId, endedAt: null, linkedCall: true, startedAt: { gt: new Date(now - OPEN_MS) } }, orderBy: { startedAt: 'desc' }, select: { id: true, startedAt: true, teacherId: true } });
  if (!s || !userIds.length) return 0;
  const ids = (await prisma.enrollment.findMany({ where: { courseId, studentId: { in: [...new Set(userIds)].slice(0, 90) } }, select: { studentId: true } })).map((e) => e.studentId);
  if (!ids.length) return 0;
  const date = new Date(new Date(now).toISOString().slice(0, 10));
  const status = now - s.startedAt.getTime() > LATE_AFTER_MS ? 'LATE' : 'PRESENT';
  const have = await prisma.attendance.findMany({ where: { courseId, date, studentId: { in: ids } }, select: { studentId: true, status: true } });
  const absent = have.filter((h) => h.status === 'ABSENT').map((h) => h.studentId);
  const none = ids.filter((id) => !have.some((h) => h.studentId === id));
  // 15 rows at a time: D1 takes at most 100 values in one statement.
  for (let i = 0; i < none.length; i += 15) await prisma.attendance.createMany({ data: none.slice(i, i + 15).map((studentId) => ({ studentId, courseId, date, status, note: 'Online (class call)' })) });
  if (absent.length) await prisma.attendance.updateMany({ where: { courseId, date, studentId: { in: absent } }, data: { status, note: 'Online (class call)' } });
  if (none.length || absent.length) publish([s.teacherId], { type: 'refresh', keys: [`/api/classroom/${s.id}`] });
  return none.length + absent.length;
}

// ─── Students ────────────────────────────────────────────────────────────────────────────────────

/** A student enters the projected code (or scans the QR): joined and marked present or late. */
export async function joinWithCode(codeRaw: unknown, user: SessionUser, position?: unknown) {
  if (user.role !== 'STUDENT') throw new ForbiddenException('Only students join a class with a code.');
  const code = normalizeClassCode(codeRaw);
  if (!code) throw new BadRequestException('Type the 6 letters and numbers shown in class.');
  // The school's location check (Stage 5 · Q11), when it's on: compared, never kept.
  await assertOnCampus(position);
  const now = Date.now();
  // The open sessions of my courses; the code must be this window's or the one before (a minute).
  const candidates = await prisma.classroomSession.findMany({
    where: { endedAt: null, startedAt: { gt: new Date(now - OPEN_MS) }, course: { enrollments: { some: { studentId: user.id } } } },
    select: { id: true, secret: true, courseId: true, teacherId: true, startedAt: true, course: { select: { code: true, name: true } } },
    take: 20,
  });
  const w = codeWindow(now);
  let match: (typeof candidates)[number] | null = null;
  for (const s of candidates) {
    if ((await classCode(s.secret, w)) === code || (await classCode(s.secret, w - 1)) === code) { match = s; break; }
  }
  if (!match) throw new BadRequestException('That code doesn’t work. It changes every 30 seconds: use the one on the screen now.');

  await prisma.classroomCheckin.upsert({ where: { sessionId_studentId: { sessionId: match.id, studentId: user.id } }, update: {}, create: { sessionId: match.id, studentId: user.id } });
  // Attendance for today: present, or late after the first 15 minutes. A mark the teacher already
  // made (present, late, excused) stays; only "absent" or no mark is changed.
  const date = new Date(now).toISOString().slice(0, 10);
  const status = now - match.startedAt.getTime() > LATE_AFTER_MS ? 'LATE' : 'PRESENT';
  const before = await prisma.attendance.findUnique({ where: { studentId_courseId_date: { studentId: user.id, courseId: match.courseId, date: new Date(date) } }, select: { status: true } });
  let marked: string = before?.status ?? status;
  if (!before || before.status === 'ABSENT') { await attendance.markAttendance(match.courseId, date, user.id, status); marked = status; }
  // A quiz game running for the class (Stage 5 · B4.5): the code puts them in it too.
  const game = await prisma.liveGame.findFirst({ where: { courseId: match.courseId, status: { not: 'DONE' } }, orderBy: { createdAt: 'desc' }, select: { id: true, hostId: true } });
  if (game) await addPlayer(game.id, user);
  publish([match.teacherId], { type: 'refresh', keys: [`/api/classroom/${match.id}`, ...(game ? ['/api/live/game*'] : [])] });
  return { sessionId: match.id, course: { code: match.course.code, name: match.course.name }, attendance: marked, game: !!game };
}

async function myCheckin(sessionId: string, user: SessionUser) {
  const c = await prisma.classroomCheckin.findUnique({ where: { sessionId_studentId: { sessionId, studentId: user.id } }, select: { id: true, session: { select: { id: true, teacherId: true, startedAt: true, endedAt: true, pulse: true } } } });
  if (!c) throw new NotFoundException('Join the class with the code on the screen first.');
  if (!open(c.session)) throw new BadRequestException('This class has ended.');
  return c;
}

/** The class I'm in right now, if any. */
export async function currentForStudent(user: SessionUser) {
  const now = Date.now();
  const c = await prisma.classroomCheckin.findFirst({
    where: { studentId: user.id, session: { endedAt: null, startedAt: { gt: new Date(now - OPEN_MS) } } },
    orderBy: { joinedAt: 'desc' },
    select: { mood: true, moodAt: true, session: { select: { id: true, startedAt: true, course: { select: { id: true, code: true, name: true, tutorRule: true } } } } },
  });
  if (!c) return { session: null };
  const questions = await prisma.classroomQuestion.findMany({ where: { sessionId: c.session.id, studentId: user.id }, orderBy: { createdAt: 'desc' }, select: QUESTION });
  const mood = c.mood && c.moodAt && now - c.moodAt.getTime() < MOOD_MS ? c.mood : null;
  const { tutorRule, ...course } = c.session.course;
  return { session: { id: c.session.id, startedAt: c.session.startedAt, course, mood, questions: questions.map(questionView), ta: await taOn(tutorRule) } };
}

/** A student's actions during class: mood (LOST, OK or clear) and ask. */
export async function studentAction(sessionId: string, user: SessionUser, b: Record<string, unknown>) {
  const c = await myCheckin(sessionId, user);
  const teacher = c.session.teacherId;
  if (b.action === 'mood') {
    const mood = b.mood === 'LOST' || b.mood === 'OK' ? b.mood : null;
    const now = Date.now();
    await prisma.classroomCheckin.update({ where: { id: c.id }, data: { mood, moodAt: mood ? new Date(now) : null } });
    // The class pulse over time (for the study pack): a point at most every 30 seconds.
    const pulse = parse<{ t: number; lost: number; got: number; total: number }[]>(c.session.pulse, []);
    const t = Math.round((now - c.session.startedAt.getTime()) / 1000);
    if (!pulse.length || t - pulse[pulse.length - 1].t >= 30) {
      const all = await prisma.classroomCheckin.findMany({ where: { sessionId }, select: { mood: true, moodAt: true }, take: 1000 });
      const m = moodCounts(all, now);
      await prisma.classroomSession.update({ where: { id: sessionId }, data: { pulse: JSON.stringify([...pulse, { t, lost: m.lost, got: m.ok, total: m.total }].slice(-800)) } });
    }
    publish([teacher], { type: 'refresh', keys: [`/api/classroom/${sessionId}`] });
    return { ok: true, mood };
  }
  if (b.action === 'ask') {
    const text = typeof b.text === 'string' ? b.text.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
    if (text.length < 3) throw new BadRequestException('Write your question first.');
    if ((await prisma.classroomQuestion.count({ where: { sessionId, studentId: user.id } })) >= MAX_QUESTIONS) throw new BadRequestException(`You can send up to ${MAX_QUESTIONS} questions in one class.`);
    const q = await prisma.classroomQuestion.create({ data: { sessionId, studentId: user.id, text }, select: QUESTION });
    publish([teacher], { type: 'refresh', keys: [`/api/classroom/${sessionId}`] });
    return questionView(q);
  }
  if (b.action === 'ta') return askTa(sessionId, user, b.questionId);
  throw new BadRequestException('Unknown action.');
}

/**
 * The class TA's answer to one of my questions in an in-person class (Stage 5 · Q22, as Whisper TA in
 * class calls): from the course's materials and the notes the teacher's laptop has taken in the last
 * ten minutes. Only the student sees it. The same question asked in this class in the last 15
 * minutes gets the answer already made (when it came from the course materials), at no cost.
 */
async function askTa(sessionId: string, user: SessionUser, questionId: unknown) {
  const q = typeof questionId === 'string' ? await prisma.classroomQuestion.findFirst({ where: { id: questionId, sessionId, studentId: user.id }, select: QUESTION }) : null;
  if (!q) throw new NotFoundException('Question not found.');
  if (q.answer) return questionView(q);
  const s = await prisma.classroomSession.findUnique({ where: { id: sessionId }, select: { startedAt: true, transcript: true, course: { select: { id: true, code: true, name: true, tutorRule: true } } } });
  if (!s) throw new NotFoundException('Class not found.');
  if (cleanRule(s.course.tutorRule).whisperOff) throw new ForbiddenException('Your teacher has turned the TA off for this class. Your question is with them.');
  const now = Date.now();
  const norm = sameQuestion(q.text);
  const recent = await prisma.classroomQuestion.findMany({ where: { sessionId, answer: { not: null }, createdAt: { gte: new Date(now - 3_600_000) } }, select: { text: true, answer: true, citations: true, grounded: true, createdAt: true }, take: 200 });
  const same = recent.find((r) => r.grounded && now - r.createdAt.getTime() < TA_REUSE_MS && sameQuestion(r.text) === norm);
  if (same) return questionView(await prisma.classroomQuestion.update({ where: { id: q.id }, data: { answer: same.answer, citations: same.citations, grounded: true }, select: QUESTION }));
  if (recent.length >= TA_PER_CLASS_HOUR) throw new HttpException('The TA has answered all it can for this class this hour. Your question is with your teacher.', 429);
  if (!(await taOn(null))) throw new HttpException('The TA isn’t available right now. Your question is with your teacher.', 503);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const notes = parse<{ t: number; who: string; text: string }[]>(s.transcript, []).map((l) => ({ at: s.startedAt.getTime() + l.t * 1000, who: l.who, text: l.text }));
  const out = await taAnswer(s.course, q.text, recentHeard(notes, now));
  await logAiUse(user.id, { kind: 'ta', detail: q.text, courseId: s.course.id });
  return questionView(await prisma.classroomQuestion.update({ where: { id: q.id }, data: { answer: out.answer, citations: JSON.stringify(out.citations), grounded: out.grounded }, select: QUESTION }));
}

/** POST /api/classroom/[id]: the teacher's or a student's action, by who's asking. */
export async function sessionAction(sessionId: string, user: SessionUser, b: Record<string, unknown>) {
  return user.role === 'STUDENT' ? studentAction(sessionId, user, b) : teacherAction(sessionId, user, b);
}
