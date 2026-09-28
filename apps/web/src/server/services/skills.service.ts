import { BadRequestException, NotFoundException } from '../http';
import prisma from '@/lib/db';

export class SkillsService {
  async findByUser(userId: string) { return prisma.studentSkill.findMany({ where: { userId } }); }
  async upsert(userId: string, data: any) {
    const name = typeof data?.name === 'string' ? data.name.trim().slice(0, 60) : '';
    if (!name) throw new BadRequestException('Skill name is required');
    const fields = {
      category: typeof data.category === 'string' ? data.category.slice(0, 60) : undefined,
      level: data.level,
    };
    return prisma.studentSkill.upsert({ where: { userId_name: { userId, name } }, create: { ...fields, name, userId }, update: fields });
  }
  async remove(id: string, userId: string) {
    const res = await prisma.studentSkill.deleteMany({ where: { id, userId } });
    if (!res.count) throw new NotFoundException();
    return { ok: true };
  }
}
