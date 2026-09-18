import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('career')
@UseGuards(JwtAuthGuard)
export class CareerController {

  @Get('opportunities')
  getOpportunities() {
    return [
      {
        id: '1',
        title: 'Software Engineering Intern',
        company: 'Google',
        location: 'Mountain View, CA',
        type: 'Internship',
        deadline: '2026-12-01',
        logo: 'https://logo.clearbit.com/google.com'
      },
      {
        id: '2',
        title: 'Data Science Co-op',
        company: 'Meta',
        location: 'Remote',
        type: 'Co-op',
        deadline: '2026-11-15',
        logo: 'https://logo.clearbit.com/meta.com'
      },
      {
        id: '3',
        title: 'Product Design Intern',
        company: 'Apple',
        location: 'Cupertino, CA',
        type: 'Internship',
        deadline: '2026-12-10',
        logo: 'https://logo.clearbit.com/apple.com'
      },
      {
        id: '4',
        title: 'Junior Front-End Developer',
        company: 'Vercel',
        location: 'Remote',
        type: 'Full-time',
        deadline: '2026-10-30',
        logo: 'https://logo.clearbit.com/vercel.com'
      }
    ];
  }

  @Get('events')
  getEvents() {
    return [
      {
        id: '1',
        title: 'Fall Career Fair 2026',
        date: '2026-10-15T10:00:00Z',
        location: 'Student Union Building'
      },
      {
        id: '2',
        title: 'Resume Workshop with Big Tech',
        date: '2026-09-25T14:00:00Z',
        location: 'Library Auditorium'
      },
      {
        id: '3',
        title: 'Mock Interviews',
        date: '2026-10-01T09:00:00Z',
        location: 'Career Center'
      }
    ];
  }
}
