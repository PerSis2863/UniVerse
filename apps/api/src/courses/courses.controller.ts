import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('courses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.coursesService.findAll(query);
  }

  @Get('my')
  findMy(@CurrentUser() user: any) {
    if (user.role === Role.TEACHER) return this.coursesService.findForTeacher(user.id);
    return this.coursesService.findForStudent(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.coursesService.create(user.id, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) {
    return this.coursesService.update(id, user.id, user.role, body);
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
