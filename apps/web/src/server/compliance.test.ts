import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanRecordType,
  cleanGrievanceType,
  cleanRetentionDays,
  logEducationalRecordAccess,
  getEducationalRecordAccessLogs,
  submitPrivacyGrievance,
  resolvePrivacyGrievance,
} from './compliance';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';

vi.mock('@/lib/db', () => ({
  default: {
    educationalRecordLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    privacyGrievance: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    guardianLink: {
      findFirst: vi.fn(),
    },
  },
}));
// Schools (school-scope.ts): an admin's school check, stubbed per test.
vi.mock('./school-scope', () => ({
  assertInSchool: vi.fn(async () => undefined),
  schoolsOf: vi.fn(async () => ['org-a']),
  usersIn: vi.fn(() => ({ organizationId: { in: ['org-a'] } })),
}));
import { assertInSchool } from './school-scope';

describe('compliance helpers and services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cleanRecordType', () => {
    it('accepts valid record types', () => {
      expect(cleanRecordType('GRADES')).toBe('GRADES');
      expect(cleanRecordType('transcript')).toBe('TRANSCRIPT');
      expect(cleanRecordType('REPORT_CARD')).toBe('REPORT_CARD');
    });

    it('rejects invalid record types', () => {
      expect(() => cleanRecordType('PRIVATE_DIARY')).toThrow('Record type must be one of');
      expect(() => cleanRecordType('')).toThrow('Record type must be one of');
    });
  });

  describe('cleanGrievanceType', () => {
    it('accepts valid grievance types', () => {
      expect(cleanGrievanceType('CORRECTION')).toBe('CORRECTION');
      expect(cleanGrievanceType('erasure')).toBe('ERASURE');
      expect(cleanGrievanceType('NOMINATION')).toBe('NOMINATION');
    });

    it('rejects invalid grievance types', () => {
      expect(() => cleanGrievanceType('INVALID')).toThrow('Request type must be one of');
    });
  });

  describe('cleanRetentionDays', () => {
    it('validates retention numbers', () => {
      expect(cleanRetentionDays(730)).toBe(730);
      expect(cleanRetentionDays('365')).toBe(365);
      expect(cleanRetentionDays(0)).toBe(0);
    });

    it('rejects invalid numbers', () => {
      expect(() => cleanRetentionDays(-5)).toThrow('Data retention must be between 0');
      expect(() => cleanRetentionDays(4000)).toThrow('Data retention must be between 0');
      expect(() => cleanRetentionDays('invalid')).toThrow('Data retention must be between 0');
    });
  });

  describe('logEducationalRecordAccess', () => {
    it('creates educational record log', async () => {
      vi.mocked(prisma.educationalRecordLog.create).mockResolvedValueOnce({
        id: 'log-1',
        studentId: 'student-1',
        actorId: 'admin-1',
        recordType: 'GRADES',
        reason: 'Term audit',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla',
        accessedAt: new Date(),
      });

      const res = await logEducationalRecordAccess({
        studentId: 'student-1',
        actorId: 'admin-1',
        recordType: 'GRADES',
        reason: 'Term audit',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla',
      });

      expect(res.id).toBe('log-1');
      expect(prisma.educationalRecordLog.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getEducationalRecordAccessLogs', () => {
    const studentUser: SessionUser = { id: 'student-1', role: 'STUDENT', email: 's@school.edu', name: 'Student' } as unknown as SessionUser;
    const adminUser: SessionUser = { id: 'admin-1', role: 'ADMIN', email: 'a@school.edu', name: 'Admin' } as unknown as SessionUser;
    const strangerUser: SessionUser = { id: 'stranger-1', role: 'STUDENT', email: 'stranger@school.edu', name: 'Other' } as unknown as SessionUser;
    const guardianUser: SessionUser = { id: 'guardian-1', role: 'GUARDIAN', email: 'g@parent.com', name: 'Parent' } as unknown as SessionUser;

    it('allows student to view their own access logs', async () => {
      vi.mocked(prisma.educationalRecordLog.findMany).mockResolvedValueOnce([]);
      const res = await getEducationalRecordAccessLogs('student-1', studentUser);
      expect(res).toEqual([]);
    });

    it('allows admin to view student access logs', async () => {
      vi.mocked(prisma.educationalRecordLog.findMany).mockResolvedValueOnce([]);
      const res = await getEducationalRecordAccessLogs('student-1', adminUser);
      expect(res).toEqual([]);
    });

    it('allows linked guardian to view child access logs', async () => {
      vi.mocked(prisma.guardianLink.findFirst).mockResolvedValueOnce({ id: 'link-1' } as unknown as { id: string } as never);
      vi.mocked(prisma.educationalRecordLog.findMany).mockResolvedValueOnce([]);
      const res = await getEducationalRecordAccessLogs('student-1', guardianUser);
      expect(res).toEqual([]);
    });

    it('refuses an admin of another school (not found)', async () => {
      vi.mocked(assertInSchool).mockRejectedValueOnce(Object.assign(new Error('User not found'), { status: 404 }));
      await expect(getEducationalRecordAccessLogs('student-1', adminUser)).rejects.toThrow('User not found');
      expect(prisma.educationalRecordLog.findMany).not.toHaveBeenCalled();
    });

    it('forbids unrelated stranger from viewing student access logs', async () => {
      await expect(getEducationalRecordAccessLogs('student-1', strangerUser)).rejects.toThrow(
        'You do not have permission to view this student’s educational record access log'
      );
    });
  });

  describe('submitPrivacyGrievance', () => {
    it('creates grievance successfully', async () => {
      vi.mocked(prisma.privacyGrievance.create).mockResolvedValueOnce({
        id: 'grv-1',
        userId: 'u-1',
        requestType: 'ERASURE',
        status: 'OPEN',
        details: 'Please erase my historical chat logs',
        nomineeName: null,
        nomineeEmail: null,
        resolutionNote: null,
        createdAt: new Date(),
        resolvedAt: null,
      });

      const res = await submitPrivacyGrievance({
        userId: 'u-1',
        requestType: 'ERASURE',
        details: 'Please erase my historical chat logs',
      });

      expect(res.id).toBe('grv-1');
    });

    it('requires nominee name and email for NOMINATION', async () => {
      await expect(
        submitPrivacyGrievance({
          userId: 'u-1',
          requestType: 'NOMINATION',
          details: 'Nominate my sister',
          nomineeName: '',
          nomineeEmail: '',
        })
      ).rejects.toThrow('Nominee name and email are required');
    });

    it('rejects overly short details', async () => {
      await expect(
        submitPrivacyGrievance({
          userId: 'u-1',
          requestType: 'GRIEVANCE',
          details: 'help',
        })
      ).rejects.toThrow('Request details must be between 5 and 2000 characters');
    });
  });

  describe('resolvePrivacyGrievance', () => {
    const admin = { id: 'admin-1', role: 'ADMIN', email: 'a@school.edu', name: 'Admin', organizationId: 'org-a' } as SessionUser;

    it('refuses a request from another school (not found)', async () => {
      vi.mocked(prisma.privacyGrievance.findFirst).mockResolvedValueOnce(null);
      await expect(resolvePrivacyGrievance({ actor: admin, grievanceId: 'grv-9', status: 'RESOLVED' })).rejects.toThrow('Request not found.');
      expect(vi.mocked(prisma.privacyGrievance.findFirst).mock.calls[0][0]).toMatchObject({ where: { id: 'grv-9', user: { organizationId: { in: ['org-a'] } } } });
      expect(prisma.privacyGrievance.update).not.toHaveBeenCalled();
    });

    it('updates status and records resolvedAt', async () => {
      vi.mocked(prisma.privacyGrievance.findFirst).mockResolvedValueOnce({ id: 'grv-1' } as never);
      vi.mocked(prisma.privacyGrievance.update).mockResolvedValueOnce({
        id: 'grv-1',
        status: 'RESOLVED',
      } as never);

      await resolvePrivacyGrievance({
        actor: admin,
        grievanceId: 'grv-1',
        status: 'RESOLVED',
        resolutionNote: 'Data purged in accordance with DPDP Section 12',
      });

      expect(prisma.privacyGrievance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'grv-1' },
          data: expect.objectContaining({
            status: 'RESOLVED',
            resolutionNote: 'Data purged in accordance with DPDP Section 12',
          }),
        })
      );
    });
  });
});
