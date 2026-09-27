import { Injectable } from '@nestjs/common';
import { pick } from '../common/pick';

const FIELDS = ['type', 'title', 'fileUrl', 'issuedAt', 'expiresAt'] as const;
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}
  findAll() { return this.prisma.studentDocument.findMany({ include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } }); }
  findByUser(userId: string) { return this.prisma.studentDocument.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }); }
  create(userId: string, data: any) { return this.prisma.studentDocument.create({ data: { ...(pick(data, FIELDS) as any), userId, isVerified: false } }); }
  update(id: string, userId: string, data: any) { return this.prisma.studentDocument.update({ where: { id, userId }, data: { ...pick(data, FIELDS), isVerified: false } }); }
  remove(id: string, userId: string) { return this.prisma.studentDocument.delete({ where: { id, userId } }); }
}
