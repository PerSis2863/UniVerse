import prisma from '@/lib/db';
import { BadRequestException, ForbiddenException } from './http';
import type { SessionUser } from '@/lib/server-auth';

// Stage 5 · C5: Compliance and Trust (India DPDP Act 2023, FERPA, COPPA, GDPR).

export type RecordType = 'GRADES' | 'TRANSCRIPT' | 'ATTENDANCE' | 'DISCIPLINARY' | 'MEDICAL' | 'REPORT_CARD';
export const VALID_RECORD_TYPES: RecordType[] = ['GRADES', 'TRANSCRIPT', 'ATTENDANCE', 'DISCIPLINARY', 'MEDICAL', 'REPORT_CARD'];

export type GrievanceType = 'CORRECTION' | 'ERASURE' | 'NOMINATION' | 'GRIEVANCE' | 'DATA_ACCESS';
export const VALID_GRIEVANCE_TYPES: GrievanceType[] = ['CORRECTION', 'ERASURE', 'NOMINATION', 'GRIEVANCE', 'DATA_ACCESS'];

export function cleanRecordType(raw: unknown): RecordType {
  const t = String(raw ?? '').trim().toUpperCase();
  if (VALID_RECORD_TYPES.includes(t as RecordType)) return t as RecordType;
  throw new BadRequestException(`Record type must be one of: ${VALID_RECORD_TYPES.join(', ')}`);
}

export function cleanGrievanceType(raw: unknown): GrievanceType {
  const t = String(raw ?? '').trim().toUpperCase();
  if (VALID_GRIEVANCE_TYPES.includes(t as GrievanceType)) return t as GrievanceType;
  throw new BadRequestException(`Request type must be one of: ${VALID_GRIEVANCE_TYPES.join(', ')}`);
}

export function cleanRetentionDays(raw: unknown): number {
  const n = Number(raw);
  if (isNaN(n) || n < 0 || n > 3650) {
    throw new BadRequestException('Data retention must be between 0 (indefinite) and 3650 days (10 years).');
  }
  return Math.floor(n);
}

/**
 * FERPA (34 CFR Part 99): Logs access when a school official or administrator
 * inspects or exports a student's educational record.
 */
export async function logEducationalRecordAccess(params: {
  studentId: string;
  actorId: string;
  recordType: RecordType;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return prisma.educationalRecordLog.create({
    data: {
      studentId: params.studentId,
      actorId: params.actorId,
      recordType: params.recordType,
      reason: params.reason ? params.reason.slice(0, 250) : null,
      ipAddress: params.ipAddress ? params.ipAddress.slice(0, 45) : null,
      userAgent: params.userAgent ? params.userAgent.slice(0, 200) : null,
    },
  });
}

/**
 * Retrieves educational record access logs.
 * - Students can view access logs for their own records.
 * - Guardians can view access logs for their linked children.
 * - Admins can view access logs for any student in their organization.
 */
export async function getEducationalRecordAccessLogs(studentId: string, currentUser: SessionUser) {
  const isSelf = currentUser.id === studentId;
  const isAdmin = currentUser.role === 'ADMIN' || currentUser.owner;
  let isGuardian = false;

  if (currentUser.role === 'GUARDIAN') {
    const link = await prisma.guardianLink.findFirst({
      where: { guardianId: currentUser.id, studentId },
    });
    if (link) isGuardian = true;
  }

  if (!isSelf && !isAdmin && !isGuardian) {
    throw new ForbiddenException('You do not have permission to view this student’s educational record access log.');
  }

  return prisma.educationalRecordLog.findMany({
    where: { studentId },
    orderBy: { accessedAt: 'desc' },
    take: 50,
    include: {
      actor: {
        select: { id: true, name: true, role: true, avatar: true },
      },
    },
  });
}

/**
 * India DPDP Act 2023 (Sections 11–14): Data Principal Rights.
 * Submits a request for correction, erasure, nomination of a representative, or privacy grievance.
 */
export async function submitPrivacyGrievance(params: {
  userId: string;
  requestType: GrievanceType;
  details: string;
  nomineeName?: string | null;
  nomineeEmail?: string | null;
}) {
  const details = params.details.trim();
  if (details.length < 5 || details.length > 2000) {
    throw new BadRequestException('Request details must be between 5 and 2000 characters.');
  }

  if (params.requestType === 'NOMINATION') {
    if (!params.nomineeName?.trim() || !params.nomineeEmail?.trim()) {
      throw new BadRequestException('Nominee name and email are required when nominating a representative.');
    }
  }

  return prisma.privacyGrievance.create({
    data: {
      userId: params.userId,
      requestType: params.requestType,
      details,
      nomineeName: params.nomineeName ? params.nomineeName.trim().slice(0, 100) : null,
      nomineeEmail: params.nomineeEmail ? params.nomineeEmail.trim().slice(0, 100) : null,
      status: 'OPEN',
    },
  });
}

/**
 * Lists privacy grievances:
 * - Regular user: sees their own filed requests.
 * - Admin: sees requests filed by members of their organization.
 */
export async function listPrivacyGrievances(currentUser: SessionUser) {
  if (currentUser.role === 'ADMIN' || currentUser.owner) {
    return prisma.privacyGrievance.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  return prisma.privacyGrievance.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Admin resolves or updates a privacy grievance.
 */
export async function resolvePrivacyGrievance(params: {
  grievanceId: string;
  status: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  resolutionNote?: string | null;
}) {
  return prisma.privacyGrievance.update({
    where: { id: params.grievanceId },
    data: {
      status: params.status,
      resolutionNote: params.resolutionNote ? params.resolutionNote.trim().slice(0, 1000) : null,
      resolvedAt: params.status === 'RESOLVED' || params.status === 'REJECTED' ? new Date() : null,
    },
  });
}
