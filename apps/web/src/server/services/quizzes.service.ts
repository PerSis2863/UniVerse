import { evidenceFromQuiz, safely } from '../skill-evidence';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../http';
import type { CreateQuizDto, UpdateQuizDto } from '../dto';
import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { clientIdOf, offlineTime, tellTeacher } from '../offline';
import { publish } from '../realtime';
import { pushService } from './push.service';
import { shuffled } from '@/lib/seeded-shuffle';
import { cleanGiven, forStudent, markAnswer, type Given } from '@/lib/question-types';
import { drawFor, parsePools } from '@/lib/quiz-draw';
import { taughtBy } from '@/lib/course-access';
import { quizMinutes } from '@/lib/assignment-policy';
import { makeReceipt, usesFor } from '../ai-receipts';

/** A student's extra time on timed quizzes (Stage 5 · B3.1 accommodations), as minutes for this quiz. */
async function minutesFor(timeLimit: number | null, studentId: string) {
  if (!timeLimit) return null;
  const acc = await prisma.studentAccommodation.findUnique({ where: { studentId }, select: { extraDays: true, extraTimePct: true } });
  return quizMinutes(timeLimit, acc ?? undefined);
}


/** A minute after the time limit, a hard-stop exam takes no more answers (B4.3). */
const HARD_GRACE_MS = 60_000;

/** A one-way exam's answers saved so far. */
function savedAnswers(raw: string | null | undefined): Record<string, Given> {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Given>) : {};
  } catch { return {}; }
}

/** The questions in the order this student sees them (their draw, shuffled when the quiz says so). */
function studentOrder<Q extends { id: string; pool?: string | null }>(quiz: { id: string; shuffle: boolean; pools: string | null; questions: Q[] }, studentId: string): Q[] {
  const drawn = drawFor(quiz.questions, parsePools(quiz.pools), `${studentId}:${quiz.id}`);
  return quiz.shuffle ? shuffled(drawn, `${studentId}:${quiz.id}`) : drawn;
}
export class QuizzesService {
  /** Teachers may only manage quizzes for their own courses; admins may manage any. */
  private async assertCourseOwner(courseId: string, user: { id: string; role: string }) {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true, staff: { where: { userId: user.id, role: 'CO_TEACHER' }, select: { id: true }, take: 1 } } });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role !== 'ADMIN' && course.teacherId !== user.id && !course.staff.length) throw new ForbiddenException('You can only manage quizzes for your own courses');
  }

  private async assertQuizOwner(id: string, user: { id: string; role: string }) {
    const quiz = await prisma.quiz.findUnique({ where: { id }, select: { courseId: true } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    await this.assertCourseOwner(quiz.courseId, user);
  }

  async create(createQuizDto: CreateQuizDto, user: { id: string; role: string }) {
    await this.assertCourseOwner(createQuizDto.courseId, user);
    // New quizzes always start as drafts; they are published once they have questions.
    return prisma.quiz.create({ data: { ...createQuizDto, status: 'DRAFT' } });
  }

  findAll(user?: { id?: string; role: string }) {
    // Admins oversee every quiz: who teaches the course, how many questions and submissions it has.
    if (user?.role === 'ADMIN') {
      return prisma.quiz.findMany({
        include: {
          course: { select: { id: true, code: true, name: true, teacher: { select: { id: true, name: true, email: true } }, _count: { select: { enrollments: true } } } },
          _count: { select: { questions: true, submissions: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
    }
    // Everyone else only sees quizzes of their own courses: the ones they teach, or (not drafts) the
    // ones they're enrolled in.
    if (!user?.id) return Promise.resolve([]);
    const where: Prisma.QuizWhereInput = user.role === 'TEACHER'
      ? { course: taughtBy(user.id, ['CO_TEACHER']) }
      : { status: { not: 'DRAFT' }, course: { enrollments: { some: { studentId: user.id } } } };
    return prisma.quiz.findMany({
      where,
      include: { course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /** Who submitted a quiz, with their score (the course's teacher or an admin). */
  async getSubmissions(id: string, user: { id: string; role: string }) {
    await this.assertQuizOwner(id, user);
    return prisma.quizSubmission.findMany({
      where: { quizId: id },
      select: { id: true, score: true, maxScore: true, submittedAt: true, offlineAt: true, offlineStartedAt: true, offlineStatus: true, student: { select: { id: true, name: true, email: true } } },
      orderBy: { submittedAt: 'desc' },
      take: 1000,
    });
  }

  async findOne(id: string, user?: { id?: string; role: string }) {
    const quiz = await prisma.quiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } }, course: { select: { teacherId: true, staff: { where: { userId: user?.id ?? '', role: 'CO_TEACHER' }, select: { id: true }, take: 1 } } } },
    });
    if (!quiz || !user?.id) throw new NotFoundException('Quiz not found');
    const { course, ...rest } = quiz;
    // The course's teacher, co-teachers and admins get the whole quiz, answers included.
    if (user.role === 'ADMIN' || course.teacherId === user.id || course.staff.length) return rest;
    // Anyone else must be enrolled in the course, and drafts stay hidden. Students never receive the
    // answer key; grading happens server-side in submitQuiz.
    const enrolled = quiz.status !== 'DRAFT' && (await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId: quiz.courseId } }, select: { id: true } }));
    if (!enrolled) throw new NotFoundException('Quiz not found');
    // Each question as its type shows it to students, without the key (src/lib/question-types.ts);
    // shuffled per student when the quiz says so (B4.3): their own order, the same again on reload.
    // Grading compares the answer text, so the order doesn't matter to it.
    // Their own draw from the quiz's pools (B4.2), and their own numbers where those change.
    const seed = quiz.shuffle ? user.id : null;
    const prepared = drawFor(rest.questions, parsePools(quiz.pools), `${user.id}:${quiz.id}`).map((q) => forStudent(q, seed, user.id));
    // Their time limit with any extra time they're allowed.
    const timeLimit = await minutesFor(rest.timeLimit, user.id);
    return { ...rest, timeLimit, questions: seed ? shuffled(prepared, `${seed}:${quiz.id}`) : prepared };
  }

  /** Exam mode (B4.4): starts the student's clock on the server (once) and says when it ends. */
  async start(quizId: string, studentId: string) {
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { id: true, courseId: true, status: true, examMode: true, oneWay: true, timeLimit: true, aiPolicy: true } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.status !== 'PUBLISHED') throw new BadRequestException('This quiz is not open');
    const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId: quiz.courseId } } });
    if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
    if (await prisma.quizSubmission.findUnique({ where: { quizId_studentId: { quizId, studentId } }, select: { id: true } })) throw new ConflictException('You have already submitted this quiz');
    // An AI receipt (Stage 5 · Q22) covers the attempt, so its start is kept for that too.
    if (!quiz.examMode && quiz.aiPolicy === 'FREE') return { startedAt: null, endsAt: null };
    const attempt = await prisma.quizAttempt.upsert({ where: { quizId_studentId: { quizId, studentId } }, update: {}, create: { quizId, studentId } });
    if (!quiz.examMode) return { startedAt: attempt.startedAt, endsAt: null };
    const minutes = await minutesFor(quiz.timeLimit, studentId);
    // One way (B4.3): the questions already passed, so a reload goes on from the next one.
    return { startedAt: attempt.startedAt, endsAt: minutes ? new Date(attempt.startedAt.getTime() + minutes * 60_000) : null, done: quiz.oneWay ? Object.keys(savedAnswers(attempt.answers)) : [] };
  }

  /** One-way exams (B4.3): saves one answer as the student moves on; questions passed can't change. */
  async answer(quizId: string, studentId: string, body: Record<string, unknown>) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, status: true, examMode: true, oneWay: true, hardStop: true, timeLimit: true, shuffle: true, pools: true, questions: { orderBy: { order: 'asc' }, select: { id: true, type: true, options: true, correctAnswer: true, meta: true, pool: true } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (!quiz.examMode || !quiz.oneWay) throw new BadRequestException('Answers are saved one by one only in one-way exams.');
    if (quiz.status !== 'PUBLISHED') throw new BadRequestException('This quiz is not open');
    const attempt = await prisma.quizAttempt.findUnique({ where: { quizId_studentId: { quizId, studentId } } });
    if (!attempt) throw new BadRequestException('Start the quiz first.');
    if (await prisma.quizSubmission.findUnique({ where: { quizId_studentId: { quizId, studentId } }, select: { id: true } })) throw new ConflictException('You have already submitted this quiz');
    const minutes = await minutesFor(quiz.timeLimit, studentId);
    if (quiz.hardStop && minutes && Date.now() > attempt.startedAt.getTime() + minutes * 60_000 + HARD_GRACE_MS) throw new BadRequestException('Time is up: answers are no longer taken.');
    const order = studentOrder(quiz, studentId);
    const qid = typeof body.questionId === 'string' ? body.questionId : '';
    const at = order.findIndex((q) => q.id === qid);
    if (at < 0) throw new NotFoundException('Question not found.');
    const saved = savedAnswers(attempt.answers);
    if (qid in saved) throw new ConflictException('You’ve moved past this question.');
    // Moving on passes every question before it too (one skipped stays unanswered).
    for (const q of order.slice(0, at)) if (!(q.id in saved)) saved[q.id] = '';
    saved[qid] = cleanGiven(order[at], body.answer) ?? '';
    await prisma.quizAttempt.update({ where: { id: attempt.id }, data: { answers: JSON.stringify(saved) } });
    return { done: Object.keys(saved) };
  }

  async update(id: string, updateQuizDto: UpdateQuizDto, user: { id: string; role: string }) {
    await this.assertQuizOwner(id, user);
    if (updateQuizDto.courseId) await this.assertCourseOwner(updateQuizDto.courseId, user);
    return prisma.quiz.update({
      where: { id },
      data: updateQuizDto,
    });
  }

  async remove(id: string, user: { id: string; role: string }) {
    await this.assertQuizOwner(id, user);
    return prisma.quiz.delete({
      where: { id },
    });
  }

  async getTeacherQuizzes(teacherId: string) {
    const quizzes = await prisma.quiz.findMany({
      where: {
        course: { teacherId }
      },
      include: {
        course: { select: { name: true } },
        _count: { select: { questions: true, submissions: true } }
      },
      orderBy: { createdAt: 'desc' },
    });

    return quizzes.map(q => ({
      id: q.id,
      title: q.title,
      courseId: q.courseId,
      course: q.course?.name || 'Unknown Course',
      questions: q._count.questions,
      timeLimit: q.timeLimit ? `${q.timeLimit} mins` : 'No limit',
      status: q.status,
      submissions: q._count.submissions,
      dueDate: q.dueDate ? q.dueDate.toISOString().split('T')[0] : 'No date set'
    }));
  }

  async getStudentQuizzes(studentId: string) {
    const quizzes = await prisma.quiz.findMany({
      // Practice sets (B4.4) are practised on the Mastery page, not taken as quizzes.
      where: { status: { in: ['PUBLISHED', 'CLOSED'] }, practice: false, course: { enrollments: { some: { studentId } } } },
      include: { 
        course: { select: { name: true } },
        _count: { select: { questions: true } }
      },
      orderBy: { createdAt: 'desc' },
    });
    
    const submissions = await prisma.quizSubmission.findMany({
      where: { studentId },
    });

    const subMap = new Map(submissions.map(s => [s.quizId, s]));
    // With pools (B4.2) each student answers fewer questions than the quiz holds.
    const pooled = quizzes.filter((q) => q.pools).slice(0, 90);
    const sizes = pooled.length ? await prisma.quizQuestion.groupBy({ by: ['quizId', 'pool'], where: { quizId: { in: pooled.map((q) => q.id) } }, _count: { _all: true } }) : [];
    const answering = (q: (typeof quizzes)[number]) => {
      const pools = parsePools(q.pools);
      if (!pools) return q._count.questions;
      return sizes.filter((x) => x.quizId === q.id).reduce((t, x) => t + (x.pool ? Math.min(pools[x.pool] ?? x._count._all, x._count._all) : x._count._all), 0);
    };

    return quizzes.map(q => {
      const sub = subMap.get(q.id);
      return {
        ...q,
        _count: { ...q._count, questions: answering(q) },
        completed: !!sub,
        score: sub ? (sub.score !== null ? Math.round((sub.score / (sub.maxScore || 100)) * 100) : null) : null,
      };
    });
  }

  /**
   * `offline` (upgrade 4): the quiz was taken with no connection and sent later from the device's
   * outbox. A retry with the same clientId gets the saved result back. Finished before the due date
   * it counts as on time; finished after it, it's kept but waits for the teacher to accept it.
   */
  /** `receipt`: the student's AI receipt choice (Stage 5 · Q22); `timeUp`: handed in by itself when the time ran out. */
  async submitQuiz(studentId: string, quizId: string, answers: Prisma.InputJsonObject, offline?: { clientId?: unknown; startedAt?: unknown; finishedAt?: unknown }, integrityIn?: unknown, receipt?: { choice?: unknown; timeUp?: boolean }) {
    const clientId = clientIdOf(offline?.clientId);
    const finishedAt = offlineTime(offline?.finishedAt);
    const startedAt = offlineTime(offline?.startedAt);
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true, course: { select: { teacherId: true, code: true } } },
    });

    if (!quiz) throw new NotFoundException('Quiz not found');
    const existing = await prisma.quizSubmission.findUnique({ where: { quizId_studentId: { quizId, studentId } } });
    if (existing && clientId && existing.clientId === clientId) return existing; // the outbox sent it twice
    if (quiz.status !== 'PUBLISHED' && !(finishedAt && quiz.status === 'CLOSED')) throw new BadRequestException('This quiz is not open for submissions');
    const late = !!quiz.dueDate && quiz.dueDate.getTime() < Date.now();
    if (late && !finishedAt) throw new BadRequestException('The due date for this quiz has passed');
    // Closed meanwhile, or finished after the due date: kept, but the teacher decides.
    const offlineStatus = finishedAt && (quiz.status === 'CLOSED' || (late && finishedAt > quiz.dueDate!)) ? 'LATE' : null;
    const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId: quiz.courseId } } });
    if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
    if (existing) {
      throw new ConflictException('You have already submitted this quiz');
    }

    // Each answer checked and marked by its question's type (Stage 5 · B4.1): a share of the points
    // where the type gives one (several answers, blanks, matching, order). Unknown ids are dropped.
    let score = 0;
    let maxScore = 0;
    // Exam mode (B4.3–4.4): the student's clock on the server, and the answers saved as they moved on.
    // (Also when the quiz asks for an AI receipt, which covers the attempt from its start.)
    const attempt = quiz.examMode || quiz.aiPolicy !== 'FREE' ? await prisma.quizAttempt.findUnique({ where: { quizId_studentId: { quizId, studentId } } }) : null;
    const minutes = attempt && quiz.examMode ? await minutesFor(quiz.timeLimit, studentId) : null;
    const ends = attempt && minutes ? attempt.startedAt.getTime() + minutes * 60_000 : null;
    const arrived = finishedAt ? finishedAt.getTime() : Date.now();
    // A hard stop takes no answers that arrive after the time (a minute's grace for the auto-submit at zero).
    const tooLate = quiz.examMode && quiz.hardStop && !!ends && arrived > ends + HARD_GRACE_MS;
    const saved = quiz.examMode && quiz.oneWay ? savedAnswers(attempt?.answers) : null;
    // One way: what was saved stays as it was; only the question they were on comes from this hand-in.
    const source: Record<string, unknown> = { ...(tooLate ? {} : answers), ...(saved ?? {}) };
    const dropped = tooLate ? Object.keys(answers).filter((k) => !(saved && k in saved) && answers[k] !== '' && answers[k] != null).length : 0;

    const kept: Record<string, Given> = {};
    // Only the questions this student got from the quiz's pools (B4.2) count, and are kept.
    const pools = parsePools(quiz.pools);
    const drawn = drawFor(quiz.questions, pools, `${studentId}:${quizId}`);
    for (const q of drawn) {
      maxScore += q.points;
      const given = cleanGiven(q, source[q.id]);
      if (given == null) continue;
      kept[q.id] = given;
      score += q.points * markAnswer(q, given, studentId).credit;
    }
    score = Math.round(score * 100) / 100;

    // Exam mode (B4.4): what the browser noticed, and how late it arrived against the server clock.
    let integrity: Prisma.InputJsonObject | undefined;
    if (quiz.examMode) {
      const seen = (integrityIn && typeof integrityIn === 'object' ? integrityIn : {}) as Record<string, unknown>;
      const count = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? Math.min(v as number, 999) : 0);
      // Two minutes' grace for slow connections and the auto-submit at zero.
      const overtimeSeconds = ends ? Math.max(0, Math.round((arrived - ends) / 1000) - 120) : 0;
      integrity = { left: count(seen.left), pasted: count(seen.pasted), fullscreenExits: count(seen.fullscreenExits), overtimeSeconds, noStart: !attempt, ...(dropped ? { dropped } : {}) };
    }

    // AI receipt (Stage 5 · Q22): made here from the student's own record of AI help while taking it.
    const aiReceipt = await makeReceipt(studentId, { courseId: quiz.courseId, since: attempt?.startedAt ?? quiz.createdAt, until: finishedAt ?? undefined, policy: quiz.aiPolicy, during: !!attempt, what: 'quiz' }, receipt?.choice, finishedAt ? 'offline' : receipt?.timeUp ? 'auto' : 'given');

    const submission = await prisma.quizSubmission.create({
      data: {
        studentId,
        quizId,
        answers: kept,
        ...(aiReceipt ? { aiReceipt } : {}),
        ...(pools ? { drawn: JSON.stringify(drawn.map((q) => q.id)) } : {}),
        score,
        maxScore,
        ...(integrity ? { integrity } : {}),
        ...(finishedAt ? { clientId, offlineAt: finishedAt, offlineStartedAt: startedAt && startedAt <= finishedAt ? startedAt : null, offlineStatus } : clientId ? { clientId } : {}),
      }
    });
    if (offlineStatus && quiz.course.teacherId) {
      const who = await prisma.user.findUnique({ where: { id: studentId }, select: { name: true } });
      await tellTeacher(quiz.course.teacherId, 'A quiz arrived after its due date', `${who?.name ?? 'A student'} took “${quiz.title}” (${quiz.course.code}) offline and finished after the due date (or after the quiz closed). Accept or remove it in Quizzes.`, '/teacher/quizzes').catch(() => {});
    }
    // Proof of learning (upgrade 2): a passed quiz is evidence for the course's skills.
    if (!offlineStatus) await safely(evidenceFromQuiz({ studentId, submissionId: submission.id, quizId, score, maxScore }));
    return submission;
  }

  /** GET /api/quizzes/:id/ai-receipt: what a student would attach if they handed in now (Stage 5 · Q22). */
  async receiptPreview(quizId: string, studentId: string) {
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { courseId: true, createdAt: true, aiPolicy: true, status: true } });
    const enrolled = quiz && quiz.status !== 'DRAFT' && (await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId: quiz.courseId } }, select: { id: true } }));
    if (!quiz || !enrolled) throw new NotFoundException('Quiz not found');
    const attempt = await prisma.quizAttempt.findUnique({ where: { quizId_studentId: { quizId, studentId } }, select: { startedAt: true } });
    const since = attempt?.startedAt ?? quiz.createdAt;
    return { policy: quiz.aiPolicy, since, during: !!attempt, uses: await usesFor(studentId, { courseId: quiz.courseId, since }) };
  }

  /** Offline quizzes finished after their due date, waiting for the teacher (upgrade 4). */
  async offlinePending(user: { id: string; role: string }) {
    return prisma.quizSubmission.findMany({
      where: { offlineStatus: 'LATE', quiz: user.role === 'ADMIN' ? {} : { course: taughtBy(user.id, ['CO_TEACHER']) } },
      select: { id: true, score: true, maxScore: true, submittedAt: true, offlineAt: true, offlineStartedAt: true, student: { select: { id: true, name: true } }, quiz: { select: { id: true, title: true, dueDate: true, course: { select: { code: true } } } } },
      orderBy: { submittedAt: 'desc' },
      take: 100,
    });
  }

  /** The teacher accepts a late offline quiz (it counts) or removes it (the student is told). */
  async decideOffline(submissionId: string, accept: boolean, user: { id: string; role: string }) {
    const sub = await prisma.quizSubmission.findUnique({ where: { id: submissionId }, select: { id: true, quizId: true, studentId: true, score: true, maxScore: true, offlineStatus: true, quiz: { select: { title: true, courseId: true } } } });
    if (!sub || sub.offlineStatus !== 'LATE') throw new NotFoundException('Nothing to decide here.');
    await this.assertCourseOwner(sub.quiz.courseId, user);
    if (accept) {
      await prisma.quizSubmission.update({ where: { id: sub.id }, data: { offlineStatus: 'ACCEPTED' } });
      await safely(evidenceFromQuiz({ studentId: sub.studentId, submissionId: sub.id, quizId: sub.quizId, score: sub.score ?? 0, maxScore: sub.maxScore ?? 0 }));
    } else {
      await prisma.quizSubmission.delete({ where: { id: sub.id } });
    }
    const title = accept ? 'Your offline quiz was accepted' : 'Your offline quiz wasn’t accepted';
    const body = accept ? `“${sub.quiz.title}” counts, even though it arrived after the due date.` : `“${sub.quiz.title}” was finished after the due date. Talk to your teacher if you think this is a mistake.`;
    await prisma.notification.create({ data: { userId: sub.studentId, title, body, type: accept ? 'success' : 'info', link: '/student/quizzes' } });
    publish([sub.studentId], { type: 'notification' });
    await pushService.sendToMany([sub.studentId], { title, body, url: '/student/quizzes', tag: `offline-quiz-${sub.id}` }).catch(() => 0);
    return { ok: true };
  }
}
