import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImpactService {
  constructor(private prisma: PrismaService) {}

  // Leaderboard
  async getLeaderboard() {
    const points = await this.prisma.impactPoint.groupBy({ by: ['userId'], _sum: { points: true }, orderBy: { _sum: { points: 'desc' } }, take: 50 });
    const userIds = points.map(p => p.userId);
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatar: true, studentProfile: true } });
    return points.map(p => ({ ...users.find(u => u.id === p.userId), totalPoints: p._sum.points }));
  }

  async getMyPoints(userId: string) {
    return this.prisma.impactPoint.findMany({ where: { userId }, orderBy: { awardedAt: 'desc' } });
  }

  async getDashboardStats(userId: string) {
    const points = await this.prisma.impactPoint.findMany({ where: { userId }, orderBy: { awardedAt: 'desc' }, take: 10 });
    const allPoints = await this.prisma.impactPoint.aggregate({ where: { userId }, _sum: { points: true } });
    const totalPoints = allPoints._sum.points || 0;
    
    const ngoApps = await this.prisma.nGOProjectApplication.findMany({ where: { studentId: userId }, include: { project: { include: { ngo: true } } } });
    const completedNGOs = ngoApps.filter(a => a.status === 'ACCEPTED').length;

    const startupApps = await this.prisma.startupApplication.findMany({ where: { userId }, include: { startup: true } });
    const grants = startupApps.filter(a => a.status === 'ACCEPTED').length * 1200;

    const sdgBadges = ngoApps
      .filter(a => a.status === 'ACCEPTED' && a.project.sdgNumber)
      .map(a => {
        const colors = ['from-cyan-500 to-blue-600', 'from-rose-500 to-red-600', 'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600', 'from-purple-500 to-indigo-600'];
        return {
          num: a.project.sdgNumber,
          name: `SDG ${a.project.sdgNumber} Objective`,
          hours: a.project.impactPoints,
          partner: a.project.ngo.name,
          status: 'Completed',
          color: colors[(a.project.sdgNumber || 0) % colors.length]
        };
      });

    const activities = points.map(p => ({
      date: p.awardedAt.toISOString(),
      title: p.reason,
      hours: `${p.points} Points Logged`,
      ngo: p.sourceType,
      hash: `0x${p.id.substring(0, 8)}...`
    }));

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });

    return {
      userName: user?.name || 'Student',
      totalPoints,
      verifiedHours: Math.floor(totalPoints / 10),
      completedNGOs,
      grants,
      sdgBadges,
      activities
    };
  }

  async awardPoints(userId: string, data: any) {
    return this.prisma.impactPoint.create({ data: { userId, ...data } });
  }

  // NGOs & Projects
  async getNGOs(query: any) {
    return this.prisma.nGO.findMany({ where: { ...(query.search && { name: { contains: query.search, mode: 'insensitive' } }) }, include: { _count: { select: { projects: true } } } });
  }

  async getNGOProjects(query: any) {
    return this.prisma.nGOProject.findMany({ where: { isActive: true }, include: { ngo: true, _count: { select: { applications: true } } } });
  }

  async applyToNGOProject(projectId: string, studentId: string, data: any) {
    return this.prisma.nGOProjectApplication.upsert({ where: { projectId_studentId: { projectId, studentId } }, create: { projectId, studentId, ...data }, update: data });
  }

  // Startups
  async getStartups() { return this.prisma.startup.findMany({ where: { isActive: true }, include: { foundedBy: { select: { id: true, name: true } }, _count: { select: { applications: true } } } }); }

  async applyToStartup(startupId: string, userId: string, data: any) {
    return this.prisma.startupApplication.upsert({ where: { startupId_userId: { startupId, userId } }, create: { startupId, userId, ...data }, update: data });
  }

  // Summits
  async getSummits() { return this.prisma.summit.findMany({ include: { _count: { select: { registrations: true } } }, orderBy: { startDate: 'asc' } }); }

  async registerForSummit(summitId: string, userId: string) {
    return this.prisma.summitRegistration.upsert({ where: { summitId_userId: { summitId, userId } }, create: { summitId, userId }, update: {} });
  }

  async getMyRegistrations(userId: string) { return this.prisma.summitRegistration.findMany({ where: { userId }, include: { summit: true } }); }
}
