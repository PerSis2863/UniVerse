import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConsentsService {
  constructor(private prisma: PrismaService) {}
  getMyConsents(userId: string) { return this.prisma.studentConsent.findMany({ where: { userId } }); }
  upsertConsent(userId: string, type: string, granted: boolean) {
    return this.prisma.studentConsent.upsert({
      where: { userId_type: { userId, type: type as any } },
      create: { userId, type: type as any, granted, grantedAt: granted ? new Date() : null },
      update: { granted, grantedAt: granted ? new Date() : null, revokedAt: !granted ? new Date() : null },
    });
  }
}
