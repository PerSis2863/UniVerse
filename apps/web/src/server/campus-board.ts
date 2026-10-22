import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { isAppFileUrl } from '@/lib/storage';
import { BOARD_SECTIONS, HIDE_AFTER_REPORTS, cleanListing, type BoardSection } from '@/lib/student-life';
import type { Body } from './body';
import { directChat } from './direct-chat';
import { notifyMany } from './email';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';
import { peopleWhere } from './school-scope';

// The campus board (Stage 5 · Q17): a marketplace (sell, swap, give away, wanted), rides and housing.
// Only students post and reply (school accounts, so everyone is a verified student); replies are a
// one-to-one chat with the poster. Anyone can report a post; three reports hide it until an admin
// looks. Posts expire by themselves (60 days; a ride the day after it leaves).

const studentOnly = (user: SessionUser) => { if (user.role !== 'STUDENT') throw new ForbiddenException('The campus board is for students.'); };
const SELECT = {
  id: true, kind: true, title: true, description: true, category: true, price: true, photoUrl: true, fromPlace: true, toPlace: true, departAt: true,
  seats: true, area: true, availableFrom: true, status: true, expiresAt: true, createdAt: true, userId: true, user: { select: { id: true, name: true, avatar: true } },
} as const;

/** GET /api/campus/board?section=market|rides|housing&mine=1 */
export async function listBoard(user: SessionUser, section: string | null, mine: boolean) {
  studentOnly(user);
  const s = (section && section in BOARD_SECTIONS ? section : 'market') as BoardSection;
  const rows = await prisma.campusListing.findMany({
    where: mine ? { userId: user.id, status: { not: 'HIDDEN' } } : { kind: { in: [...BOARD_SECTIONS[s].kinds] }, status: 'ACTIVE', expiresAt: { gt: new Date() } },
    orderBy: s === 'rides' && !mine ? { departAt: 'asc' } : { createdAt: 'desc' }, take: 120, select: SELECT,
  });
  const reported = rows.length ? await prisma.listingReport.findMany({ where: { userId: user.id, listingId: { in: rows.map((r) => r.id) } }, select: { listingId: true } }) : [];
  return { section: s, listings: rows.map(({ userId, ...r }) => ({ ...r, mine: userId === user.id, reported: reported.some((x) => x.listingId === r.id) })) };
}

/** POST /api/campus/board { kind, title, … } */
export async function createListing(user: SessionUser, b: Body) {
  studentOnly(user);
  const c = cleanListing(b);
  if ('error' in c) throw new BadRequestException(c.error);
  if (c.data.photoUrl && !isAppFileUrl(c.data.photoUrl)) throw new BadRequestException('Upload the photo here.');
  if ((await prisma.campusListing.count({ where: { userId: user.id, status: 'ACTIVE', expiresAt: { gt: new Date() } } })) >= 20) throw new BadRequestException('You have 20 posts up. Mark some as done first.');
  await prisma.campusListing.create({ data: { ...(c.data as { kind: string; title: string; expiresAt: Date }), userId: user.id } });
  return listBoard(user, null, true);
}

/** PATCH /api/campus/board/[id] { status: 'DONE' | 'ACTIVE' }: sold, filled or found (or back up). */
export async function setListingStatus(user: SessionUser, id: string, b: Body) {
  studentOnly(user);
  const l = await prisma.campusListing.findFirst({ where: { id, userId: user.id }, select: { status: true } });
  if (!l) throw new NotFoundException('Post not found.');
  if (l.status === 'HIDDEN') throw new BadRequestException('An admin is looking at this post.');
  if (b.status !== 'DONE' && b.status !== 'ACTIVE') throw new BadRequestException('Unknown status.');
  await prisma.campusListing.update({ where: { id }, data: { status: b.status, ...(b.status === 'ACTIVE' ? { expiresAt: new Date(Date.now() + 60 * 86_400_000) } : {}) } });
  return listBoard(user, null, true);
}

/** DELETE /api/campus/board/[id]: the poster or an admin. */
export async function deleteListing(user: SessionUser, id: string) {
  const l = await prisma.campusListing.findUnique({ where: { id }, select: { userId: true } });
  // An admin removes only their own school's students' posts (school-scope.ts).
  if (!l || (l.userId !== user.id && (user.role !== 'ADMIN' || !(await prisma.user.count({ where: { id: l.userId, ...(await peopleWhere(user)) } }))))) throw new NotFoundException('Post not found.');
  await prisma.campusListing.delete({ where: { id } });
  return user.role === 'ADMIN' ? reportedListings(user) : listBoard(user, null, true);
}

/** POST /api/campus/board/[id]/contact: a one-to-one chat with the poster. */
export async function contactPoster(user: SessionUser, id: string) {
  studentOnly(user);
  const l = await prisma.campusListing.findFirst({ where: { id, status: 'ACTIVE' }, select: { userId: true } });
  if (!l) throw new NotFoundException('This post is no longer up.');
  if (l.userId === user.id) throw new BadRequestException('This is your own post.');
  return { conversationId: await directChat(user.id, l.userId) };
}

/** POST /api/campus/board/[id]/report { reason }: once per person; three reports hide the post. */
export async function reportListing(user: SessionUser, id: string, reason: unknown) {
  studentOnly(user);
  const why = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
  if (why.length < 3) throw new BadRequestException('Say briefly what’s wrong.');
  const l = await prisma.campusListing.findUnique({ where: { id }, select: { userId: true, title: true, user: { select: { organizationId: true } } } });
  if (!l) throw new NotFoundException('Post not found.');
  if (l.userId === user.id) throw new BadRequestException('This is your own post.');
  try {
    await prisma.listingReport.create({ data: { listingId: id, userId: user.id, reason: why } });
  } catch (e) {
    if (/unique|constraint/i.test(String((e as Error).message))) throw new ConflictException('You’ve already reported this post.');
    throw e;
  }
  const reports = await prisma.listingReport.count({ where: { listingId: id } });
  await prisma.campusListing.update({ where: { id }, data: { reports, ...(reports >= HIDE_AFTER_REPORTS ? { status: 'HIDDEN' } : {}) } });
  if (reports === HIDE_AFTER_REPORTS) {
    // The poster's school's admins: its own, and the admin who owns it (school-scope.ts).
    const org = l.user.organizationId;
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', OR: [{ organizationId: org }, ...(org ? [{ ownedOrganization: { id: org } }] : [])] }, select: { id: true }, take: 20 });
    await notifyMany(admins.map((a) => a.id), { type: 'warning', title: `A campus board post was hidden: ${l.title}`, body: `${reports} students reported it. Look at it in Student life → Campus board.`, link: '/admin/monitoring/board', email: false });
  }
  return { ok: true, hidden: reports >= HIDE_AFTER_REPORTS };
}

// ── Admins ───────────────────────────────────────────────────────────────

/** GET /api/admin/campus-board: reported posts with the reasons. */
export async function reportedListings(user: SessionUser) {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Admins only.');
  // Only the admin's own school's students' posts (school-scope.ts).
  const rows = await prisma.campusListing.findMany({
    where: { reports: { gt: 0 }, user: await peopleWhere(user) }, orderBy: [{ status: 'asc' }, { reports: 'desc' }], take: 200,
    select: { ...SELECT, reports: true, reportRows: { select: { reason: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  return { listings: rows.map((r) => ({ ...r, userId: undefined })) };
}

/** PATCH /api/admin/campus-board { id, action: 'restore' | 'hide' }: restore clears the reports. */
export async function moderateListing(user: SessionUser, b: Body) {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Admins only.');
  const id = typeof b.id === 'string' ? b.id : '';
  if (!(await prisma.campusListing.findFirst({ where: { id, user: await peopleWhere(user) }, select: { id: true } }))) throw new NotFoundException('Post not found.');
  if (b.action === 'restore') {
    await prisma.listingReport.deleteMany({ where: { listingId: id } });
    await prisma.campusListing.update({ where: { id }, data: { status: 'ACTIVE', reports: 0 } });
  } else if (b.action === 'hide') await prisma.campusListing.update({ where: { id }, data: { status: 'HIDDEN' } });
  else throw new BadRequestException('Unknown action.');
  return reportedListings(user);
}
