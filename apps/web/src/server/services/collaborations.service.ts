import { ForbiddenException, NotFoundException } from '../http';
import { pick } from '../pick';

type Actor = { id: string; role: string };
const PROJECT_FIELDS = ['title', 'description', 'partner', 'ngo', 'deadline', 'contactEmail', 'ngoProjectId'] as const;
const MILESTONE_FIELDS = ['title', 'description', 'status', 'dueDate'] as const;
import prisma from '@/lib/db';

export class CollaborationsService {
  getMyCollabs(userId: string) { return prisma.teacherCollaboration.findMany({ where: { OR: [{ initiatorId: userId }, { partnerId: userId }] }, include: { initiator: { select: { id: true, name: true, avatar: true } }, partner: { select: { id: true, name: true, avatar: true } } } }); }
  create(initiatorId: string, data: any) { return prisma.teacherCollaboration.create({ data: { ...(pick(data, ['partnerId', 'type', 'title', 'description'] as const) as any), initiatorId } }); }
  async update(id: string, actor: Actor, data: any) {
    const c = await prisma.teacherCollaboration.findUnique({ where: { id }, select: { initiatorId: true, partnerId: true } });
    if (!c) throw new NotFoundException();
    if (actor.role !== 'ADMIN' && c.initiatorId !== actor.id && c.partnerId !== actor.id) throw new ForbiddenException();
    return prisma.teacherCollaboration.update({ where: { id }, data: pick(data, ['title', 'description', 'status', 'type'] as const) });
  }

  private async assertSupervisor(projectId: string, actor: Actor) {
    const p = await prisma.collaborationProject.findUnique({ where: { id: projectId }, select: { supervisingTeacherId: true } });
    if (!p) throw new NotFoundException();
    if (actor.role !== 'ADMIN' && p.supervisingTeacherId !== actor.id) throw new ForbiddenException('Only the supervising teacher or an admin can do this.');
  }

  // ─── PHASE 3: COLLABORATION PROJECTS (NGO/Student Projects) ──────────────────

  // `detailed` (admins only): also the supervisor's email/department and the members' contact details,
  // so the admin review page can show who is involved.
  getProjects(opts: { detailed?: boolean } = {}) {
    if (opts.detailed) {
      return prisma.collaborationProject.findMany({
        include: {
          supervisingTeacher: { select: { id: true, name: true, avatar: true, email: true, role: true, status: true, teacherProfile: { select: { department: true, designation: true } } } },
          ngoProject: { select: { id: true, name: true, ngo: { select: { name: true } } } },
          members: { select: { role: true, joinedAt: true, user: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { joinedAt: 'asc' }, take: 25 },
          _count: { select: { members: true, milestones: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      });
    }
    return prisma.collaborationProject.findMany({
      include: {
        supervisingTeacher: { select: { id: true, name: true, avatar: true } },
        ngoProject: { select: { id: true, name: true, ngo: { select: { name: true } } } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  /** Members' email addresses only for admins and the supervising teacher, like getProjects. */
  async getProjectById(id: string, viewer: { id: string; role: string }) {
    const project = await prisma.collaborationProject.findUnique({
      where: { id },
      include: {
        supervisingTeacher: { select: { id: true, name: true, avatar: true } },
        ngoProject: { select: { id: true, name: true, ngo: { select: { name: true } } } },
        members: { include: { user: { select: { id: true, name: true, avatar: true, email: true } } } },
        milestones: { orderBy: { dueDate: 'asc' } },
      },
    });
    if (!project || viewer.role === 'ADMIN' || project.supervisingTeacherId === viewer.id) return project;
    return { ...project, members: project.members.map((m) => ({ ...m, user: { ...m.user, email: undefined } })) };
  }

  createProject(supervisingTeacherId: string, data: any) {
    return prisma.collaborationProject.create({
      data: {
        ...(pick(data, PROJECT_FIELDS) as any),
        supervisingTeacherId,
        status: 'PendingReview',
      },
    });
  }

  reviewProject(id: string, status: string) {
    return prisma.collaborationProject.update({
      where: { id },
      data: { status },
    });
  }

  async updateProject(id: string, actor: Actor, data: any) {
    await this.assertSupervisor(id, actor);
    return prisma.collaborationProject.update({ where: { id }, data: pick(data, PROJECT_FIELDS) });
  }

  async deleteProject(id: string, actor: Actor) {
    await this.assertSupervisor(id, actor);
    await prisma.collaborationProject.delete({ where: { id } });
    return { ok: true };
  }

  joinProject(projectId: string, user: Actor) {
    return prisma.collaborationMember.create({
      data: { projectId, userId: user.id, role: user.role === 'TEACHER' ? 'TEACHER' : 'STUDENT' },
    });
  }

  async createMilestone(projectId: string, actor: Actor, data: any) {
    await this.assertSupervisor(projectId, actor);
    return prisma.projectMilestone.create({ data: { ...(pick(data, MILESTONE_FIELDS) as any), projectId } });
  }

  async updateMilestone(milestoneId: string, actor: Actor, data: any) {
    const m = await prisma.projectMilestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } });
    if (!m) throw new NotFoundException();
    await this.assertSupervisor(m.projectId, actor);
    return prisma.projectMilestone.update({ where: { id: milestoneId }, data: pick(data, MILESTONE_FIELDS) });
  }
}
