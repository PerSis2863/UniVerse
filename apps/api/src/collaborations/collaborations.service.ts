import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CollaborationsService {
  constructor(private prisma: PrismaService) {}
  getMyCollabs(userId: string) { return this.prisma.teacherCollaboration.findMany({ where: { OR: [{ initiatorId: userId }, { partnerId: userId }] }, include: { initiator: { select: { id: true, name: true, avatar: true } }, partner: { select: { id: true, name: true, avatar: true } } } }); }
  create(initiatorId: string, data: any) { return this.prisma.teacherCollaboration.create({ data: { initiatorId, ...data } }); }
  update(id: string, data: any) { return this.prisma.teacherCollaboration.update({ where: { id }, data }); }

  // ─── PHASE 3: COLLABORATION PROJECTS (NGO/Student Projects) ──────────────────

  getProjects() {
    return this.prisma.collaborationProject.findMany({
      include: {
        supervisingTeacher: { select: { id: true, name: true, avatar: true } },
        ngoProject: { select: { id: true, name: true, ngo: { select: { name: true } } } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getProjectById(id: string) {
    return this.prisma.collaborationProject.findUnique({
      where: { id },
      include: {
        supervisingTeacher: { select: { id: true, name: true, avatar: true } },
        ngoProject: { select: { id: true, name: true, ngo: { select: { name: true } } } },
        members: { include: { user: { select: { id: true, name: true, avatar: true, email: true } } } },
        milestones: { orderBy: { dueDate: 'asc' } },
      },
    });
  }

  createProject(supervisingTeacherId: string, data: any) {
    return this.prisma.collaborationProject.create({
      data: {
        supervisingTeacherId,
        status: 'PendingReview',
        ...data,
      },
    });
  }

  reviewProject(id: string, status: string) {
    return this.prisma.collaborationProject.update({
      where: { id },
      data: { status },
    });
  }

  updateProject(id: string, data: any) {
    return this.prisma.collaborationProject.update({
      where: { id },
      data,
    });
  }

  joinProject(projectId: string, userId: string, role: string = 'STUDENT') {
    return this.prisma.collaborationMember.create({
      data: { projectId, userId, role },
    });
  }

  createMilestone(projectId: string, data: any) {
    return this.prisma.projectMilestone.create({
      data: {
        projectId,
        ...data,
      },
    });
  }

  updateMilestone(milestoneId: string, data: any) {
    return this.prisma.projectMilestone.update({
      where: { id: milestoneId },
      data,
    });
  }
}
