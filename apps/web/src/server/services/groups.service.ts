import { NotFoundException, ForbiddenException } from '../http';
import prisma from '@/lib/db';

export class GroupsService {
  async findAll(query: any) {
    return prisma.group.findMany({
      where: {
        isPublic: true,
        ...(query.search && { name: { contains: query.search } }),
      },
      include: {
        _count: { select: { members: true, posts: true } },
        members: {
          take: 4,
          include: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
          },
        },
      },
    });
  }

  async findMyGroups(userId: string) {
    return prisma.groupMembership.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            _count: { select: { members: true } },
            members: {
              take: 4,
              include: {
                user: { select: { id: true, name: true, avatar: true } },
              },
            },
          },
        },
      },
    });
  }

  async checkMembership(groupId: string, userId: string) {
    const mem = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } }
    });
    if (!mem) throw new ForbiddenException('Not a member of this group');
  }

  async findOne(id: string, userId: string) {
    const g = await prisma.group.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        posts: {
          include: { author: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!g) throw new NotFoundException();
    if (!g.isPublic) {
      await this.checkMembership(id, userId);
    }
    return g;
  }

  async create(userId: string, data: any) {
    const group = await prisma.group.create({
      data: {
        name: data.name,
        category: data.category || data.type,
        createdById: userId,
        members: {
          create: {
            userId: userId,
          },
        },
      },
      include: {
        _count: { select: { members: true } },
        members: {
          take: 4,
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    });
    return group;
  }

  async join(groupId: string, userId: string) {
    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) throw new NotFoundException();
    if (!g.isPublic) throw new ForbiddenException('Cannot join private group directly');

    return prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId },
      update: {},
    });
  }

  async leave(groupId: string, userId: string) {
    return prisma.groupMembership.delete({
      where: { groupId_userId: { groupId, userId } },
    });
  }

  async createPost(groupId: string, authorId: string, data: any) {
    await this.checkMembership(groupId, authorId);
    return prisma.groupPost.create({
      data: { groupId, authorId, body: data.text || data.content },
    });
  }

  async getPosts(groupId: string, userId: string) {
    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) throw new NotFoundException();
    if (!g.isPublic) await this.checkMembership(groupId, userId);

    return prisma.groupPost.findMany({
      where: { groupId },
      include: { author: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async inviteMembers(groupId: string, userId: string, emails: string[]) {
    await this.checkMembership(groupId, userId); // Only members can invite
    const users = await prisma.user.findMany({
      where: { email: { in: emails } }
    });

    if (users.length > 0) {
      // SQLite has no skipDuplicates: only add people who aren't members yet.
      const existing = new Set((await prisma.groupMembership.findMany({
        where: { groupId, userId: { in: users.map(u => u.id) } },
        select: { userId: true },
      })).map(m => m.userId));
      const toAdd = users.filter(u => !existing.has(u.id));
      if (toAdd.length > 0) {
        await prisma.groupMembership.createMany({ data: toAdd.map(u => ({ groupId, userId: u.id })) });
      }
    }

    return { invited: users.length };
  }
}
