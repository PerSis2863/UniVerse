import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TimetableService } from './timetable.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('timetable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Get('my') findMy(@CurrentUser() user: any) { return this.timetableService.findForUser(user.id); }
  @Get('course/:courseId') findByCourse(@Param('courseId') id: string) { return this.timetableService.findByCourse(id); }
  @Post() create(@Body() body: any) { return this.timetableService.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.timetableService.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.timetableService.remove(id); }
}
