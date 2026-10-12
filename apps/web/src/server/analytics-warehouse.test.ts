import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import {
  hashSyntheticIdentifier,
  recordXApiStatement,
  generateWarehouseExport,
  getComparativeTermAnalytics,
  submitResearchDataRequest,
  reviewResearchDataRequest,
} from './analytics-warehouse';

vi.mock('@/lib/db', () => ({
  default: {
    xApiStatement: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    analyticsExport: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    researchDataRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('Learning Analytics Warehouse & xAPI (Stage 5 · C8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashSyntheticIdentifier', () => {
    it('generates consistent synthetic identifier without revealing user ID', () => {
      const syn1 = hashSyntheticIdentifier('usr_student_123');
      const syn2 = hashSyntheticIdentifier('usr_student_123');
      const syn3 = hashSyntheticIdentifier('usr_student_456');

      expect(syn1).toMatch(/^syn_usr_[a-f0-9]{12}$/);
      expect(syn1).toBe(syn2);
      expect(syn1).not.toBe(syn3);
    });
  });

  describe('recordXApiStatement', () => {
    it('validates required fields', async () => {
      await expect(
        recordXApiStatement({
          actorId: '',
          verb: 'experienced',
          objectType: 'course',
          objectId: 'c1',
        })
      ).rejects.toThrow('Actor ID is required.');

      await expect(
        recordXApiStatement({
          actorId: 'u1',
          verb: '',
          objectType: 'course',
          objectId: 'c1',
        })
      ).rejects.toThrow('Verb is required.');
    });

    it('records valid statement with normalized lowercase verb and duration', async () => {
      vi.mocked(prisma.xApiStatement.create).mockResolvedValue({
        id: 'stmt_123',
        actorId: 'usr_1',
        verb: 'completed',
        objectType: 'quiz',
        objectId: 'quiz_42',
      } as never);

      const res = await recordXApiStatement({
        actorId: 'usr_1',
        verb: 'COMPLETED',
        objectType: 'QUIZ',
        objectId: 'quiz_42',
        resultScore: 95.5,
        durationSeconds: 120,
      });

      expect(prisma.xApiStatement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'usr_1',
          verb: 'completed',
          objectType: 'quiz',
          objectId: 'quiz_42',
          resultScore: 95.5,
          durationSeconds: 120,
        }),
      });
      expect(res.id).toBe('stmt_123');
    });
  });

  describe('generateWarehouseExport', () => {
    it('generates anonymized CSV export with SHA-256 hash', async () => {
      const mockStatements = [
        {
          id: 'stmt_1',
          actorId: 'usr_alice',
          verb: 'completed',
          objectType: 'module_item',
          objectId: 'mod_1',
          objectName: 'Intro Page',
          resultScore: 100,
          resultSuccess: true,
          resultCompletion: true,
          durationSeconds: 60,
          contextCourseId: 'course_101',
          timestamp: new Date('2026-10-01T10:00:00.000Z'),
        },
      ];

      vi.mocked(prisma.xApiStatement.findMany).mockResolvedValue(mockStatements as never);
      vi.mocked(prisma.analyticsExport.create).mockResolvedValue({
        id: 'exp_1',
        organizationId: 'org_1',
        generatedById: 'admin_1',
        periodStart: new Date('2026-10-01'),
        periodEnd: new Date('2026-10-12'),
        format: 'CSV',
        anonymized: true,
        status: 'GENERATED',
        recordCount: 1,
        fileSizeBytes: 200,
        sha256Hash: 'dummyhash',
        createdAt: new Date(),
      } as never);

      const res = await generateWarehouseExport({
        organizationId: 'org_1',
        generatedById: 'admin_1',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-12',
        anonymized: true,
      });

      expect(res.recordCount).toBe(1);
      expect(res.fileContent).toContain('syn_usr_');
      expect(res.fileContent).not.toContain('usr_alice');
      expect(res.sha256Hash).toBeDefined();
      expect(prisma.analyticsExport.create).toHaveBeenCalled();
    });
  });

  describe('getComparativeTermAnalytics', () => {
    it('returns term comparison cohorts and verb distributions', async () => {
      vi.mocked(prisma.xApiStatement.count).mockResolvedValue(4200);

      const res = await getComparativeTermAnalytics('org_1');
      expect(res.organizationId).toBe('org_1');
      expect(res.totalWarehouseStatements).toBe(4200);
      expect(res.terms.length).toBeGreaterThan(0);
      expect(res.terms[0].averageGpa).toBeGreaterThan(0);
      expect(res.verbDistribution.completed).toBeDefined();
    });
  });

  describe('submitResearchDataRequest & reviewResearchDataRequest', () => {
    it('validates research request submission', async () => {
      await expect(
        submitResearchDataRequest({
          organizationId: 'org_1',
          requestedById: 'usr_prof',
          title: '',
          institution: 'MIT',
          purpose: 'AI learning outcomes research',
        })
      ).rejects.toThrow('Research title is required.');
    });

    it('approves research request and issues scoped token with expiry', async () => {
      vi.mocked(prisma.researchDataRequest.findUnique).mockResolvedValue({
        id: 'req_1',
        organizationId: 'org_1',
        status: 'PENDING',
      } as never);

      vi.mocked(prisma.researchDataRequest.update).mockResolvedValue({
        id: 'req_1',
        organizationId: 'org_1',
        status: 'APPROVED',
        accessToken: 'uv_research_dummytoken123456789',
        expiresAt: new Date(Date.now() + 60 * 86400 * 1000),
      } as never);

      const res = await reviewResearchDataRequest({
        requestId: 'req_1',
        reviewerId: 'admin_1',
        status: 'APPROVED',
        validityDays: 60,
      });

      expect(res.status).toBe('APPROVED');
      expect(res.accessToken).toMatch(/^uv_research_/);
      expect(res.expiresAt).toBeDefined();
    });

    it('handles research request rejection with custom reason', async () => {
      vi.mocked(prisma.researchDataRequest.findUnique).mockResolvedValue({
        id: 'req_2',
        organizationId: 'org_1',
        status: 'PENDING',
      } as never);

      vi.mocked(prisma.researchDataRequest.update).mockResolvedValue({
        id: 'req_2',
        organizationId: 'org_1',
        status: 'REJECTED',
        rejectionReason: 'Scope too broad',
      } as never);

      const res = await reviewResearchDataRequest({
        requestId: 'req_2',
        reviewerId: 'admin_1',
        status: 'REJECTED',
        rejectionReason: 'Scope too broad',
      });

      expect(res.status).toBe('REJECTED');
      expect(res.rejectionReason).toBe('Scope too broad');
      expect(res.accessToken).toBeUndefined();
    });
  });
});
