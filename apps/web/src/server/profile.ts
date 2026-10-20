import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import type { ProfileLink } from '@/lib/profile';
import { NotFoundException } from './http';

// A person's profile (Stage 5 · Q18), for anyone signed in: what they chose to show (photo, cover,
// pronouns, about, links, availability), their role and department, and resources they shared
// publicly. Never their email or phone. Parent accounts have no profile page.

const SELECT = {
  id: true, name: true, avatar: true, role: true, status: true, createdAt: true, coverUrl: true, pronouns: true, bio: true, links: true, availability: true,
  studentProfile: { select: { department: true, year: true } }, teacherProfile: { select: { department: true, designation: true } },
} as const;

/** GET /api/profile/[id] (an old link may carry a name instead: an exact, unique match still opens). */
export async function profileOf(_viewer: SessionUser, idOrName: string) {
  let u = await prisma.user.findUnique({ where: { id: idOrName }, select: SELECT });
  if (!u) {
    const byName = await prisma.user.findMany({ where: { name: idOrName, role: { not: 'GUARDIAN' } }, take: 2, select: SELECT });
    if (byName.length === 1) u = byName[0];
  }
  if (!u || u.role === 'GUARDIAN' || u.status === 'SUSPENDED') throw new NotFoundException('Profile not found.');
  const shared = await prisma.knowledgeHubResource.findMany({ where: { authorId: u.id, isPublic: true }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, title: true, url: true, category: true, createdAt: true } });
  const links = (() => { try { const v = JSON.parse(u.links); return Array.isArray(v) ? (v as ProfileLink[]) : []; } catch { return []; } })();
  return {
    id: u.id, name: u.name, avatar: u.avatar, role: u.role, coverUrl: u.coverUrl, pronouns: u.pronouns, bio: u.bio, links, availability: u.availability,
    memberSince: u.createdAt, department: u.studentProfile?.department ?? u.teacherProfile?.department ?? null,
    year: u.studentProfile?.year ?? null, designation: u.teacherProfile?.designation ?? null, shared,
  };
}
