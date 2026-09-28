
import prisma from '@/lib/db';

export class PartnersService {
  findAll() { return prisma.partner.findMany({ where: { isActive: true }, include: { partnerships: true } }); }
  findOne(id: string) { return prisma.partner.findUnique({ where: { id }, include: { partnerships: true } }); }
  create(data: any) { return prisma.partner.create({ data }); }
  update(id: string, data: any) { return prisma.partner.update({ where: { id }, data }); }
  getPartnerships() { return prisma.partnership.findMany({ include: { partner: true, company: true } }); }
  createPartnership(data: any) { return prisma.partnership.create({ data }); }
}
