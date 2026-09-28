import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../http';
import type { CreateQuizDto, UpdateQuizDto } from '../dto';
import prisma from '@/lib/db';

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

  findAll() {
    return prisma.quiz.findMany({
      include: { course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
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

  async submitQuiz(studentId: string, quizId: string, answers: any) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });
    
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.status !== 'PUBLISHED') throw new BadRequestException('This quiz is not open for submissions');
    if (quiz.dueDate && quiz.dueDate.getTime() < Date.now()) throw new BadRequestException('The due date for this quiz has passed');
    const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId: quiz.courseId } } });
    if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
    if (await prisma.quizSubmission.findUnique({ where: { quizId_studentId: { quizId, studentId } } })) {
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

    return prisma.quizSubmission.create({
      data: {
        studentId,
        quizId,
        answers,
        score,
        maxScore,
      }
    });
  }
}
