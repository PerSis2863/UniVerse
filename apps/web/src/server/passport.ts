import { createHash, randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { COMPANY } from '@/lib/company';
import { CredentialSigner, publicAppUrl, verifyUrlFor } from './services/credential-signer';
import { evidenceGroups } from './skill-evidence';

// Skills passport: the public page a student can share, and Open Badges 3.0 (1EdTech) exports of
// their verified impact credentials. The badges are Verifiable Credentials signed with the
// platform's Ed25519 key as a VC-JWT; anyone can check them with the public key at
// /api/passport/jwks, or by pasting them into the passport verifier (/api/passport/verify).

export const issuerUrl = () => `${publicAppUrl()}/api/passport/issuer`;
export const jwksUrl = () => `${publicAppUrl()}/api/passport/jwks`;
export const passportUrl = (slug: string) => `${publicAppUrl()}/passport/${slug}`;

/** The issuer's Open Badges Profile. */
export function issuerProfile() {
  return {
    '@context': ['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'],
    id: issuerUrl(),
    type: ['Profile'],
    name: COMPANY.legalName,
    url: publicAppUrl(),
    email: COMPANY.email.general,
    description: 'UniVerse Impact issues verified credentials for student social-impact work, checked by staff before they are signed.',
    address: { type: ['Address'], streetAddress: 'Rue de la Patouillerie', postalCode: '44700', addressLocality: 'Orvault (Nantes)', addressCountry: 'France' },
  };
}

const newSlug = () => randomBytes(9).toString('base64url'); // 12 characters, unguessable

/** The student's passport settings (created on first use, private until they publish it). */
export async function getOrCreatePassport(userId: string) {
  const found = await prisma.skillPassport.findUnique({ where: { userId } });
  if (found) return found;
  return prisma.skillPassport.upsert({ where: { userId }, update: {}, create: { userId, slug: newSlug() } });
}

export async function resetPassportLink(userId: string) {
  return prisma.skillPassport.update({ where: { userId }, data: { slug: newSlug() } });
}

type Sections = { showSkills: boolean; showCredentials: boolean; showCourses: boolean; showImpact: boolean; showEvidence?: boolean };

/** What the passport shows (only the sections the student turned on). `owner`: the student's own
 *  preview, which also lists evidence they hid from the public page. */
export async function passportContent(userId: string, sections: Sections, owner = false) {
  const [user, skills, credentials, courses, points, evidence] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, avatar: true, createdAt: true, studentProfile: { select: { department: true } } } }),
    sections.showSkills
      ? prisma.studentSkill.findMany({ where: { userId }, orderBy: [{ endorsements: 'desc' }, { name: 'asc' }], take: 40, select: { name: true, category: true, level: true, endorsements: true } })
      : Promise.resolve([]),
    sections.showCredentials || sections.showImpact
      ? prisma.impactCertificate.findMany({
          where: { userId, status: 'ISSUED', revokedAt: null, signature: { not: null } },
          orderBy: { issuedAt: 'desc' },
          select: { id: true, certificateCode: true, title: true, projectName: true, organization: true, hoursCompleted: true, peopleImpacted: true, issuedAt: true, verifiedByName: true },
        })
      : Promise.resolve([]),
    sections.showCourses
      ? prisma.enrollment.findMany({ where: { studentId: userId }, orderBy: { enrolledAt: 'desc' }, take: 30, select: { course: { select: { code: true, name: true, credits: true, department: true } } } })
      : Promise.resolve([]),
    sections.showImpact ? prisma.impactPoint.aggregate({ where: { userId }, _sum: { points: true } }) : Promise.resolve(null),
    sections.showEvidence !== false ? evidenceGroups(userId, owner) : Promise.resolve([]),
  ]);
  if (!user) return null;
  return {
    name: user.name,
    avatar: user.avatar && /^https?:\/\/|^\/api\/files\//.test(user.avatar) ? user.avatar : null,
    department: user.studentProfile?.department ?? null,
    memberSince: user.createdAt,
    skills: sections.showSkills ? skills : undefined,
    credentials: sections.showCredentials ? credentials.map((c) => ({ ...c, verifyUrl: verifyUrlFor(c.id) })) : undefined,
    courses: sections.showCourses ? courses.map((e) => e.course) : undefined,
    // Proof of learning: skills backed by graded work, passed quizzes and issued credentials
    evidence: sections.showEvidence !== false ? evidence.filter((g) => owner || g.count > 0) : undefined,
    impact: sections.showImpact
      ? {
          hours: credentials.reduce((n, c) => n + c.hoursCompleted, 0),
          people: credentials.reduce((n, c) => n + c.peopleImpacted, 0),
          credentials: credentials.length,
          points: points?._sum.points ?? 0,
        }
      : undefined,
  };
}

/** The public passport for a link, or null if it doesn't exist or isn't public. Counts the view. */
export async function publicPassport(slug: string) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(slug)) return null;
  const p = await prisma.skillPassport.findUnique({ where: { slug } });
  if (!p || !p.isPublic) return null;
  const content = await passportContent(p.userId, p);
  if (!content) return null;
  void prisma.skillPassport.update({ where: { id: p.id }, data: { views: { increment: 1 } } }).catch(() => {});
  return { headline: p.headline, strengths: p.showEvidence ? p.strengths : null, updatedAt: p.updatedAt, ...content };
}

const skillsBadgeId = (passportId: string) => `${publicAppUrl()}/passport/skills/${passportId}`;

/**
 * The student's skills with evidence as one signed Open Badges 3.0 credential: one Result per
 * skill (how many pieces of evidence, best level). Anyone can check it at /api/passport/verify.
 * null when there's no visible evidence yet.
 */
export async function openSkillsBadgeFor(userId: string) {
  const [p, user, groups] = await Promise.all([
    getOrCreatePassport(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    evidenceGroups(userId, false),
  ]);
  const shown = groups.filter((g) => g.count > 0);
  if (!user || !shown.length) return null;
  const salt = createHash('sha256').update(`skills:${p.id}`).digest('hex').slice(0, 16);
  const identityHash = `sha256$${createHash('sha256').update(user.email.trim().toLowerCase() + salt).digest('hex')}`;
  const issued = new Date().toISOString();
  const id = skillsBadgeId(p.id);
  const credential = {
    '@context': ['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'],
    id,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    name: 'Skills with evidence',
    issuer: { id: issuerUrl(), type: ['Profile'], name: COMPANY.legalName, url: publicAppUrl() },
    validFrom: issued,
    credentialSubject: {
      type: ['AchievementSubject'],
      identifier: [{ type: 'IdentityObject', identityHash, identityType: 'emailAddress', hashed: true, salt }],
      achievement: {
        id: `${id}#achievement`,
        type: ['Achievement'],
        achievementType: 'Competency',
        name: 'Skills with evidence',
        description: 'Skills shown in work that someone else checked on UniVerse: assignments graded by teachers (60% or more), quizzes passed (60% or more) and impact credentials verified by staff.',
        criteria: { narrative: shown.slice(0, 12).map((g) => `${g.label}: ${g.count} piece${g.count === 1 ? '' : 's'} of evidence${g.best ? ` (best: ${g.best})` : ''}`).join('; ') },
        creator: { id: issuerUrl(), type: ['Profile'], name: COMPANY.legalName },
      },
      result: shown.map((g) => ({ type: ['Result'], value: String(g.count), resultDescription: `${g.label}${g.best ? ` · ${g.best}` : ''}` })),
      name: user.name,
    },
    evidence: p.isPublic ? [{ id: passportUrl(p.slug), type: ['Evidence'], name: 'Public skills passport', narrative: 'Each skill lists the work it comes from.' }] : [],
  };
  const keyId = CredentialSigner.jwks().keys[0].kid;
  const jwt = CredentialSigner.signJwt({ iss: issuerUrl(), jti: id, sub: identityHash, nbf: Math.floor(Date.now() / 1000), iat: Math.floor(Date.now() / 1000), vc: credential }, `${jwksUrl()}#${keyId}`);
  return { credential, jwt, fileName: 'skills-with-evidence-open-badge' };
}

/**
 * An Open Badges 3.0 credential (OpenBadgeCredential) for one of the student's issued, signed
 * credentials, and the same credential as a signed VC-JWT. The earner is identified by a salted
 * hash of their email (the email itself isn't in the badge).
 */
export async function openBadgeFor(userId: string, certificateId: string) {
  const cert = await prisma.impactCertificate.findFirst({
    where: { id: certificateId, userId, status: 'ISSUED', revokedAt: null, signature: { not: null } },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!cert) return null;
  const salt = createHash('sha256').update(`${cert.id}:${cert.certificateCode}`).digest('hex').slice(0, 16);
  const identityHash = `sha256$${createHash('sha256').update(cert.user.email.trim().toLowerCase() + salt).digest('hex')}`;
  const issued = new Date(cert.issuedAt).toISOString();
  const narrative = [
    `${cert.hoursCompleted} hours of verified work on "${cert.projectName}" with ${cert.organization}`,
    cert.peopleImpacted ? `, reaching ${cert.peopleImpacted} people` : '',
    cert.verifiedByName ? `. Verified by ${cert.verifiedByName} before issue.` : '. Verified by UniVerse staff before issue.',
  ].join('');

  const credential = {
    '@context': ['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'],
    id: verifyUrlFor(cert.id),
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    name: cert.title,
    issuer: { id: issuerUrl(), type: ['Profile'], name: COMPANY.legalName, url: publicAppUrl() },
    validFrom: issued,
    credentialSubject: {
      type: ['AchievementSubject'],
      identifier: [{ type: 'IdentityObject', identityHash, identityType: 'emailAddress', hashed: true, salt }],
      achievement: {
        id: `${publicAppUrl()}/verify/${cert.id}#achievement`,
        type: ['Achievement'],
        achievementType: 'Achievement',
        name: cert.title,
        description: cert.description || `${cert.title} — ${cert.projectName} (${cert.organization})`,
        criteria: { narrative },
        creator: { id: issuerUrl(), type: ['Profile'], name: COMPANY.legalName },
      },
      result: [
        { type: ['Result'], value: String(cert.hoursCompleted), resultDescription: 'hours' },
        ...(cert.peopleImpacted ? [{ type: ['Result'], value: String(cert.peopleImpacted), resultDescription: 'people impacted' }] : []),
      ],
      name: cert.user.name,
    },
    evidence: [{ id: verifyUrlFor(cert.id), type: ['Evidence'], name: 'Public verification page', narrative: `Certificate ${cert.certificateCode}` }],
  };

  const keyId = CredentialSigner.jwks().keys[0].kid;
  const jwt = CredentialSigner.signJwt(
    {
      iss: issuerUrl(),
      jti: credential.id,
      sub: identityHash,
      nbf: Math.floor(new Date(cert.issuedAt).getTime() / 1000),
      iat: Math.floor(Date.now() / 1000),
      vc: credential,
    },
    `${jwksUrl()}#${keyId}`,
  );
  return { credential, jwt, fileName: `${cert.certificateCode}-open-badge` };
}

/**
 * Checks a badge someone pasted: the signature, that it was issued here, and that the credential
 * hasn't been revoked since.
 */
export async function verifyOpenBadge(jwt: string) {
  const payload = CredentialSigner.verifyJwt(jwt);
  if (!payload) return { valid: false as const, reason: 'The signature doesn’t match. This badge wasn’t issued by UniVerse, or it was changed.' };
  if (payload.iss !== issuerUrl()) return { valid: false as const, reason: 'This badge was issued by someone else.' };
  const vc = payload.vc as { id?: string; name?: string; credentialSubject?: { name?: string; achievement?: { criteria?: { narrative?: string } } }; validFrom?: string } | undefined;
  // A skills-with-evidence badge: valid while the passport (and so the account) exists.
  const skillsOf = typeof vc?.id === 'string' && vc.id.startsWith(`${publicAppUrl()}/passport/skills/`) ? vc.id.split('/passport/skills/')[1] : undefined;
  if (skillsOf) {
    const p = await prisma.skillPassport.findUnique({ where: { id: skillsOf }, select: { id: true } });
    if (!p) return { valid: false as const, reason: 'The passport behind this badge no longer exists.' };
    return { valid: true as const, badge: { name: vc?.name, earner: vc?.credentialSubject?.name, criteria: vc?.credentialSubject?.achievement?.criteria?.narrative, issued: vc?.validFrom, verifyUrl: vc?.id } };
  }
  const id = typeof vc?.id === 'string' ? vc.id.split('/verify/')[1] : undefined;
  const cert = id ? await prisma.impactCertificate.findUnique({ where: { id }, select: { status: true, revokedAt: true, revokedReason: true } }) : null;
  if (!cert) return { valid: false as const, reason: 'The credential in this badge no longer exists.' };
  if (cert.revokedAt || cert.status === 'REVOKED') return { valid: false as const, reason: `This credential was revoked${cert.revokedReason ? `: ${cert.revokedReason}` : '.'}` };
  return {
    valid: true as const,
    badge: { name: vc?.name, earner: vc?.credentialSubject?.name, criteria: vc?.credentialSubject?.achievement?.criteria?.narrative, issued: vc?.validFrom, verifyUrl: vc?.id },
  };
}
