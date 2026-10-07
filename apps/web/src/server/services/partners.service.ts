
import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { pick } from '../pick';
import type { Body } from '../body';

// Only each record's own fields (these used to pass the whole request body to the database).
type NewPartner = Prisma.PartnerCreateInput;
type NewPartnership = Prisma.PartnershipUncheckedCreateInput;
const PARTNER_FIELDS = ['name', 'type', 'description', 'logoUrl', 'websiteUrl', 'country', 'isActive'] as const satisfies readonly (keyof NewPartner)[];
const PARTNERSHIP_FIELDS = ['partnerId', 'companyId', 'title', 'description', 'startDate', 'endDate', 'isActive'] as const satisfies readonly (keyof NewPartnership)[];

export class PartnersService {
  findAll() { return prisma.partner.findMany({ where: { isActive: true }, include: { partnerships: true } }); }
  findOne(id: string) { return prisma.partner.findUnique({ where: { id }, include: { partnerships: true } }); }
  create(data: Body) { return prisma.partner.create({ data: pick<NewPartner>(data, PARTNER_FIELDS) as NewPartner }); }
  update(id: string, data: Body) { return prisma.partner.update({ where: { id }, data: pick<Prisma.PartnerUpdateInput>(data, PARTNER_FIELDS) }); }
  getPartnerships() { return prisma.partnership.findMany({ include: { partner: true, company: true }, orderBy: { createdAt: 'desc' }, take: 500 }); }
  createPartnership(data: Body) { return prisma.partnership.create({ data: pick<NewPartnership>(data, PARTNERSHIP_FIELDS) as NewPartnership }); }
}
