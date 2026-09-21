import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('calendar')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('my') getMyEvents(@CurrentUser() user: any) { return this.calendarService.getMyEvents(user.id); }
  @Post() create(@CurrentUser() user: any, @Body() body: any) { return this.calendarService.create(user.id, body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.calendarService.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.calendarService.remove(id); }
}
