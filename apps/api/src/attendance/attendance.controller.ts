import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('student')
  @Roles(Role.STUDENT)
  getStudentAttendance(@CurrentUser() user: any) {
    return this.attendanceService.getStudentAttendance(user.id);
  }

  @Get('course/:courseId')
  @Roles(Role.TEACHER, Role.ADMIN)
  getCourseAttendance(@Param('courseId') courseId: string, @Query('date') date: string) {
    // If no date provided, use today
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.attendanceService.getCourseAttendance(courseId, targetDate);
  }

  @Post('course/:courseId')
  @Roles(Role.TEACHER, Role.ADMIN)
  markAttendance(
    @Param('courseId') courseId: string,
    @Body() body: { date: string, studentId: string, status: any }
  ) {
    return this.attendanceService.markAttendance(courseId, body.date, body.studentId, body.status);
  }
}
