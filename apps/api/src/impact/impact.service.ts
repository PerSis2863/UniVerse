import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import puppeteer from 'puppeteer';
import { getCertificateHtml } from './certificate-template';
import { createHash, randomBytes } from 'crypto';
import { CredentialSigner, verifyUrlFor } from './credential-signer';
import { ChainAnchorService } from './chain-anchor.service';
import { IssueCredentialDto, RequestCredentialDto } from './dto/credential.dto';

// ── Impact level thresholds ──────────────────────────────────────────────────
const LEVELS = [
  { level: 1, title: 'Changemaker Seed',  minXP: 0,    color: '#6b7280', emoji: '🌱' },
  { level: 2, title: 'Impact Explorer',   minXP: 100,  color: '#10b981', emoji: '🌿' },
  { level: 3, title: 'Social Innovator',  minXP: 300,  color: '#3b82f6', emoji: '⚡' },
  { level: 4, title: 'SDG Champion',      minXP: 600,  color: '#8b5cf6', emoji: '🏅' },
  { level: 5, title: 'Global Catalyst',   minXP: 1000, color: '#f59e0b', emoji: '🌍' },
  { level: 6, title: 'Visionary Leader',  minXP: 1500, color: '#ef4444', emoji: '🚀' },
  { level: 7, title: 'UniVerse Legend',   minXP: 2500, color: '#f97316', emoji: '🌟' },
];

function getLevelInfo(xp: number) {
  let current = LEVELS[0];
  let next = LEVELS[1];
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].minXP) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || LEVELS[LEVELS.length - 1];
    }
  }
  const progress = next.minXP > current.minXP
    ? Math.round(((xp - current.minXP) / (next.minXP - current.minXP)) * 100)
    : 100;
  return { current, next, progress, xp };
}

// ── Deterministic blockchain-style hash ─────────────────────────────────────
function generateBlockchainHash(data: string): string {
  return '0x' + createHash('sha256').update(data).digest('hex');
}

@Injectable()
export class ImpactService {
  constructor(
    private prisma: PrismaService,
    private chain: ChainAnchorService,
  ) {}

  // ── Leaderboard ──────────────────────────────────────────────────────────
  async getLeaderboard() {
    const points = await this.prisma.impactPoint.groupBy({
      by: ['userId'],
      _sum: { points: true },
      orderBy: { _sum: { points: 'desc' } },
      take: 50,
    });
    const userIds = points.map(p => p.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true, impactXP: true, impactLevel: true },
    });
    return points.map(p => {
      const u = users.find(u => u.id === p.userId);
      const levelInfo = getLevelInfo(u?.impactXP || 0);
      return {
        ...u,
        totalPoints: p._sum.points,
        levelInfo,
      };
    });
  }

  async getMyPoints(userId: string) {
    return this.prisma.impactPoint.findMany({ where: { userId }, orderBy: { awardedAt: 'desc' } });
  }

  async getDashboardStats(userId: string) {
    const points = await this.prisma.impactPoint.findMany({ where: { userId }, orderBy: { awardedAt: 'desc' }, take: 10 });
    const allPoints = await this.prisma.impactPoint.aggregate({ where: { userId }, _sum: { points: true } });
    const totalPoints = allPoints._sum.points || 0;
    
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, impactXP: true, impactLevel: true },
    });

    const ngoApps = await this.prisma.nGOProjectApplication.findMany({ where: { studentId: userId }, include: { project: { include: { ngo: true } } } });
    const completedNGOs = ngoApps.filter(a => a.status === 'ACCEPTED').length;

    const startupApps = await this.prisma.startupApplication.findMany({ where: { userId }, include: { startup: true } });
    const grants = startupApps.filter(a => a.status === 'ACCEPTED').length * 1200;

    const sdgBadges = ngoApps
      .filter(a => a.status === 'ACCEPTED' && a.project.sdgNumber)
      .map(a => {
        const colors = ['from-cyan-500 to-blue-600', 'from-rose-500 to-red-600', 'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600', 'from-purple-500 to-indigo-600'];
        return {
          num: a.project.sdgNumber,
          name: `SDG ${a.project.sdgNumber} Objective`,
          hours: a.project.impactPoints,
          partner: a.project.ngo.name,
          status: 'Completed',
          color: colors[(a.project.sdgNumber || 0) % colors.length],
        };
      });

    const activities = points.map(p => ({
      date: p.awardedAt.toISOString(),
      title: p.reason,
      hours: `${p.points} Points Logged`,
      ngo: p.sourceType,
      hash: generateBlockchainHash(p.id),
    }));

    const levelInfo = getLevelInfo(user?.impactXP || totalPoints);

    return {
      userName: user?.name || 'Student',
      totalPoints,
      verifiedHours: Math.floor(totalPoints / 10),
      completedNGOs,
      grants,
      sdgBadges,
      activities,
      levelInfo,
    };
  }

  async awardPoints(userId: string, data: any) {
    const result = await this.prisma.impactPoint.create({ data: { userId, ...data } });
    // Update XP
    const total = await this.prisma.impactPoint.aggregate({ where: { userId }, _sum: { points: true } });
    const xp = total._sum.points || 0;
    const levelInfo = getLevelInfo(xp);
    await this.prisma.user.update({ where: { id: userId }, data: { impactXP: xp, impactLevel: levelInfo.current.level } });
    return result;
  }

  // ── NGOs & Projects ──────────────────────────────────────────────────────
  async getNGOs(query: any) {
    return this.prisma.nGO.findMany({ where: { ...(query.search && { name: { contains: query.search, mode: 'insensitive' } }) }, include: { _count: { select: { projects: true } } } });
  }

  async getNGOProjects(query: any) {
    return this.prisma.nGOProject.findMany({ where: { isActive: true }, include: { ngo: true, _count: { select: { applications: true } } } });
  }

  async applyToNGOProject(projectId: string, studentId: string, data: any) {
    // Only the student's motivation comes from the request; status is decided by reviewers.
    const motivation = typeof data?.motivation === 'string' ? data.motivation.slice(0, 2000) : undefined;
    return this.prisma.nGOProjectApplication.upsert({
      where: { projectId_studentId: { projectId, studentId } },
      create: { projectId, studentId, motivation },
      update: { motivation },
    });
  }

  // ── Startups ─────────────────────────────────────────────────────────────
  async getStartups() {
    return this.prisma.startup.findMany({ where: { isActive: true }, include: { foundedBy: { select: { id: true, name: true } }, _count: { select: { applications: true } } } });
  }

  async applyToStartup(startupId: string, userId: string, data: any) {
    const role = typeof data?.role === 'string' ? data.role.slice(0, 120) : undefined;
    const motivation = typeof data?.motivation === 'string' ? data.motivation.slice(0, 2000) : undefined;
    return this.prisma.startupApplication.upsert({ where: { startupId_userId: { startupId, userId } }, create: { startupId, userId, role, motivation }, update: { role, motivation } });
  }

  // ── Summits ──────────────────────────────────────────────────────────────
  async getSummits() {
    return this.prisma.summit.findMany({ include: { _count: { select: { registrations: true } } }, orderBy: { startDate: 'asc' } });
  }

  async registerForSummit(summitId: string, userId: string) {
    return this.prisma.summitRegistration.upsert({ where: { summitId_userId: { summitId, userId } }, create: { summitId, userId }, update: {} });
  }

  async getMyRegistrations(userId: string) {
    return this.prisma.summitRegistration.findMany({ where: { userId }, include: { summit: true } });
  }

  // ── Verified Credentials ─────────────────────────────────────────────────
  // Flow: student requests (DRAFT) → admin verifies → credential is signed (ISSUED).
  // Admins can also issue directly, and revoke. Anyone can verify via the public endpoint.

  private toClientCredential(cert: any) {
    const signed = !!cert.signature;
    return {
      id: cert.id,
      certificateCode: cert.certificateCode,
      title: cert.title,
      projectName: cert.projectName,
      organization: cert.organization,
      hoursCompleted: cert.hoursCompleted,
      peopleImpacted: cert.peopleImpacted,
      description: cert.description,
      evidenceUrl: cert.evidenceUrl,
      // PENDING = awaiting verification, ISSUED = signed & valid, REVOKED, REJECTED (never signed)
      status:
        cert.status === 'DRAFT' ? 'PENDING'
        : cert.status === 'REVOKED' ? (signed ? 'REVOKED' : 'REJECTED')
        : signed ? 'ISSUED' : 'UNVERIFIED_LEGACY',
      blockchainHash: signed ? cert.blockchainHash : null,
      signature: cert.signature,
      signingKeyId: cert.signingKeyId,
      verifiedByName: cert.verifiedByName,
      requestedAt: cert.requestedAt,
      issuedAt: signed ? cert.issuedAt : null,
      revokedAt: cert.revokedAt,
      revokedReason: cert.revokedReason,
      verifyUrl: signed ? verifyUrlFor(cert.id) : null,
      blockchain: signed && cert.anchorStatus
        ? {
            status: cert.anchorStatus,
            network: cert.anchorNetwork,
            chainId: cert.anchorChainId,
            txHash: cert.anchorTxHash,
            explorerUrl: this.chain.explorerUrl(cert.anchorTxHash),
            anchoredAt: cert.anchoredAt,
          }
        : null,
    };
  }

  private newCertificateCode() {
    return `UNI-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  /** Signs a credential that has just been marked ISSUED and stores hash + signature. */
  private async signAndStore(certId: string) {
    const cert = await this.prisma.impactCertificate.findUnique({
      where: { id: certId },
      include: { user: { select: { name: true } } },
    });
    if (!cert) throw new NotFoundException('Credential not found');
    const signed = CredentialSigner.sign(cert, cert.user.name);
    return this.prisma.impactCertificate.update({
      where: { id: certId },
      data: {
        blockchainHash: signed.hash,
        signature: signed.signature,
        signatureAlg: signed.alg,
        signingKeyId: signed.keyId,
      },
    });
  }

  async getMyBlockchainCredentials(userId: string) {
    const certs = await this.prisma.impactCertificate.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });
    return certs.map((c) => this.toClientCredential(c));
  }

  async requestCredential(userId: string, dto: RequestCredentialDto) {
    const pending = await this.prisma.impactCertificate.count({ where: { userId, status: 'DRAFT' } });
    if (pending >= 10) {
      throw new BadRequestException('You already have 10 credentials awaiting verification.');
    }
    const cert = await this.prisma.impactCertificate.create({
      data: {
        userId,
        certificateCode: this.newCertificateCode(),
        title: dto.title.trim(),
        projectName: dto.projectName.trim(),
        organization: dto.organization.trim(),
        hoursCompleted: dto.hoursCompleted,
        peopleImpacted: dto.peopleImpacted,
        description: dto.description?.trim() || null,
        evidenceUrl: dto.evidenceUrl?.trim() || null,
        status: 'DRAFT',
      },
    });
    return this.toClientCredential(cert);
  }

  async getPendingCredentialRequests() {
    const certs = await this.prisma.impactCertificate.findMany({
      where: { status: 'DRAFT' },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      orderBy: { requestedAt: 'asc' },
    });
    return certs.map((c) => ({ ...this.toClientCredential(c), student: c.user }));
  }

  private async finalizeIssue(certId: string, holderId: string, title: string) {
    const signed = await this.signAndStore(certId);
    // Write the signed hash to the public blockchain in the background (never blocks issuing).
    void this.chain.anchorCredential(certId);
    await this.awardPoints(holderId, {
      points: 150,
      reason: `Verified credential issued: ${title}`,
      sourceType: 'CREDENTIAL',
      sourceId: certId,
    });
    return this.toClientCredential(signed);
  }

  async approveCredential(certId: string, verifier: { id: string; name: string }) {
    const cert = await this.prisma.impactCertificate.findUnique({ where: { id: certId } });
    if (!cert) throw new NotFoundException('Credential not found');
    if (cert.userId === verifier.id) throw new ForbiddenException('You cannot verify your own credential');
    // Conditional update so two admins approving at once cannot double-issue.
    const { count } = await this.prisma.impactCertificate.updateMany({
      where: { id: certId, status: 'DRAFT' },
      data: {
        status: 'ISSUED',
        issuedAt: new Date(),
        verifiedById: verifier.id,
        verifiedByName: verifier.name,
      },
    });
    if (count === 0) throw new BadRequestException('Only pending credentials can be approved');
    return this.finalizeIssue(certId, cert.userId, cert.title);
  }

  async issueCredentialDirect(verifier: { id: string; name: string }, dto: IssueCredentialDto) {
    if (dto.studentId === verifier.id) throw new ForbiddenException('You cannot issue a credential to yourself');
    const student = await this.prisma.user.findUnique({ where: { id: dto.studentId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student not found');
    const cert = await this.prisma.impactCertificate.create({
      data: {
        userId: dto.studentId,
        certificateCode: this.newCertificateCode(),
        title: dto.title.trim(),
        projectName: dto.projectName.trim(),
        organization: dto.organization.trim(),
        hoursCompleted: dto.hoursCompleted,
        peopleImpacted: dto.peopleImpacted,
        description: dto.description?.trim() || null,
        evidenceUrl: dto.evidenceUrl?.trim() || null,
        status: 'ISSUED',
        issuedAt: new Date(),
        verifiedById: verifier.id,
        verifiedByName: verifier.name,
      },
    });
    return this.finalizeIssue(cert.id, cert.userId, cert.title);
  }

  async rejectCredential(certId: string, reason?: string) {
    const { count } = await this.prisma.impactCertificate.updateMany({
      where: { id: certId, status: 'DRAFT' },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason?.trim() || 'Not approved' },
    });
    if (count === 0) throw new BadRequestException('Only pending credentials can be rejected');
    return this.toClientCredential(await this.prisma.impactCertificate.findUnique({ where: { id: certId } }));
  }

  async revokeCredential(certId: string, reason?: string) {
    const { count } = await this.prisma.impactCertificate.updateMany({
      where: { id: certId, status: 'ISSUED' },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason?.trim() || 'Revoked by administrator' },
    });
    if (count === 0) throw new BadRequestException('Only issued credentials can be revoked');
    return this.toClientCredential(await this.prisma.impactCertificate.findUnique({ where: { id: certId } }));
  }

  /**
   * Credentials created before verification existed were self-issued and never signed.
   * This moves them back to the review queue so an admin can verify (or reject) them.
   */
  async sendLegacyCredentialsToReview() {
    const { count } = await this.prisma.impactCertificate.updateMany({
      where: { status: 'ISSUED', signature: null },
      data: { status: 'DRAFT' },
    });
    return { movedToReview: count };
  }

  /** Public verification. Accepts the credential id or its certificate code. */
  async verifyCredentialPublic(idOrCode: string) {
    const cert = await this.prisma.impactCertificate.findFirst({
      where: { OR: [{ id: idOrCode }, { certificateCode: idOrCode }] },
      include: { user: { select: { name: true, avatar: true } } },
    });
    // Pending, rejected and never-signed credentials are not publicly verifiable.
    if (!cert || !cert.signature) {
      return { result: 'NOT_FOUND' as const };
    }
    const check = CredentialSigner.verify(cert, cert.user.name);
    let result: 'VALID' | 'REVOKED' | 'TAMPERED' | 'UNKNOWN_KEY';
    if (!check.hashMatches) result = 'TAMPERED';
    else if (!check.knownKey) result = 'UNKNOWN_KEY';
    else if (!check.signatureValid) result = 'TAMPERED';
    else if (cert.status === 'REVOKED') result = 'REVOKED';
    else result = 'VALID';

    return {
      result,
      credential: {
        id: cert.id,
        certificateCode: cert.certificateCode,
        holderName: cert.user.name,
        holderAvatar: cert.user.avatar,
        title: cert.title,
        projectName: cert.projectName,
        organization: cert.organization,
        hoursCompleted: cert.hoursCompleted,
        peopleImpacted: cert.peopleImpacted,
        description: cert.description,
        verifiedByName: cert.verifiedByName,
        issuedAt: cert.issuedAt,
        revokedAt: cert.revokedAt,
        revokedReason: cert.status === 'REVOKED' ? cert.revokedReason : null,
      },
      proof: {
        hash: cert.blockchainHash,
        signature: cert.signature,
        alg: cert.signatureAlg,
        keyId: cert.signingKeyId,
        payload: check.payload,
      },
      blockchain: cert.anchorTxHash
        ? {
            status: cert.anchorStatus,
            network: cert.anchorNetwork,
            chainId: cert.anchorChainId,
            txHash: cert.anchorTxHash,
            explorerUrl: this.chain.explorerUrl(cert.anchorTxHash),
            anchoredAt: cert.anchoredAt,
            // Independent live check against the chain (not just our database)
            onChain: await this.chain.verifyOnChain(cert.anchorTxHash, cert.blockchainHash),
          }
        : null,
    };
  }

  getCredentialPublicKey() {
    return { ...CredentialSigner.publicKeyInfo(), blockchain: this.chain.publicInfo };
  }

  /** Admin: (re)anchor issued credentials that are not yet confirmed on-chain. */
  anchorOutstandingCredentials() {
    return this.chain.anchorOutstanding();
  }

  // ── AI Skill-to-Project Matching ─────────────────────────────────────────
  async getAIProjectMatches(userId: string) {
    const skills = await this.prisma.studentSkill.findMany({
      where: { userId },
      select: { name: true, level: true },
    });
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: userId },
      include: { course: true },
    });
    const projects = await this.prisma.nGOProject.findMany({
      where: { isActive: true },
      include: { ngo: true, _count: { select: { applications: true } } },
      take: 50,
    });

    const studentSkillNames = skills.map(s => (s as any).name?.toLowerCase() || '');
    const courseTopics = enrollments.map(e => e.course?.name?.toLowerCase() || '').join(' ');

    // Score each project
    const scored = projects.map(p => {
      let score = 0;
      const projSkills = (p.skillsRequired || []).map(s => s.toLowerCase());
      const projDesc = (p.description + ' ' + p.name).toLowerCase();

      // Skill match
      const skillMatches = projSkills.filter(s => studentSkillNames.some(sk => sk.includes(s) || s.includes(sk)));
      score += skillMatches.length * 30;

      // Course topic match
      const words = courseTopics.split(' ').filter(w => w.length > 3);
      const topicMatches = words.filter(w => projDesc.includes(w));
      score += topicMatches.length * 10;

      // Freshness bonus
      const daysSinceCreated = (Date.now() - new Date(p.createdAt).getTime()) / 86400000;
      if (daysSinceCreated < 30) score += 20;

      // Availability bonus (not too oversubscribed)
      const applicants = p._count.applications;
      if (applicants < 5) score += 15;

      const matchReasons: string[] = [];
      if (skillMatches.length > 0) matchReasons.push(`Matches your ${skillMatches.slice(0, 2).join(', ')} skills`);
      if (topicMatches.length > 0) matchReasons.push('Aligns with your courses');
      if (applicants < 5) matchReasons.push('High acceptance chance');
      if (daysSinceCreated < 30) matchReasons.push('Newly posted');

      return {
        project: p,
        score,
        matchPercentage: Math.min(Math.round((score / 100) * 100), 99),
        matchReasons: matchReasons.length > 0 ? matchReasons : ['Recommended for you'],
        skillMatches: skillMatches.slice(0, 3),
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }));
  }

  // ── Level Info ───────────────────────────────────────────────────────────
  async getMyLevel(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { impactXP: true, impactLevel: true, name: true },
    });
    const xp = user?.impactXP || 0;
    return { ...getLevelInfo(xp), userName: user?.name, levels: LEVELS };
  }

  // ── Certificates (Legacy) ─────────────────────────────────────────────────
  async getCertificates(userId: string) {
    return this.prisma.studentDocument.findMany({ where: { userId, type: 'CERTIFICATE' }, orderBy: { createdAt: 'desc' } });
  }

  async getPendingCertificateRequests() {
    return this.prisma.studentDocument.findMany({ where: { type: 'CERTIFICATE', isVerified: false }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'asc' } });
  }

  async requestCertificate(userId: string, title: string) {
    return this.prisma.studentDocument.create({ data: { userId, type: 'CERTIFICATE', title, isVerified: false, fileUrl: '' } });
  }

  async approveCertificate(id: string) {
    return this.prisma.studentDocument.update({ where: { id }, data: { isVerified: true, issuedAt: new Date() } });
  }

  async generateCertificatePdf(id: string) {
    const doc = await this.prisma.studentDocument.findUnique({ where: { id }, include: { user: true } });
    if (!doc || !doc.isVerified) throw new Error('Certificate not found or not verified');
    const html = getCertificateHtml({
      studentName: doc.user.name || 'Student',
      certificateTitle: doc.title,
      issuedAt: doc.issuedAt ? doc.issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString(),
      id: doc.id,
    });
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdf = await page.pdf({ printBackground: true, width: '1000px', height: '700px', margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    await browser.close();
    return pdf;
  }
}
