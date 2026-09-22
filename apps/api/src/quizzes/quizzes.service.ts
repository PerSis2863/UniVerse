import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuizzesService {
  constructor(private prisma: PrismaService) {}

  create(createQuizDto: CreateQuizDto, teacherId: string) {
    return this.prisma.quiz.create({
      data: {
        ...createQuizDto,
      },
    });
  }

  findAll() {
    return this.prisma.quiz.findMany({
      include: { course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: { questions: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    return quiz;
  }

  update(id: string, updateQuizDto: UpdateQuizDto) {
    return this.prisma.quiz.update({
      where: { id },
      data: updateQuizDto,
    });
  }

  remove(id: string) {
    return this.prisma.quiz.delete({
      where: { id },
    });
  }

  async getTeacherQuizzes(teacherId: string) {
    const quizzes = await this.prisma.quiz.findMany({
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
      timeLimit: `${q.timeLimit} mins`,
      status: q.status,
      submissions: q._count.submissions,
      dueDate: q.dueDate ? q.dueDate.toISOString().split('T')[0] : 'No date set'
    }));
  }

  async getStudentQuizzes(studentId: string) {
    const quizzes = await this.prisma.quiz.findMany({
      include: { 
        course: { select: { name: true } },
        _count: { select: { questions: true } }
      },
      orderBy: { createdAt: 'desc' },
    });
    
    const submissions = await this.prisma.quizSubmission.findMany({
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
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });
    
    if (!quiz) throw new NotFoundException('Quiz not found');

    let score = 0;
    let maxScore = 0;

    quiz.questions.forEach(q => {
      maxScore += q.points;
      if (answers[q.id] === q.correctAnswer) {
        score += q.points;
      }
    });

    return this.prisma.quizSubmission.create({
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
