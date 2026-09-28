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

  findAll() {
    return prisma.knowledgeHubResource.findMany({
      include: { author: { select: { name: true, email: true } }, course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPublic() {
    return prisma.knowledgeHubResource.findMany({
      where: {
        isPublic: true,
      },
      include: { author: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const resource = await prisma.knowledgeHubResource.findUnique({
      where: { id },
      include: { author: { select: { name: true, email: true } } },
    });
    if (!resource) throw new NotFoundException('Resource not found');
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
