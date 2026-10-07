
import type { Prisma } from '@prisma/client';
import { pick } from '../pick';
import { strings, type Body } from '../body';

const FIELDS = ['doctorName', 'doctorPhone', 'bloodType', 'emergencyContact', 'emergencyPhone'] as const;
import prisma from '@/lib/db';

export class MedicalService {
  getMyRecord(userId: string) { return prisma.medicalRecord.findUnique({ where: { userId } }); }
  upsert(userId: string, data: Body) {
    const fields: Omit<Prisma.MedicalRecordUncheckedCreateInput, 'userId'> = pick<Prisma.MedicalRecordUncheckedCreateInput>(data, FIELDS);
    // Allergies, conditions and medications: lists of short texts.
    for (const k of ['allergies', 'conditions', 'medications'] as const) {
      if (data[k] !== undefined) fields[k] = strings(data[k]).map((x) => x.trim().slice(0, 100)).filter(Boolean).slice(0, 30);
    }
    return prisma.medicalRecord.upsert({ where: { userId }, create: { ...fields, userId }, update: fields });
  }
}
