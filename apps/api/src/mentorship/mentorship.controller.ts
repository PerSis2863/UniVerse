import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MentorshipService } from './mentorship.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('mentorship')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('mentorship')
export class MentorshipController {
  constructor(private readonly mentorshipService: MentorshipService) {}

  @Get('my') getMy(@CurrentUser() user: any) { return this.mentorshipService.getMyRequests(user.id, user.role); }
  @Post('request') create(@CurrentUser() user: any, @Body() body: any) { return this.mentorshipService.create(user.id, body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.mentorshipService.updateStatus(id, body); }
  @Get(':id/sessions') getSessions(@Param('id') id: string) { return this.mentorshipService.getSessions(id); }
  @Post(':id/sessions') addSession(@Param('id') id: string, @Body() body: any) { return this.mentorshipService.addSession(id, body); }

  // ─── PHASE 3: INDUSTRY MENTORS ──────────────────────────────────

  @Get('mentors')
  getIndustryMentors() {
    return this.mentorshipService.getIndustryMentors();
  }

  @Post('mentors/profile')
  createMentorProfile(@CurrentUser() user: any, @Body() body: any) {
    return this.mentorshipService.createMentorProfile(user.id, body);
  }

  @Get('bookings')
  getBookings(@CurrentUser() user: any) {
    return this.mentorshipService.getBookings(user.id, user.role);
  }

  @Post('mentors/:mentorId/book')
  createBooking(@CurrentUser() user: any, @Param('mentorId') mentorId: string, @Body() body: any) {
    return this.mentorshipService.createBooking(user.id, mentorId, body);
  }

  @Patch('bookings/:id/status')
  updateBookingStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.mentorshipService.updateBookingStatus(id, status);
  }
}
