
import { pick } from '../pick';

const FIELDS = ['type', 'title', 'fileUrl', 'issuedAt', 'expiresAt'] as const;
import prisma from '@/lib/db';

export class DocumentsService {
  findAll() { return prisma.studentDocument.findMany({ include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } }); }
  findByUser(userId: string) { return prisma.studentDocument.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }); }
  create(userId: string, data: any) { return prisma.studentDocument.create({ data: { ...(pick(data, FIELDS) as any), userId, isVerified: false } }); }
  update(id: string, userId: string, data: any) { return prisma.studentDocument.update({ where: { id, userId }, data: { ...pick(data, FIELDS), isVerified: false } }); }
  remove(id: string, userId: string) { return prisma.studentDocument.delete({ where: { id, userId } }); }
}
