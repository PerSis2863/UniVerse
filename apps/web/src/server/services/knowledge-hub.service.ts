import { NotFoundException } from '../http';
import type { CreateKnowledgeHubDto, UpdateKnowledgeHubDto } from '../dto';
import prisma from '@/lib/db';

export class KnowledgeHubService {
  create(createKnowledgeHubDto: CreateKnowledgeHubDto, authorId: string) {
    return prisma.knowledgeHubResource.create({
      data: {
        ...createKnowledgeHubDto,
        authorId,
      },
    });
  }

  /** Public resources plus your own (admins see everything). */
  findAll(user: { id: string; role: string }) {
    return prisma.knowledgeHubResource.findMany({
      where: user.role === 'ADMIN' ? {} : { OR: [{ isPublic: true }, { authorId: user.id }] },
      include: { author: { select: { name: true } }, course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPublic() {
    return prisma.knowledgeHubResource.findMany({
      where: {
        isPublic: true,
      },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: { id: string; role: string }) {
    const resource = await prisma.knowledgeHubResource.findUnique({
      where: { id },
      include: { author: { select: { name: true } } },
    });
    if (!resource || (!resource.isPublic && resource.authorId !== user.id && user.role !== 'ADMIN')) throw new NotFoundException('Resource not found');
    return resource;
  }

  update(id: string, updateKnowledgeHubDto: UpdateKnowledgeHubDto) {
    return prisma.knowledgeHubResource.update({
      where: { id },
      data: updateKnowledgeHubDto,
    });
  }

  remove(id: string) {
    return prisma.knowledgeHubResource.delete({
      where: { id },
    });
  }
}
