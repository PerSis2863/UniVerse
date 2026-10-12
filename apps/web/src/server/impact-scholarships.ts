import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException } from './http';
import { recordXApiStatement } from './analytics-warehouse';

// Stage 5 · D4: Impact-to-Scholarship Exchange
// Converts verified volunteering hours and impact credentials into cryptographic Impact Credits.
// Enables sponsors (corporates, NGOs, alumni) to fund scholarship pools unlocked by students
// through impact credits and academic standing. Every award is auditable via public QR verification.

export interface MintCreditsInput {
  userId: string;
  organizationId?: string;
  actionType: 'VOLUNTEER_HOURS' | 'CREDENTIAL_ISSUED' | 'PROJECT_MILESTONE' | 'REDEEMED_SCHOLARSHIP' | 'SCHOLARSHIP_REFUND' | 'COMMUNITY_SERVICE';
  credits: number;
  description: string;
  sourceReferenceId?: string;
}

export interface CreatePoolInput {
  organizationId: string;
  title: string;
  sponsorName: string;
  sponsorType?: 'CORPORATE' | 'NGO' | 'ALUMNI' | 'FOUNDATION';
  description?: string;
  totalAmount: number;
  currency?: string;
  creditCostPerAward: number;
  awardAmountPerStudent: number;
  minGpa?: number;
}

export interface ClaimScholarshipInput {
  poolId: string;
  studentGpa: number;
  academicStanding?: 'GOOD_STANDING' | 'HONORS' | 'DEANS_LIST';
}

/** Computes tamper-proof SHA-256 hash for an Impact Credit ledger entry. */
export function computeLedgerHash(
  userId: string,
  actionType: string,
  credits: number,
  balanceAfter: number,
  previousHash: string,
  timestampStr: string
): string {
  const payload = `${userId}:${actionType}:${credits.toFixed(2)}:${balanceAfter.toFixed(2)}:${previousHash}:${timestampStr}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/** Validates that an entire sequence of ledger entries maintains strict hash-chain integrity. */
export function verifyLedgerIntegrity(
  entries: Array<{
    userId: string;
    actionType: string;
    credits: number;
    balanceAfter: number;
    previousHash: string;
    hash: string;
    createdAt: Date | string;
  }>
): boolean {
  for (let i = 0; i < entries.length; i++) {
    const current = entries[i];
    const prev = entries[i - 1];

    if (i === 0) {
      if (current.previousHash !== 'GENESIS') return false;
    } else {
      if (current.previousHash !== prev.hash) return false;
    }

    const ts = typeof current.createdAt === 'string' ? current.createdAt : current.createdAt.toISOString();
    const expectedHash = computeLedgerHash(
      current.userId,
      current.actionType,
      current.credits,
      current.balanceAfter,
      current.previousHash,
      ts
    );

    if (current.hash !== expectedHash) return false;
  }
  return true;
}

/** Calculates current Impact Credit balance for a user. */
export async function getImpactCreditBalance(userId: string): Promise<number> {
  const latest = await prisma.impactCredit.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfter: true },
  });
  return latest?.balanceAfter ?? 0;
}

/** Appends a new credit transaction to the cryptographic ledger. */
export async function mintImpactCredits(input: MintCreditsInput, actor: SessionUser) {
  if (input.credits === 0) {
    throw new BadRequestException('Credits amount cannot be zero');
  }

  const latest = await prisma.impactCredit.findFirst({
    where: { userId: input.userId },
    orderBy: { createdAt: 'desc' },
  });

  const prevBalance = latest?.balanceAfter ?? 0;
  const newBalance = prevBalance + input.credits;

  if (newBalance < 0) {
    throw new BadRequestException(`Insufficient Impact Credits. Balance is ${prevBalance}, attempted deduction ${Math.abs(input.credits)}`);
  }

  const previousHash = latest?.hash ?? 'GENESIS';
  const now = new Date();
  const timestampStr = now.toISOString();

  const hash = computeLedgerHash(
    input.userId,
    input.actionType,
    input.credits,
    newBalance,
    previousHash,
    timestampStr
  );

  const created = await prisma.impactCredit.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      actionType: input.actionType,
      credits: input.credits,
      balanceAfter: newBalance,
      sourceReferenceId: input.sourceReferenceId,
      description: input.description,
      previousHash,
      hash,
      createdAt: now,
    },
  });

  // Telemetry event
  try {
    await recordXApiStatement({
      actorId: actor.id,
      actorType: 'USER',
      verb: input.credits > 0 ? 'earned' : 'redeemed',
      objectType: 'impact_credits',
      objectId: created.id,
      objectName: input.description,
      resultScore: input.credits,
      organizationId: input.organizationId,
    });
  } catch {
    // Non-blocking telemetry
  }

  return created;
}

/** Creates a sponsor-funded scholarship pool. */
export async function createSponsorPool(input: CreatePoolInput, user: SessionUser) {
  if (input.totalAmount <= 0) {
    throw new BadRequestException('Total pool amount must be greater than zero');
  }
  if (input.awardAmountPerStudent <= 0 || input.awardAmountPerStudent > input.totalAmount) {
    throw new BadRequestException('Invalid award amount per student');
  }
  if (input.creditCostPerAward <= 0) {
    throw new BadRequestException('Credit cost per award must be greater than zero');
  }

  return prisma.impactSponsorPool.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      sponsorName: input.sponsorName,
      sponsorType: input.sponsorType ?? 'CORPORATE',
      description: input.description,
      totalAmount: input.totalAmount,
      allocatedAmount: 0,
      currency: input.currency ?? 'USD',
      creditCostPerAward: input.creditCostPerAward,
      awardAmountPerStudent: input.awardAmountPerStudent,
      minGpa: input.minGpa ?? 3.0,
      status: 'ACTIVE',
      createdById: user.id,
    },
  });
}

/** Lists all available sponsor scholarship pools with user eligibility status. */
export async function listSponsorPools(user: SessionUser) {
  const pools = await prisma.impactSponsorPool.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { claims: true } },
    },
  });

  const studentBalance = await getImpactCreditBalance(user.id);

  return pools.map((pool) => {
    const remainingAmount = pool.totalAmount - pool.allocatedAmount;
    const remainingAwards = Math.floor(remainingAmount / pool.awardAmountPerStudent);
    const hasEnoughCredits = studentBalance >= pool.creditCostPerAward;

    return {
      ...pool,
      remainingAmount,
      remainingAwards,
      studentBalance,
      isEligible: hasEnoughCredits && remainingAwards > 0 && pool.status === 'ACTIVE',
    };
  });
}

/** Claims an impact scholarship using earned credits and academic standing. */
export async function claimScholarship(input: ClaimScholarshipInput, user: SessionUser) {
  const pool = await prisma.impactSponsorPool.findUnique({
    where: { id: input.poolId },
  });

  if (!pool) {
    throw new NotFoundException('Scholarship pool not found');
  }
  if (pool.status !== 'ACTIVE') {
    throw new BadRequestException('Scholarship pool is currently not accepting claims');
  }

  const remainingAmount = pool.totalAmount - pool.allocatedAmount;
  if (remainingAmount < pool.awardAmountPerStudent) {
    throw new BadRequestException('Scholarship pool has insufficient remaining funds');
  }

  if (input.studentGpa < pool.minGpa) {
    throw new BadRequestException(`Minimum GPA requirement of ${pool.minGpa.toFixed(2)} not met (Current GPA: ${input.studentGpa.toFixed(2)})`);
  }

  const currentBalance = await getImpactCreditBalance(user.id);
  if (currentBalance < pool.creditCostPerAward) {
    throw new BadRequestException(`Insufficient Impact Credits. Required: ${pool.creditCostPerAward}, Available: ${currentBalance}`);
  }

  // Generate unique verification token and cryptographic claim signature
  const qrVerificationToken = `uv_sch_${crypto.randomBytes(16).toString('hex')}`;
  const claimSignature = crypto
    .createHmac('sha256', 'scholarship_signing_secret')
    .update(`${user.id}:${pool.id}:${pool.awardAmountPerStudent}:${qrVerificationToken}`)
    .digest('hex');

  // 1. Deduct credits via append-only ledger
  await mintImpactCredits(
    {
      userId: user.id,
      organizationId: pool.organizationId,
      actionType: 'REDEEMED_SCHOLARSHIP',
      credits: -pool.creditCostPerAward,
      description: `Redeemed ${pool.creditCostPerAward} credits for ${pool.title} scholarship award`,
      sourceReferenceId: pool.id,
    },
    user
  );

  // 2. Increment pool allocation
  await prisma.impactSponsorPool.update({
    where: { id: pool.id },
    data: { allocatedAmount: { increment: pool.awardAmountPerStudent } },
  });

  // 3. Create claim record
  const claim = await prisma.impactScholarshipClaim.create({
    data: {
      poolId: pool.id,
      studentId: user.id,
      creditsRedeemed: pool.creditCostPerAward,
      awardAmount: pool.awardAmountPerStudent,
      currency: pool.currency,
      studentGpa: input.studentGpa,
      academicStanding: input.academicStanding ?? 'GOOD_STANDING',
      status: 'PENDING',
      qrVerificationToken,
      claimSignature,
    },
    include: {
      pool: {
        select: { title: true, sponsorName: true },
      },
    },
  });

  return claim;
}

/** Reviews a pending scholarship claim (School Administrator action). */
export async function reviewScholarshipClaim(
  claimId: string,
  decision: 'APPROVED' | 'REJECTED',
  rejectionReason: string | undefined,
  adminUser: SessionUser
) {
  const claim = await prisma.impactScholarshipClaim.findUnique({
    where: { id: claimId },
    include: { pool: true },
  });

  if (!claim) {
    throw new NotFoundException('Scholarship claim not found');
  }
  if (claim.status !== 'PENDING') {
    throw new BadRequestException(`Cannot review claim that is already ${claim.status}`);
  }

  if (decision === 'APPROVED') {
    return prisma.impactScholarshipClaim.update({
      where: { id: claimId },
      data: {
        status: 'APPROVED',
        approvedById: adminUser.id,
        disbursedAt: new Date(),
      },
      include: { pool: true, student: { select: { id: true, name: true, email: true } } },
    });
  }

  // If rejected: refund credits back to student ledger and release allocated pool funds!
  await mintImpactCredits(
    {
      userId: claim.studentId,
      organizationId: claim.pool.organizationId,
      actionType: 'SCHOLARSHIP_REFUND',
      credits: claim.creditsRedeemed,
      description: `Refund for rejected scholarship claim: ${claim.pool.title}`,
      sourceReferenceId: claim.id,
    },
    adminUser
  );

  await prisma.impactSponsorPool.update({
    where: { id: claim.poolId },
    data: { allocatedAmount: { decrement: claim.awardAmount } },
  });

  return prisma.impactScholarshipClaim.update({
    where: { id: claimId },
    data: {
      status: 'REJECTED',
      approvedById: adminUser.id,
      rejectionReason: rejectionReason ?? 'Application requirements not met upon institutional review.',
    },
    include: { pool: true },
  });
}

/** Public QR Verification Endpoint. */
export async function verifyScholarshipByQr(token: string) {
  const claim = await prisma.impactScholarshipClaim.findUnique({
    where: { qrVerificationToken: token },
    include: {
      pool: {
        select: { title: true, sponsorName: true, sponsorType: true, organizationId: true },
      },
      student: {
        select: { name: true, email: true },
      },
      approvedBy: {
        select: { name: true, role: true },
      },
    },
  });

  if (!claim) {
    return {
      verified: false,
      error: 'Invalid or unrecognized scholarship verification token.',
    };
  }

  if (claim.status !== 'APPROVED') {
    return {
      verified: false,
      status: claim.status,
      error: `This scholarship claim is currently ${claim.status}.`,
    };
  }

  return {
    verified: true,
    claimId: claim.id,
    awardTitle: claim.pool.title,
    sponsorName: claim.pool.sponsorName,
    sponsorType: claim.pool.sponsorType,
    recipientName: claim.student.name,
    awardAmount: claim.awardAmount,
    currency: claim.currency,
    academicStanding: claim.academicStanding,
    issuedAt: claim.createdAt.toISOString(),
    approvedBy: claim.approvedBy?.name ?? 'Institutional Administrator',
    signatureProof: claim.claimSignature,
    verificationUrl: `/verify/scholarship/${token}`,
  };
}

/** Retrieves student's full audit ledger and verifies mathematical hash integrity. */
export async function getStudentImpactLedger(userId: string) {
  const entries = await prisma.impactCredit.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });

  const isChainValid = verifyLedgerIntegrity(entries);
  const currentBalance = entries[entries.length - 1]?.balanceAfter ?? 0;

  return {
    userId,
    currentBalance,
    totalTransactions: entries.length,
    isChainValid,
    ledger: entries,
  };
}
