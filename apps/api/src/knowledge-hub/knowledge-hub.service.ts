import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateKnowledgeHubDto } from './dto/create-knowledge-hub.dto';
import { UpdateKnowledgeHubDto } from './dto/update-knowledge-hub.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KnowledgeHubService {
  constructor(private prisma: PrismaService) {}

  create(createKnowledgeHubDto: CreateKnowledgeHubDto, authorId: string) {
    return this.prisma.knowledgeHubResource.create({
      data: {
        ...createKnowledgeHubDto,
        authorId,
      },
    });
  }

  findAll() {
    return this.prisma.knowledgeHubResource.findMany({
      include: { author: { select: { name: true, email: true } }, course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const resource = await this.prisma.knowledgeHubResource.findUnique({
      where: { id },
      include: { author: { select: { name: true, email: true } } },
    });
    if (!resource) throw new NotFoundException('Resource not found');
    return resource;
  }

  update(id: string, updateKnowledgeHubDto: UpdateKnowledgeHubDto) {
    return this.prisma.knowledgeHubResource.update({
      where: { id },
      data: updateKnowledgeHubDto,
    });
  }

  remove(id: string) {
    return this.prisma.knowledgeHubResource.delete({
      where: { id },
    });
  }
}
