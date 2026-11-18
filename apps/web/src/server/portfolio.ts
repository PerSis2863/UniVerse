import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, text, type Body } from './body';
import { passportUrl } from './passport';

// M296: portfolios. On top of the skills passport (src/server/passport.ts: skills, credentials, impact),
// a student shows pieces of their own work, each with their own words about it: a graded hand-in (its
// course and grade copied in when added, never the teacher's feedback), a project or a link. Private
// share links (for an application) show the passport and its work even while it isn't public, until
// they expire (7–180 days) or are taken back; each counts its views.

export const ITEM_KINDS = ['WORK', 'PROJECT', 'LINK'] as const;
export const SHARE_DAYS = [7, 30, 90, 180] as const;
const MAX_ITEMS = 24, MAX_SHARES = 10;
const clip = (v: unknown, n: number) => (str(v) ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const long = (v: unknown, n: number) => text(v).trim().slice(0, n) || null;
/** Only web links and the app's own files: no javascript: or data: URLs on a page others open. */
export const safeUrl = (v: unknown) => { const s = clip(v, 500); return /^https:\/\/[^\s]+$/i.test(s) || /^\/api\/files\/(?!.*\.\.)[\w./-]+$/.test(s) ? s : null; };
const isStudent = (u: SessionUser) => u.role === 'STUDENT';

/** The work shown on a passport (by its owner's id), in their order. */
export async function portfolioWork(userId: string) {
  const items = await prisma.portfolioItem.findMany({ where: { userId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], take: MAX_ITEMS });
  return items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, body: i.body, url: i.url, course: i.course, grade: i.grade }));
}

/** GET /portfolio: my work, my share links, and my graded hand-ins I could add. */
export async function myPortfolio(u: SessionUser) {
  const [work, shares, handIns] = await Promise.all([
    portfolioWork(u.id),
    prisma.portfolioShare.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: MAX_SHARES }),
    isStudent(u) ? prisma.assignmentSubmission.findMany({ where: { studentId: u.id, status: 'RETURNED' }, orderBy: { id: 'desc' }, take: 40, select: { id: true, score: true, assignment: { select: { title: true, maxScore: true, course: { select: { code: true } } } } } }) : Promise.resolve([]),
  ]);
  const used = new Set((await prisma.portfolioItem.findMany({ where: { userId: u.id, submissionId: { not: null } }, select: { submissionId: true } })).map((i) => i.submissionId));
  return {
    work,
    shares: shares.map((s) => ({ token: s.token, label: s.label, url: passportUrl(s.token), expiresAt: s.expiresAt, expired: s.expiresAt < new Date(), views: s.views, createdAt: s.createdAt })),
    handIns: handIns.filter((h) => !used.has(h.id)).map((h) => ({ id: h.id, title: h.assignment.title, course: h.assignment.course.code, grade: h.score != null ? `${h.score}/${h.assignment.maxScore}` : null })),
    shareDays: SHARE_DAYS,
  };
}

/** POST /portfolio/items { kind, title, body?, url?, submissionId?, showGrade? } */
export async function addItem(u: SessionUser, b: Body) {
  if ((await prisma.portfolioItem.count({ where: { userId: u.id } })) >= MAX_ITEMS) throw new BadRequestException(`A portfolio shows ${MAX_ITEMS} pieces: remove one first.`);
  const kind = oneOf(ITEM_KINDS, b.kind) ? b.kind : 'PROJECT';
  let title = clip(b.title, 120), course: string | null = null, grade: string | null = null, submissionId: string | null = null;
  if (kind === 'WORK') {
    const s = await prisma.assignmentSubmission.findFirst({ where: { id: clip(b.submissionId, 40), studentId: u.id }, select: { id: true, score: true, assignment: { select: { title: true, maxScore: true, course: { select: { code: true } } } } } });
    if (!s) throw new NotFoundException('That hand-in isn’t yours, or isn’t there any more.');
    submissionId = s.id; title = title || s.assignment.title; course = s.assignment.course.code;
    grade = b.showGrade === true && s.score != null ? `${s.score}/${s.assignment.maxScore}` : null;
  }
  if (!title) throw new BadRequestException('Give it a title.');
  const url = b.url === undefined || b.url === '' ? null : safeUrl(b.url);
  if (b.url && !url) throw new BadRequestException('Links start with https://');
  if (kind === 'LINK' && !url) throw new BadRequestException('Add the link.');
  const last = await prisma.portfolioItem.findFirst({ where: { userId: u.id }, orderBy: { position: 'desc' }, select: { position: true } });
  const item = await prisma.portfolioItem.create({ data: { userId: u.id, kind, title, body: long(b.body, 2000), url, submissionId, course, grade, position: (last?.position ?? 0) + 1 }, select: { id: true } });
  return { item };
}

async function mine(u: SessionUser, id: string) {
  const i = await prisma.portfolioItem.findUnique({ where: { id }, select: { id: true, userId: true, position: true } });
  if (!i || i.userId !== u.id) throw new NotFoundException('That piece isn’t in your portfolio.');
  return i;
}

/** PATCH /portfolio/items/:id { title?, body?, url?, move?: 'up' | 'down' } */
export async function updateItem(u: SessionUser, id: string, b: Body) {
  const i = await mine(u, id);
  if (b.move === 'up' || b.move === 'down') {
    const next = await prisma.portfolioItem.findFirst({ where: { userId: u.id, position: b.move === 'up' ? { lt: i.position } : { gt: i.position } }, orderBy: { position: b.move === 'up' ? 'desc' : 'asc' }, select: { id: true, position: true } });
    if (next) {
      await prisma.portfolioItem.update({ where: { id: next.id }, data: { position: i.position } });
      await prisma.portfolioItem.update({ where: { id }, data: { position: next.position } });
    }
    return { ok: true };
  }
  const data: { title?: string; body?: string | null; url?: string | null } = {};
  if (b.title !== undefined) { const t = clip(b.title, 120); if (!t) throw new BadRequestException('Give it a title.'); data.title = t; }
  if (b.body !== undefined) data.body = long(b.body, 2000);
  if (b.url !== undefined) { data.url = b.url === '' ? null : safeUrl(b.url); if (b.url && !data.url) throw new BadRequestException('Links start with https://'); }
  await prisma.portfolioItem.update({ where: { id }, data });
  return { ok: true };
}

/** DELETE /portfolio/items/:id */
export async function removeItem(u: SessionUser, id: string) {
  await mine(u, id);
  await prisma.portfolioItem.delete({ where: { id } });
  return { ok: true };
}

/** POST /portfolio/shares { label?, days }: a private link (the passport page, by a token instead of its slug). */
export async function addShare(u: SessionUser, b: Body) {
  if (!(await prisma.skillPassport.findUnique({ where: { userId: u.id }, select: { id: true } }))) throw new ForbiddenException('Open your skills passport once first.');
  if ((await prisma.portfolioShare.count({ where: { userId: u.id } })) >= MAX_SHARES) throw new BadRequestException(`You can keep ${MAX_SHARES} links: remove an old one.`);
  const days = (SHARE_DAYS as readonly number[]).includes(Number(b.days)) ? Number(b.days) : 30;
  const token = randomBytes(18).toString('base64url');
  await prisma.portfolioShare.create({ data: { token, userId: u.id, label: clip(b.label, 80) || null, expiresAt: new Date(Date.now() + days * 86_400_000) } });
  return { token, url: passportUrl(token) };
}

/** DELETE /portfolio/shares/:token */
export async function removeShare(u: SessionUser, token: string) {
  const n = await prisma.portfolioShare.deleteMany({ where: { token: clip(token, 40), userId: u.id } });
  if (!n.count) throw new NotFoundException('That link isn’t there any more.');
  return { ok: true };
}

/** The passport's owner for a share token that hasn't expired (counts the view), or null. */
export async function sharedOwner(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return null;
  const s = await prisma.portfolioShare.findUnique({ where: { token } });
  if (!s || s.expiresAt < new Date()) return null;
  void prisma.portfolioShare.update({ where: { token }, data: { views: { increment: 1 } } }).catch(() => {});
  return s.userId;
}
