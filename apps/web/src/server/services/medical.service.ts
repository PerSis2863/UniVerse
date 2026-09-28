
import { pick } from '../pick';

const FIELDS = ['doctorName', 'doctorPhone', 'bloodType', 'emergencyContact', 'emergencyPhone'] as const;
import prisma from '@/lib/db';

export class MedicalService {
  getMyRecord(userId: string) { return prisma.medicalRecord.findUnique({ where: { userId } }); }
  upsert(userId: string, data: any) { const d = pick(data, FIELDS); return prisma.medicalRecord.upsert({ where: { userId }, create: { ...d, userId }, update: d }); }
}
