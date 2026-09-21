import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('career')
@UseGuards(ClerkAuthGuard)
export class CareerController {
  constructor(private prisma: PrismaService) {}

  @Get('opportunities')
  async getOpportunities() {
    // Fetch top internships to display as career opportunities
    const internships = await this.prisma.internship.findMany({
      where: { isActive: true },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    
    return internships.map(i => ({
      id: i.id,
      title: i.title,
      company: i.company?.name || 'Company',
      location: i.location || 'Remote',
      type: i.type?.replace('_', ' ') || 'Internship',
      deadline: i.deadline || new Date(Date.now() + 30*24*60*60*1000).toISOString(), // fallback 30 days
      logo: i.company?.logoUrl || `https://ui-avatars.com/api/?name=${i.company?.name || 'C'}`
    }));
  }

  @Get('events')
  async getEvents() {
    // Fetch calendar events marked as CAREER or just generic upcoming ones
    const events = await this.prisma.calendarEvent.findMany({
      where: { 
        type: 'CAREER',
        startAt: { gte: new Date() }
      },
      orderBy: { startAt: 'asc' },
      take: 3,
    });
    
    if (events.length > 0) {
      return events.map(e => ({
        id: e.id,
        title: e.title,
        date: e.startAt.toISOString(),
        location: e.description || 'Virtual'
      }));
    }

    // Fallback if no career events exist
    return [
      { id: '1', title: 'Fall Career Fair 2026', date: new Date(Date.now() + 10*24*60*60*1000).toISOString(), location: 'Student Union Building' },
      { id: '2', title: 'Resume Workshop with Big Tech', date: new Date(Date.now() + 15*24*60*60*1000).toISOString(), location: 'Library Auditorium' },
      { id: '3', title: 'Mock Interviews', date: new Date(Date.now() + 20*24*60*60*1000).toISOString(), location: 'Career Center' }
    ];
  }
}
