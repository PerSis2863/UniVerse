
import prisma from '@/lib/db';

export class ConsentsService {
  getMyConsents(userId: string) { return prisma.studentConsent.findMany({ where: { userId } }); }
  upsertConsent(userId: string, type: string, granted: boolean) {
    return prisma.studentConsent.upsert({
      where: { userId_type: { userId, type: type as any } },
      create: { userId, type: type as any, granted, grantedAt: granted ? new Date() : null },
      update: { granted, grantedAt: granted ? new Date() : null, revokedAt: !granted ? new Date() : null },
    });
  }
}
