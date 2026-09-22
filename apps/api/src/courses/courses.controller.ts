import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('courses')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.coursesService.findAll(query);
  }

  @Get('admin/all')
  findAllForAdmin() {
    return this.coursesService.findAllForAdmin();
  }

  @Get('my')
  findMy(@CurrentUser() user: any) {
    if (user.role === Role.TEACHER) return this.coursesService.findForTeacher(user.id);
    return this.coursesService.findForStudent(user.id);
  }

  @Get('my-students')
  findMyStudents(@CurrentUser() user: any) {
    if (user.role === Role.TEACHER) return this.coursesService.findMyStudents(user.id);
    return [];
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() body: any) {
    const teacherId = (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) && body.teacherId 
      ? body.teacherId 
      : user.id;
    return this.coursesService.create(teacherId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) {
    return this.coursesService.update(id, user.id, user.role, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.coursesService.remove(id, user.id, user.role);
  }

  @Post(':id/enroll')
  enroll(@Param('id') courseId: string, @CurrentUser() user: any) {
    return this.coursesService.enroll(courseId, user.id);
  }

  @Post(':id/unenroll')
  unenroll(@Param('id') courseId: string, @CurrentUser() user: any) {
    return this.coursesService.unenroll(courseId, user.id);
  }
}
