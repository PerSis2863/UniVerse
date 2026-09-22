import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('quizzes')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.TEACHER)
  create(@Body() createQuizDto: CreateQuizDto, @Req() req) {
    return this.quizzesService.create(createQuizDto, req.user.userId);
  }

  @Get()
  findAll() {
    return this.quizzesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quizzesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TEACHER)
  update(@Param('id') id: string, @Body() updateQuizDto: UpdateQuizDto) {
    return this.quizzesService.update(id, updateQuizDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.TEACHER)
  remove(@Param('id') id: string) {
    return this.quizzesService.remove(id);
  }

  @Get('teacher/my-quizzes')
  @Roles(Role.TEACHER, Role.ADMIN)
  getTeacherQuizzes(@Req() req) {
    return this.quizzesService.getTeacherQuizzes(req.user.userId);
  }

  @Get('student/my-quizzes')
  @Roles(Role.STUDENT, Role.ADMIN)
  getStudentQuizzes(@Req() req) {
    return this.quizzesService.getStudentQuizzes(req.user.userId);
  }

  @Post(':id/submit')
  @Roles(Role.STUDENT)
  submitQuiz(@Req() req, @Param('id') id: string, @Body('answers') answers: any) {
    return this.quizzesService.submitQuiz(req.user.userId, id, answers);
  }
}
