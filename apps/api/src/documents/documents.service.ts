import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}
  findByUser(userId: string) { return this.prisma.studentDocument.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }); }
  create(userId: string, data: any) { return this.prisma.studentDocument.create({ data: { userId, ...data } }); }
  update(id: string, data: any) { return this.prisma.studentDocument.update({ where: { id }, data }); }
  remove(id: string) { return this.prisma.studentDocument.delete({ where: { id } }); }
}
