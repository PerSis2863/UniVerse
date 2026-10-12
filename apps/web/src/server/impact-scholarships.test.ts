import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import {
  computeLedgerHash,
  verifyLedgerIntegrity,
  mintImpactCredits,
  createSponsorPool,
  claimScholarship,
  reviewScholarshipClaim,
  verifyScholarshipByQr,
} from './impact-scholarships';

vi.mock('@/lib/db', () => ({
  default: {
    impactCredit: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    impactSponsorPool: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    impactScholarshipClaim: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('./analytics-warehouse', () => ({
  recordXApiStatement: vi.fn().mockResolvedValue({ id: 'xapi_1' }),
}));

describe('Impact-to-Scholarship Exchange (Stage 5 · D4)', () => {
  const mockStudent: SessionUser = {
    id: 'u_student_1',
    role: 'STUDENT',
    email: 'student@example.edu',
    name: 'Alice Scholar',
  };

  const mockAdmin: SessionUser = {
    id: 'u_admin_1',
    role: 'ADMIN',
    email: 'admin@example.edu',
    name: 'Dean Roberts',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Cryptographic Hash-Chain Ledger', () => {
    it('verifies valid hash-chain sequence from genesis', () => {
      const now = new Date('2026-10-10T10:00:00Z');
      const h1 = computeLedgerHash('u1', 'VOLUNTEER_HOURS', 20, 20, 'GENESIS', now.toISOString());
      const now2 = new Date('2026-10-10T12:00:00Z');
      const h2 = computeLedgerHash('u1', 'CREDENTIAL_ISSUED', 30, 50, h1, now2.toISOString());

      const entries = [
        {
          userId: 'u1',
          actionType: 'VOLUNTEER_HOURS',
          credits: 20,
          balanceAfter: 20,
          previousHash: 'GENESIS',
          hash: h1,
          createdAt: now,
        },
        {
          userId: 'u1',
          actionType: 'CREDENTIAL_ISSUED',
          credits: 30,
          balanceAfter: 50,
          previousHash: h1,
          hash: h2,
          createdAt: now2,
        },
      ];

      expect(verifyLedgerIntegrity(entries)).toBe(true);
    });

    it('detects tampering when an intermediate balance is modified', () => {
      const now = new Date('2026-10-10T10:00:00Z');
      const h1 = computeLedgerHash('u1', 'VOLUNTEER_HOURS', 20, 20, 'GENESIS', now.toISOString());
      const now2 = new Date('2026-10-10T12:00:00Z');
      const h2 = computeLedgerHash('u1', 'CREDENTIAL_ISSUED', 30, 50, h1, now2.toISOString());

      const tamperedEntries = [
        {
          userId: 'u1',
          actionType: 'VOLUNTEER_HOURS',
          credits: 20,
          balanceAfter: 200, // Tampered balance!
          previousHash: 'GENESIS',
          hash: h1,
          createdAt: now,
        },
        {
          userId: 'u1',
          actionType: 'CREDENTIAL_ISSUED',
          credits: 30,
          balanceAfter: 50,
          previousHash: h1,
          hash: h2,
          createdAt: now2,
        },
      ];

      expect(verifyLedgerIntegrity(tamperedEntries)).toBe(false);
    });
  });

  describe('mintImpactCredits', () => {
    it('mints initial credits with GENESIS previousHash', async () => {
      vi.mocked(prisma.impactCredit.findFirst).mockResolvedValue(null as never);
      vi.mocked(prisma.impactCredit.create).mockResolvedValue({
        id: 'c_1',
        userId: 'u_student_1',
        organizationId: null,
        actionType: 'VOLUNTEER_HOURS',
        credits: 25,
        balanceAfter: 25,
        sourceReferenceId: null,
        description: '10 hours volunteering at community food bank',
        previousHash: 'GENESIS',
        hash: 'a'.repeat(64),
        createdAt: new Date(),
      } as never);

      const res = await mintImpactCredits(
        {
          userId: 'u_student_1',
          actionType: 'VOLUNTEER_HOURS',
          credits: 25,
          description: '10 hours volunteering at community food bank',
        },
        mockStudent
      );

      expect(res.balanceAfter).toBe(25);
      expect(res.previousHash).toBe('GENESIS');
      expect(res.hash).toHaveLength(64);
    });

    it('rejects deduction when balance would fall below zero', async () => {
      vi.mocked(prisma.impactCredit.findFirst).mockResolvedValue({
        balanceAfter: 15,
        hash: 'hash_abc',
      } as never);

      await expect(
        mintImpactCredits(
          {
            userId: 'u_student_1',
            actionType: 'REDEEMED_SCHOLARSHIP',
            credits: -50,
            description: 'Attempted redemption',
          },
          mockStudent
        )
      ).rejects.toThrow('Insufficient Impact Credits');
    });
  });

  describe('createSponsorPool', () => {
    it('creates active scholarship pool with valid parameters', async () => {
      vi.mocked(prisma.impactSponsorPool.create).mockResolvedValue({
        id: 'pool_123',
        title: 'TechCorp STEM Scholarship',
        totalAmount: 50000,
        currency: 'USD',
        status: 'ACTIVE',
      } as never);

      const pool = await createSponsorPool(
        {
          organizationId: 'org_1',
          title: 'TechCorp STEM Scholarship',
          sponsorName: 'TechCorp Global',
          sponsorType: 'CORPORATE',
          totalAmount: 50000,
          creditCostPerAward: 50,
          awardAmountPerStudent: 2500,
          minGpa: 3.2,
        },
        mockAdmin
      );

      expect(pool.id).toBe('pool_123');
      expect(pool.status).toBe('ACTIVE');
    });

    it('rejects invalid pool amounts', async () => {
      await expect(
        createSponsorPool(
          {
            organizationId: 'org_1',
            title: 'Invalid',
            sponsorName: 'Sponsor',
            totalAmount: 0,
            creditCostPerAward: 10,
            awardAmountPerStudent: 1000,
          },
          mockAdmin
        )
      ).rejects.toThrow('Total pool amount must be greater than zero');
    });
  });

  describe('claimScholarship', () => {
    const mockPool = {
      id: 'pool_1',
      organizationId: 'org_1',
      title: 'Green Earth Fellowship',
      sponsorName: 'Green Earth Foundation',
      totalAmount: 10000,
      allocatedAmount: 2000,
      awardAmountPerStudent: 1000,
      creditCostPerAward: 40,
      minGpa: 3.0,
      currency: 'USD',
      status: 'ACTIVE',
    };

    it('successfully processes scholarship claim and deducts credits', async () => {
      vi.mocked(prisma.impactSponsorPool.findUnique).mockResolvedValue(mockPool as never);
      vi.mocked(prisma.impactCredit.findFirst).mockResolvedValue({
        balanceAfter: 60,
        hash: 'h_prev',
      } as never);
      vi.mocked(prisma.impactCredit.create).mockResolvedValue({ id: 'c_deduct' } as never);
      vi.mocked(prisma.impactSponsorPool.update).mockResolvedValue({} as never);
      vi.mocked(prisma.impactScholarshipClaim.create).mockResolvedValue({
        id: 'claim_99',
        qrVerificationToken: 'uv_sch_mocktoken',
        status: 'PENDING',
        awardAmount: 1000,
      } as never);

      const claim = await claimScholarship(
        {
          poolId: 'pool_1',
          studentGpa: 3.5,
          academicStanding: 'HONORS',
        },
        mockStudent
      );

      expect(claim.id).toBe('claim_99');
      expect(claim.status).toBe('PENDING');
      expect(prisma.impactCredit.create).toHaveBeenCalled();
      expect(prisma.impactSponsorPool.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { allocatedAmount: { increment: 1000 } },
        })
      );
    });

    it('rejects claim if student GPA does not meet minimum', async () => {
      vi.mocked(prisma.impactSponsorPool.findUnique).mockResolvedValue(mockPool as never);

      await expect(
        claimScholarship(
          {
            poolId: 'pool_1',
            studentGpa: 2.8, // Below 3.0
          },
          mockStudent
        )
      ).rejects.toThrow('Minimum GPA requirement');
    });

    it('rejects claim if student lacks required credits', async () => {
      vi.mocked(prisma.impactSponsorPool.findUnique).mockResolvedValue(mockPool as never);
      vi.mocked(prisma.impactCredit.findFirst).mockResolvedValue({
        balanceAfter: 20, // Below 40 required
        hash: 'h_prev',
      } as never);

      await expect(
        claimScholarship(
          {
            poolId: 'pool_1',
            studentGpa: 3.8,
          },
          mockStudent
        )
      ).rejects.toThrow('Insufficient Impact Credits');
    });
  });

  describe('reviewScholarshipClaim & verifyScholarshipByQr', () => {
    it('approves pending claim', async () => {
      const mockClaim = {
        id: 'claim_1',
        status: 'PENDING',
        poolId: 'pool_1',
        studentId: 'u_student_1',
        creditsRedeemed: 40,
        awardAmount: 1000,
        pool: { organizationId: 'org_1', title: 'Award' },
      };

      vi.mocked(prisma.impactScholarshipClaim.findUnique).mockResolvedValue(mockClaim as never);
      vi.mocked(prisma.impactScholarshipClaim.update).mockResolvedValue({
        id: 'claim_1',
        status: 'APPROVED',
      } as never);

      const res = await reviewScholarshipClaim('claim_1', 'APPROVED', undefined, mockAdmin);
      expect(res.status).toBe('APPROVED');
    });

    it('refunds credits and deallocates funds upon claim rejection', async () => {
      const mockClaim = {
        id: 'claim_1',
        status: 'PENDING',
        poolId: 'pool_1',
        studentId: 'u_student_1',
        creditsRedeemed: 40,
        awardAmount: 1000,
        pool: { organizationId: 'org_1', title: 'Award' },
      };

      vi.mocked(prisma.impactScholarshipClaim.findUnique).mockResolvedValue(mockClaim as never);
      vi.mocked(prisma.impactCredit.findFirst).mockResolvedValue({
        balanceAfter: 10,
        hash: 'h_prev',
      } as never);
      vi.mocked(prisma.impactCredit.create).mockResolvedValue({ id: 'c_refund' } as never);
      vi.mocked(prisma.impactSponsorPool.update).mockResolvedValue({} as never);
      vi.mocked(prisma.impactScholarshipClaim.update).mockResolvedValue({
        id: 'claim_1',
        status: 'REJECTED',
      } as never);

      const res = await reviewScholarshipClaim(
        'claim_1',
        'REJECTED',
        'Prerequisites not verified',
        mockAdmin
      );

      expect(res.status).toBe('REJECTED');
      expect(prisma.impactCredit.create).toHaveBeenCalled();
      expect(prisma.impactSponsorPool.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { allocatedAmount: { decrement: 1000 } },
        })
      );
    });

    it('verifies approved scholarship with QR token', async () => {
      vi.mocked(prisma.impactScholarshipClaim.findUnique).mockResolvedValue({
        id: 'claim_valid',
        status: 'APPROVED',
        awardAmount: 2500,
        currency: 'USD',
        academicStanding: 'HONORS',
        claimSignature: 'sig_proof_hex',
        createdAt: new Date('2026-10-10T12:00:00Z'),
        pool: {
          title: 'NextGen AI Scholar',
          sponsorName: 'DeepMind Initiative',
          sponsorType: 'CORPORATE',
        },
        student: { name: 'Alice Scholar', email: 'alice@example.edu' },
        approvedBy: { name: 'Dean Roberts', role: 'ADMIN' },
      } as never);

      const verification = await verifyScholarshipByQr('uv_sch_valid_token');
      expect(verification.verified).toBe(true);
      expect(verification.recipientName).toBe('Alice Scholar');
      expect(verification.awardTitle).toBe('NextGen AI Scholar');
      expect(verification.sponsorName).toBe('DeepMind Initiative');
    });

    it('returns verified=false for unknown or pending token', async () => {
      vi.mocked(prisma.impactScholarshipClaim.findUnique).mockResolvedValue(null as never);
      const res = await verifyScholarshipByQr('unknown_token');
      expect(res.verified).toBe(false);
    });
  });
});
