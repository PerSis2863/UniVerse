import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TimetableService } from './timetable.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('timetable')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard, RolesGuard)
@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Get('my') findMy(@CurrentUser() user: any) { return this.timetableService.findForUser(user.id); }
  @Get('course/:courseId') findByCourse(@Param('courseId') id: string) { return this.timetableService.findByCourse(id); }
  
  @Post() 
  @Roles(Role.ADMIN, Role.TEACHER)
  create(@Body() body: any) { return this.timetableService.create(body); }
  
  @Patch(':id') 
  @Roles(Role.ADMIN, Role.TEACHER)
  update(@Param('id') id: string, @Body() body: any) { return this.timetableService.update(id, body); }
  
  @Delete(':id') 
  @Roles(Role.ADMIN, Role.TEACHER)
  remove(@Param('id') id: string) { return this.timetableService.remove(id); }
}
