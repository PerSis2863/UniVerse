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
}
