import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import puppeteer from 'puppeteer';
import { getCertificateHtml } from './certificate-template';
import { createHash } from 'crypto';

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

function buildCredentialPayload(cert: any, userName: string): object {
  return {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'ImpactCredential'],
    id: `https://universeimpact.vercel.app/verify/${cert.id}`,
    issuer: 'did:universe:impact-platform',
    issuanceDate: cert.issuedAt,
    credentialSubject: {
      id: `did:universe:student:${cert.userId}`,
      name: userName,
      achievement: cert.title,
      project: cert.projectName,
      organization: cert.organization,
      hoursCompleted: cert.hoursCompleted,
      peopleImpacted: cert.peopleImpacted,
    },
  };
}

@Injectable()
export class ImpactService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.nGOProjectApplication.upsert({ where: { projectId_studentId: { projectId, studentId } }, create: { projectId, studentId, ...data }, update: data });
  }

  // ── Startups ─────────────────────────────────────────────────────────────
  async getStartups() {
    return this.prisma.startup.findMany({ where: { isActive: true }, include: { foundedBy: { select: { id: true, name: true } }, _count: { select: { applications: true } } } });
  }

  async applyToStartup(startupId: string, userId: string, data: any) {
    return this.prisma.startupApplication.upsert({ where: { startupId_userId: { startupId, userId } }, create: { startupId, userId, ...data }, update: data });
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

  // ── Blockchain Credentials ───────────────────────────────────────────────
  async getMyBlockchainCredentials(userId: string) {
    const certs = await this.prisma.impactCertificate.findMany({
      where: { userId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { issuedAt: 'desc' },
    });
    return certs.map(cert => {
      const payload = buildCredentialPayload(cert, cert.user.name);
      const hash = cert.blockchainHash || generateBlockchainHash(JSON.stringify(payload));
      return { ...cert, blockchainHash: hash, verifyUrl: `https://universeimpact.vercel.app/verify/${cert.id}` };
    });
  }

  async issueBlockchainCredential(userId: string, data: {
    title: string;
    projectName: string;
    organization: string;
    hoursCompleted: number;
    peopleImpacted: number;
    description?: string;
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const certCode = `UNI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    
    // Generate hash from payload
    const tempData = { userId, ...data, certCode, issuedAt: new Date() };
    const blockchainHash = generateBlockchainHash(JSON.stringify(tempData));

    const cert = await this.prisma.impactCertificate.create({
      data: {
        userId,
        certificateCode: certCode,
        title: data.title,
        projectName: data.projectName,
        organization: data.organization,
        hoursCompleted: data.hoursCompleted,
        peopleImpacted: data.peopleImpacted,
        description: data.description,
        blockchainHash,
        status: 'ISSUED',
      },
    });

    // Award XP for earning a credential
    await this.awardPoints(userId, {
      points: 150,
      reason: `Blockchain credential issued: ${data.title}`,
      sourceType: 'CREDENTIAL',
      sourceId: cert.id,
    });

    return { ...cert, blockchainHash, verifyUrl: `https://universeimpact.vercel.app/verify/${cert.id}` };
  }

  async verifyBlockchainCredential(credentialId: string) {
    const cert = await this.prisma.impactCertificate.findUnique({
      where: { id: credentialId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!cert) return null;
    const payload = buildCredentialPayload(cert, cert.user.name);
    const recomputedHash = generateBlockchainHash(JSON.stringify({
      userId: cert.userId,
      title: cert.title,
      projectName: cert.projectName,
      organization: cert.organization,
      hoursCompleted: cert.hoursCompleted,
      peopleImpacted: cert.peopleImpacted,
      description: cert.description,
      certCode: cert.certificateCode,
      issuedAt: cert.issuedAt,
    }));
    const isValid = recomputedHash === cert.blockchainHash;
    return { cert, payload, isValid, blockchainHash: cert.blockchainHash };
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
