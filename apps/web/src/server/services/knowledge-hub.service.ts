import { NotFoundException } from '../http';
import type { CreateKnowledgeHubDto, UpdateKnowledgeHubDto } from '../dto';
import prisma from '@/lib/db';
import { assertOwnerOrAdmin } from '../access';
import { inSchools, schoolsOf, usersIn } from '../school-scope';

type Who = { id: string; role: string; organizationId?: string | null; owner?: boolean };

export class KnowledgeHubService {
  create(createKnowledgeHubDto: CreateKnowledgeHubDto, authorId: string) {
    return prisma.knowledgeHubResource.create({
      data: {
        ...createKnowledgeHubDto,
        authorId,
      },
    });
  }

  /** Public resources plus your own (admins see everything by their school's people, school-scope.ts). */
  async findAll(user: Who) {
    return prisma.knowledgeHubResource.findMany({
      where: user.role === 'ADMIN' ? { author: usersIn(await schoolsOf(user)) } : { OR: [{ isPublic: true }, { authorId: user.id }] },
      // Admins also get the author's contact details and role; everyone else only sees names.
      include: user.role === 'ADMIN'
        ? { author: { select: { id: true, name: true, email: true, role: true, status: true } }, course: { select: { name: true, code: true } } }
        : { author: { select: { name: true } }, course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      ...(user.role === 'ADMIN' ? { take: 1000 } : {}),
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

  async findOne(id: string, user: Who) {
    const found = await prisma.knowledgeHubResource.findUnique({
      where: { id },
      include: { author: { select: { name: true, organizationId: true } } },
    });
    if (!found) throw new NotFoundException('Resource not found');
    const { author: { organizationId: authorOrg, ...author }, ...rest } = found;
    const resource = { ...rest, author };
    // An admin sees another school's resources only when they're public.
    const adminOf = user.role === 'ADMIN' && inSchools(await schoolsOf(user), authorOrg);
    if (!resource.isPublic && resource.authorId !== user.id && !adminOf) throw new NotFoundException('Resource not found');
    return { resource, adminOf };
  }

  /** Only the author, or an admin of the author's school, changes or deletes a resource. */
  async assertCanChange(id: string, user: Who) {
    const { resource, adminOf } = await this.findOne(id, user);
    assertOwnerOrAdmin(resource.authorId, user, 'a resource');
    if (resource.authorId !== user.id && !adminOf) throw new NotFoundException('Resource not found');
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
