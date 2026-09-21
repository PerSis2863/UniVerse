import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkillsService {
  constructor(private prisma: PrismaService) {}

  async findByUser(userId: string) { return this.prisma.studentSkill.findMany({ where: { userId } }); }
  async upsert(userId: string, data: any) {
    return this.prisma.studentSkill.upsert({ where: { userId_name: { userId, name: data.name } }, create: { userId, ...data }, update: data });
  }
  async remove(id: string) { return this.prisma.studentSkill.delete({ where: { id } }); }
}
