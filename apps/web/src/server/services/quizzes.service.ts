import { evidenceFromQuiz, safely } from '../skill-evidence';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../http';
import type { CreateQuizDto, UpdateQuizDto } from '../dto';
import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { clientIdOf, offlineTime, tellTeacher } from '../offline';
import { publish } from '../realtime';
import { pushService } from './push.service';

export class QuizzesService {
  /** Teachers may only manage quizzes for their own courses; admins may manage any. */
  private async assertCourseOwner(courseId: string, user: { id: string; role: string }) {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role !== 'ADMIN' && course.teacherId !== user.id) throw new ForbiddenException('You can only manage quizzes for your own courses');
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

  findAll(user?: { role: string }) {
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
    return prisma.quiz.findMany({
      include: { course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
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

  async findOne(id: string, user?: { role: string }) {
    const quiz = await prisma.quiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    // Students must never receive the answer key; grading happens server-side in submitQuiz.
    if (user?.role !== 'TEACHER' && user?.role !== 'ADMIN') {
      return { ...quiz, questions: quiz.questions.map(({ correctAnswer: _hidden, ...q }) => q) };
    }
    return quiz;
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
      where: { status: { in: ['PUBLISHED', 'CLOSED'] }, course: { enrollments: { some: { studentId } } } },
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

    return quizzes.map(q => {
      const sub = subMap.get(q.id);
      return {
        ...q,
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
  async submitQuiz(studentId: string, quizId: string, answers: Prisma.InputJsonObject, offline?: { clientId?: unknown; startedAt?: unknown; finishedAt?: unknown }) {
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

    let score = 0;
    let maxScore = 0;

    quiz.questions.forEach(q => {
      maxScore += q.points;
      if (answers[q.id] === q.correctAnswer) {
        score += q.points;
      }
    });

    const submission = await prisma.quizSubmission.create({
      data: {
        studentId,
        quizId,
        answers,
        score,
        maxScore,
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

  /** Offline quizzes finished after their due date, waiting for the teacher (upgrade 4). */
  async offlinePending(user: { id: string; role: string }) {
    return prisma.quizSubmission.findMany({
      where: { offlineStatus: 'LATE', quiz: user.role === 'ADMIN' ? {} : { course: { teacherId: user.id } } },
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
