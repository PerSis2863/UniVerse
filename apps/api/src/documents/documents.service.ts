import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}
  findAll() { return this.prisma.studentDocument.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' } }); }
  findByUser(userId: string) { return this.prisma.studentDocument.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }); }
  create(userId: string, data: any) { return this.prisma.studentDocument.create({ data: { userId, ...data } }); }
  update(id: string, userId: string, data: any) { return this.prisma.studentDocument.update({ where: { id, userId }, data }); }
  remove(id: string, userId: string) { return this.prisma.studentDocument.delete({ where: { id, userId } }); }
}
