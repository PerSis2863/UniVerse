import { Controller, Get, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('career')
@UseGuards(FirebaseAuthGuard)
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
    
    return events.map(e => ({
      id: e.id,
      title: e.title,
      date: e.startAt.toISOString(),
      location: e.description || 'Virtual'
    }));
  }
}
