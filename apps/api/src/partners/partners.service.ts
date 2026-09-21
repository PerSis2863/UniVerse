import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PartnersService {
  constructor(private prisma: PrismaService) {}
  findAll() { return this.prisma.partner.findMany({ where: { isActive: true }, include: { partnerships: true } }); }
  findOne(id: string) { return this.prisma.partner.findUnique({ where: { id }, include: { partnerships: true } }); }
  create(data: any) { return this.prisma.partner.create({ data }); }
  update(id: string, data: any) { return this.prisma.partner.update({ where: { id }, data }); }
  getPartnerships() { return this.prisma.partnership.findMany({ include: { partner: true, company: true } }); }
  createPartnership(data: any) { return this.prisma.partnership.create({ data }); }
}
