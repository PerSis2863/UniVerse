import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MedicalService {
  constructor(private prisma: PrismaService) {}
  getMyRecord(userId: string) { return this.prisma.medicalRecord.findUnique({ where: { userId } }); }
  upsert(userId: string, data: any) { return this.prisma.medicalRecord.upsert({ where: { userId }, create: { userId, ...data }, update: data }); }
}
