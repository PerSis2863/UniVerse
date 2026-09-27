import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { pick } from '../common/pick';

type Actor = { id: string; role: string };
const PROJECT_FIELDS = ['title', 'description', 'partner', 'ngo', 'deadline', 'contactEmail', 'ngoProjectId'] as const;
const MILESTONE_FIELDS = ['title', 'description', 'status', 'dueDate'] as const;
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CollaborationsService {
  constructor(private prisma: PrismaService) {}
  getMyCollabs(userId: string) { return this.prisma.teacherCollaboration.findMany({ where: { OR: [{ initiatorId: userId }, { partnerId: userId }] }, include: { initiator: { select: { id: true, name: true, avatar: true } }, partner: { select: { id: true, name: true, avatar: true } } } }); }
  create(initiatorId: string, data: any) { return this.prisma.teacherCollaboration.create({ data: { ...(pick(data, ['partnerId', 'type', 'title', 'description'] as const) as any), initiatorId } }); }
  async update(id: string, actor: Actor, data: any) {
    const c = await this.prisma.teacherCollaboration.findUnique({ where: { id }, select: { initiatorId: true, partnerId: true } });
    if (!c) throw new NotFoundException();
    if (actor.role !== 'ADMIN' && c.initiatorId !== actor.id && c.partnerId !== actor.id) throw new ForbiddenException();
    return this.prisma.teacherCollaboration.update({ where: { id }, data: pick(data, ['title', 'description', 'status', 'type'] as const) });
  }

  private async assertSupervisor(projectId: string, actor: Actor) {
    const p = await this.prisma.collaborationProject.findUnique({ where: { id: projectId }, select: { supervisingTeacherId: true } });
    if (!p) throw new NotFoundException();
    if (actor.role !== 'ADMIN' && p.supervisingTeacherId !== actor.id) throw new ForbiddenException('Only the supervising teacher or an admin can do this.');
  }

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
        ...(pick(data, PROJECT_FIELDS) as any),
        supervisingTeacherId,
        status: 'PendingReview',
      },
    });
  }

  reviewProject(id: string, status: string) {
    return this.prisma.collaborationProject.update({
      where: { id },
      data: { status },
    });
  }

  async updateProject(id: string, actor: Actor, data: any) {
    await this.assertSupervisor(id, actor);
    return this.prisma.collaborationProject.update({ where: { id }, data: pick(data, PROJECT_FIELDS) });
  }

  async deleteProject(id: string, actor: Actor) {
    await this.assertSupervisor(id, actor);
    await this.prisma.collaborationProject.delete({ where: { id } });
    return { ok: true };
  }

  joinProject(projectId: string, user: Actor) {
    return this.prisma.collaborationMember.create({
      data: { projectId, userId: user.id, role: user.role === 'TEACHER' ? 'TEACHER' : 'STUDENT' },
    });
  }

  async createMilestone(projectId: string, actor: Actor, data: any) {
    await this.assertSupervisor(projectId, actor);
    return this.prisma.projectMilestone.create({ data: { ...(pick(data, MILESTONE_FIELDS) as any), projectId } });
  }

  async updateMilestone(milestoneId: string, actor: Actor, data: any) {
    const m = await this.prisma.projectMilestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } });
    if (!m) throw new NotFoundException();
    await this.assertSupervisor(m.projectId, actor);
    return this.prisma.projectMilestone.update({ where: { id: milestoneId }, data: pick(data, MILESTONE_FIELDS) });
  }
}
