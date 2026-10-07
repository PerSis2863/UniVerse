
import type { Prisma } from '@prisma/client';
import { pick } from '../pick';
import type { Body } from '../body';

type NewDocument = Prisma.StudentDocumentUncheckedCreateInput;
const FIELDS = ['type', 'title', 'fileUrl', 'issuedAt', 'expiresAt'] as const satisfies readonly (keyof NewDocument)[];
import prisma from '@/lib/db';

export class DocumentsService {
  /** Admin list: every document with its owner's details (newest first, capped for the Workers CPU budget). */
  findAll() {
    return prisma.studentDocument.findMany({
      include: { user: { select: { id: true, name: true, email: true, role: true, status: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
  }
  findByUser(userId: string) { return prisma.studentDocument.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }); }
  create(userId: string, data: Body) { return prisma.studentDocument.create({ data: { ...pick<NewDocument>(data, FIELDS), userId, isVerified: false } as NewDocument }); }
  update(id: string, userId: string, data: Body) { return prisma.studentDocument.update({ where: { id, userId }, data: { ...pick<Prisma.StudentDocumentUncheckedUpdateInput>(data, FIELDS), isVerified: false } }); }
  remove(id: string, userId: string) { return prisma.studentDocument.delete({ where: { id, userId } }); }
}
