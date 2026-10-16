import { randomBytes } from 'node:crypto';
import { forStudent } from '@/lib/question-types';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { PreparedRelay, RelayItem } from '@/lib/qr-relay';
import type { SessionUser } from '@/lib/server-auth';
import { str } from './body';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { CredentialSigner } from './services/credential-signer';

// Stage 5 · D17, offline classroom relay: what a teacher can send to phones as moving QR codes
// (src/lib/qr-relay.ts), and the item itself, signed with the platform's Ed25519 key so phones
// can check who sent it with no connection. Only the course's teacher (or an admin).

const MAX_TEXT = 6000;
const MAX_QUESTIONS = 40;
// Pictures can't travel in a code: Markdown or HTML images, or links to image files.
const PICTURE = /!\[[^\]]*\]\(|<img\b|https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)\b/i;

async function teacherCourse(courseIdRaw: unknown, user: SessionUser) {
  const courseId = str(courseIdRaw);
  if (!courseId) throw new BadRequestException('Pick a course.');
  const access = await courseAccess(courseId, user);
  if (!access) throw new NotFoundException('Course not found');
  if (!access.canManage) throw new ForbiddenException('Only the course’s teacher can send to phones.');
  return access.course;
}

type QuizRow = { id: string; title: string; description: string | null; dueDate: Date | null; timeLimit: number | null; status: string; examMode: boolean; questions: { id: string; question: string; options: unknown; type: string; meta: string | null; correctAnswer: string }[] };
const optionsOf = (v: unknown) => (Array.isArray(v) ? v.filter((o): o is string => typeof o === 'string') : []);

/** Why a quiz can't travel as codes, or null when it can. */
function quizProblem(q: QuizRow): string | null {
  if (q.status === 'DRAFT') return 'Publish it first';
  if (q.status !== 'PUBLISHED') return 'It’s closed';
  if (q.examMode) return 'Exam mode needs a connection';
  if (!q.questions.length) return 'No questions yet';
  if (q.questions.length > MAX_QUESTIONS) return `More than ${MAX_QUESTIONS} questions`;
  if (q.questions.some((x) => x.type === 'HOTSPOT' || PICTURE.test(x.question) || optionsOf(x.options).some((o) => PICTURE.test(o)))) return 'Has pictures';
  return null;
}

const quizSelect = {
  id: true, title: true, description: true, dueDate: true, timeLimit: true, status: true, examMode: true,
  questions: { orderBy: { order: 'asc' as const }, select: { id: true, question: true, options: true, type: true, meta: true, correctAnswer: true } },
};

/** The course's announcements and quizzes, each with whether it can be sent. */
export async function relayChoices(user: SessionUser, courseIdRaw: unknown) {
  const course = await teacherCourse(courseIdRaw, user);
  const [announcements, quizzes] = await Promise.all([
    prisma.announcement.findMany({ where: { courseId: course.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, title: true, body: true, createdAt: true } }),
    prisma.quiz.findMany({ where: { courseId: course.id }, orderBy: { createdAt: 'desc' }, take: 30, select: quizSelect }),
  ]);
  return {
    announcements: announcements.map((a) => ({ id: a.id, title: a.title, createdAt: a.createdAt.toISOString(), problem: a.body.length > MAX_TEXT ? 'Too long' : PICTURE.test(a.body) ? 'Has pictures' : null })),
    quizzes: (quizzes as QuizRow[]).map((q) => ({ id: q.id, title: q.title, questions: q.questions.length, problem: quizProblem(q) })),
  };
}

/** Builds and signs one item: { kind: NOTE, title, text } | { kind: ANNOUNCEMENT | QUIZ, id }. */
export async function prepareRelay(user: SessionUser, b: Record<string, unknown>): Promise<PreparedRelay & { title: string; kind: RelayItem['kind'] }> {
  const course = await teacherCourse(b.courseId, user);
  const base = { v: 1 as const, course: { id: course.id, code: course.code, name: course.name }, from: user.name, at: new Date().toISOString() };
  let item: RelayItem;
  if (b.kind === 'NOTE') {
    const title = (str(b.title) ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const text = (str(b.text) ?? '').replace(/\r\n/g, '\n').trim();
    if (!title) throw new BadRequestException('Give the note a title.');
    if (!text) throw new BadRequestException('Write the note first.');
    if (text.length > MAX_TEXT) throw new BadRequestException(`Keep it under ${MAX_TEXT} characters: longer text needs too many codes.`);
    item = { ...base, id: `note_${randomBytes(6).toString('hex')}`, kind: 'NOTE', title, text };
  } else if (b.kind === 'ANNOUNCEMENT') {
    const a = await prisma.announcement.findFirst({ where: { id: str(b.id) ?? '', courseId: course.id }, select: { id: true, title: true, body: true } });
    if (!a) throw new NotFoundException('Announcement not found');
    if (a.body.length > MAX_TEXT) throw new BadRequestException('This announcement is too long to send as codes.');
    if (PICTURE.test(a.body)) throw new BadRequestException('This announcement has pictures, which can’t travel as codes.');
    item = { ...base, id: a.id, kind: 'ANNOUNCEMENT', title: a.title.slice(0, 200), text: a.body };
  } else if (b.kind === 'QUIZ') {
    const q = (await prisma.quiz.findFirst({ where: { id: str(b.id) ?? '', courseId: course.id }, select: quizSelect })) as QuizRow | null;
    if (!q) throw new NotFoundException('Quiz not found');
    const problem = quizProblem(q);
    if (problem) throw new BadRequestException(`This quiz can’t be sent as codes: ${problem.toLowerCase()}.`);
    // Questions as students see them (no answer key: forStudent leaves it out); the server marks it
    // when it's sent.
    item = {
      ...base, id: q.id, kind: 'QUIZ', title: q.title,
      quiz: {
        id: q.id, title: q.title, description: q.description, dueDate: q.dueDate?.toISOString() ?? null, timeLimit: q.timeLimit,
        questions: q.questions.map((x) => { const s = forStudent(x, null); return { id: s.id, question: s.question, options: s.options, type: s.type, ask: s.ask }; }),
      },
    };
  } else {
    throw new BadRequestException('Choose a note, an announcement or a quiz.');
  }
  const canonical = JSON.stringify(item);
  const signed = CredentialSigner.signText(canonical);
  return { canonical, signature: signed?.signature ?? null, keyId: signed?.keyId ?? null, title: item.title, kind: item.kind };
}
