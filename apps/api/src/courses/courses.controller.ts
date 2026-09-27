import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('courses')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.coursesService.findAll(query);
  }

  @Get('admin/all')
  @Roles(Role.ADMIN)
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
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.coursesService.findOne(id, user);
  }

  @Post()
  @Roles(Role.TEACHER, Role.ADMIN)
  create(@CurrentUser() user: any, @Body() body: any) {
    const teacherId = (user.role === Role.ADMIN) && body.teacherId 
      ? body.teacherId 
      : user.id;
    return this.coursesService.create(teacherId, body);
  }

  @Patch(':id')
  @Roles(Role.TEACHER, Role.ADMIN)
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) {
    return this.coursesService.update(id, user.id, user.role, body);
  }

  @Delete(':id')
  @Roles(Role.TEACHER, Role.ADMIN)
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
