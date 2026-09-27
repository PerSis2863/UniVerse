import { Injectable } from '@nestjs/common';
import { pick } from '../common/pick';

const FIELDS = ['doctorName', 'doctorPhone', 'bloodType', 'emergencyContact', 'emergencyPhone'] as const;
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MedicalService {
  constructor(private prisma: PrismaService) {}
  getMyRecord(userId: string) { return this.prisma.medicalRecord.findUnique({ where: { userId } }); }
  upsert(userId: string, data: any) { const d = pick(data, FIELDS); return this.prisma.medicalRecord.upsert({ where: { userId }, create: { ...d, userId }, update: d }); }
}
