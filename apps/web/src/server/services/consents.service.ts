
import prisma from '@/lib/db';
import { ConsentType } from '@prisma/client';
import { BadRequestException } from '../http';
import { oneOf } from '../body';

export class ConsentsService {
  getMyConsents(userId: string) { return prisma.studentConsent.findMany({ where: { userId } }); }
  upsertConsent(userId: string, type: string, granted: boolean) {
    if (!oneOf(Object.values(ConsentType), type)) throw new BadRequestException(`type must be one of ${Object.values(ConsentType).join(', ')}`);
    return prisma.studentConsent.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, granted, grantedAt: granted ? new Date() : null },
      update: { granted, grantedAt: granted ? new Date() : null, revokedAt: !granted ? new Date() : null },
    });
  }
}
