
import type { Prisma } from '@prisma/client';
import { pick } from '../pick';
import type { Body } from '../body';

const FIELDS = ['doctorName', 'doctorPhone', 'bloodType', 'emergencyContact', 'emergencyPhone'] as const;
import prisma from '@/lib/db';

export class MedicalService {
  getMyRecord(userId: string) { return prisma.medicalRecord.findUnique({ where: { userId } }); }
  upsert(userId: string, data: Body) { const d = pick<Prisma.MedicalRecordUncheckedUpdateInput & Prisma.MedicalRecordUncheckedCreateInput>(data, FIELDS); return prisma.medicalRecord.upsert({ where: { userId }, create: { ...d, userId }, update: d }); }
}
