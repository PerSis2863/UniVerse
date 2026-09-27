import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { GradesService } from './grades.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('grades')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Get('student')
  @Roles(Role.STUDENT)
  getStudentGrades(@CurrentUser() user: any) {
    return this.gradesService.getStudentGrades(user.id);
  }

  @Get('course/:courseId')
  @Roles(Role.TEACHER, Role.ADMIN)
  getCourseGrades(@Param('courseId') courseId: string, @CurrentUser() user: any) {
    return this.gradesService.getCourseGrades(courseId, user);
  }

  @Post('course/:courseId')
  @Roles(Role.TEACHER, Role.ADMIN)
  postGrade(
    @Param('courseId') courseId: string,
    @Body() body: { studentId: string, assignmentName: string, score: number, maxScore?: number, feedback?: string },
    @CurrentUser() user: any,
  ) {
    return this.gradesService.postGrade(courseId, user, body);
  }

  @Delete(':gradeId')
  @Roles(Role.TEACHER, Role.ADMIN)
  removeGrade(@Param('gradeId') gradeId: string, @CurrentUser() user: any) {
    return this.gradesService.removeGrade(gradeId, user);
  }
}
