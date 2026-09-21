import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('schedule')
@UseGuards(ClerkAuthGuard)
export class ScheduleController {
  constructor(private prisma: PrismaService) {}

  @Get('weekly')
  async getWeeklySchedule(@CurrentUser() user: any) {
    // Fetch user's enrolled courses
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: user.id },
      include: { course: true }
    });

    // Mock weekly schedule based on their courses
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const timeSlots = ['09:00', '10:30', '13:00', '14:30'];
    
    let currentSlotIdx = 0;
    
    // Assign each course to two different days
    const schedule = enrollments.map((e, idx) => {
      const day1 = days[idx % 5];
      const day2 = days[(idx + 2) % 5];
      const time = timeSlots[currentSlotIdx % timeSlots.length];
      
      currentSlotIdx++;

      return {
        id: e.courseId,
        course: e.course,
        sessions: [
          { day: day1, time, duration: '90m' },
          { day: day2, time, duration: '90m' }
        ]
      };
    });

    return schedule;
  }
}
