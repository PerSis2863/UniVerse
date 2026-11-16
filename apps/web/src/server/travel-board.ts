import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { ageOn } from '@/lib/play';
import { isDay } from '@/lib/travel-plan';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { first, str, type Body, type Query } from './body';
import { isMinor, schoolPolicy } from './safety';
import { directChat } from './direct-chat';
import { shortName } from './play';

// UniVerse Travel's travellers board (M207, the owner's Airbnb list item 6): adults who choose to say
// they'll be in a city on some dates (their first name, the dates, a short note) see the others who did
// for the same city and overlapping dates, and can message them in the Travel app. Never shown: who
// someone is beyond a first name, where they stay, anything about people who didn't join the board.
// Only people on the board see it; under-18s can't join (their birth date, or their school's rule for
// students); three reports hide a post; blocking hides two people from each other here, files away the
// Travel chat between them for the one who blocked and refuses new messages in it either way (M213).

const MAX_SHOWN = 60, DAY = 86_400_000, HIDE_AT = 3;
const guideOf = (v: unknown) => { const t = (str(v) ?? '').replace(/\s+/g, ' ').trim().slice(0, 120); return t && !/[[\]{}|#<>]/.test(t) ? t : null; };
const today = () => new Date().toISOString().slice(0, 10);

/** Adults only: refused for an account whose birth date says under 18, or a student their school counts as under 18. */
async function adultCheck(u: SessionUser) {
  const me = await prisma.user.findUnique({ where: { id: u.id }, select: { role: true, dateOfBirth: true, organizationId: true } });
  if (!me) throw new NotFoundException('Sign in again.');
  const age = ageOn(me.dateOfBirth);
  if ((age !== null && age < 18) || isMinor(me, await schoolPolicy(me.organizationId))) throw new ForbiddenException('The travellers board is for adults (18 and over).');
}
/** Everyone I blocked or who blocked me. */
async function blockedWith(u: SessionUser) {
  const rows = await prisma.travelBlock.findMany({ where: { OR: [{ userId: u.id }, { blockedId: u.id }] }, select: { userId: true, blockedId: true }, take: 500 });
  return new Set(rows.map((r) => (r.userId === u.id ? r.blockedId : r.userId)));
}

/** GET /travel/board?guide=&from=&to=: my post for the city and, once I'm on the board there, the others
 *  whose dates overlap mine (first names, dates, notes; never who they are beyond that). */
export async function travelBoard(u: SessionUser, q: Query) {
  const guide = guideOf(first(q.guide));
  if (!guide) throw new BadRequestException('Pick a city.');
  const mine = await prisma.travelBoardPost.findUnique({ where: { userId_guide: { userId: u.id, guide } }, select: { id: true, fromDate: true, toDate: true, note: true, hidden: true } });
  const from = mine?.fromDate ?? (isDay(first(q.from)) ? first(q.from)! : today()), to = mine?.toDate ?? (isDay(first(q.to)) ? first(q.to)! : from);
  const overlapping = { guide, hidden: false, userId: { not: u.id }, fromDate: { lte: to }, toDate: { gte: from } };
  if (!mine) return { mine: null, people: [], count: await prisma.travelBoardPost.count({ where: overlapping }) };
  const blocked = await blockedWith(u);
  const rows = await prisma.travelBoardPost.findMany({ where: overlapping, orderBy: { fromDate: 'asc' }, take: MAX_SHOWN + blocked.size, select: { id: true, userId: true, name: true, fromDate: true, toDate: true, note: true } });
  // Their account id stays here: messaging, reporting and blocking go by the post.
  const people = rows.filter((r) => !blocked.has(r.userId)).slice(0, MAX_SHOWN).map((r) => ({ id: r.id, name: r.name, fromDate: r.fromDate, toDate: r.toDate, note: r.note }));
  return { mine, people, count: people.length };
}

/** POST /travel/board { guide, from, to, note, adult: true }: put myself on the board for a city (one post
 *  a city, its dates and note updated). The "I'm 18 or over" tick is required as well as the checks above. */
export async function joinTravelBoard(u: SessionUser, b: Body) {
  const guide = guideOf(b.guide);
  if (!guide) throw new BadRequestException('Pick a city.');
  if (b.adult !== true) throw new BadRequestException('Tick that you’re 18 or over.');
  if (!isDay(b.from) || !isDay(b.to) || b.to < b.from) throw new BadRequestException('Pick the dates you’ll be there.');
  if (b.to < today() || Date.parse(b.to) - Date.parse(b.from) > 90 * DAY || Date.parse(b.from) - Date.now() > 550 * DAY) throw new BadRequestException('Pick dates in the next year and a half, up to 90 days.');
  await adultCheck(u);
  if ((await prisma.travelBoardPost.count({ where: { userId: u.id } })) >= 20) throw new BadRequestException('You’re on the board in 20 places: take an old one off first.');
  const note = (str(b.note) ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
  const data = { fromDate: b.from, toDate: b.to, note, name: shortName(u.name) };
  const post = await prisma.travelBoardPost.upsert({ where: { userId_guide: { userId: u.id, guide } }, create: { userId: u.id, guide, ...data }, update: data, select: { id: true } });
  return { post };
}

/** DELETE /travel/board/:id: take myself off. */
export async function leaveTravelBoard(u: SessionUser, id: string) {
  const r = await prisma.travelBoardPost.deleteMany({ where: { id, userId: u.id } });
  if (!r.count) throw new NotFoundException('That isn’t your post.');
  return { ok: true };
}

/** A post I may act on: shown to me (I'm on the board for its city, neither of us blocked the other). */
async function visiblePost(u: SessionUser, id: string) {
  const post = await prisma.travelBoardPost.findFirst({ where: { id, hidden: false }, select: { id: true, userId: true, guide: true } });
  if (!post || post.userId === u.id) throw new NotFoundException('That traveller isn’t on the board any more.');
  const mine = await prisma.travelBoardPost.count({ where: { userId: u.id, guide: post.guide } });
  if (!mine || (await blockedWith(u)).has(post.userId)) throw new NotFoundException('That traveller isn’t on the board any more.');
  return post;
}

/** POST /travel/board/:id/message: a chat with them in the Travel app's Messages. */
export async function messageTraveller(u: SessionUser, id: string) {
  await adultCheck(u);
  const post = await visiblePost(u, id);
  return { conversationId: await directChat(u.id, post.userId, 'travel') };
}

/** POST /travel/board/:id/report { reason }: once a person; three reports hide the post. */
export async function reportTraveller(u: SessionUser, id: string, b: Body) {
  const post = await visiblePost(u, id);
  const reason = (str(b.reason) ?? '').trim().slice(0, 300) || null;
  await prisma.travelBoardReport.upsert({ where: { postId_userId: { postId: post.id, userId: u.id } }, create: { postId: post.id, userId: u.id, reason }, update: { reason } });
  if ((await prisma.travelBoardReport.count({ where: { postId: post.id } })) >= HIDE_AT) await prisma.travelBoardPost.update({ where: { id: post.id }, data: { hidden: true } });
  return { ok: true };
}

/** POST /travel/board/:id/block: hide them from me and me from them on the board. */
export async function blockTraveller(u: SessionUser, id: string) {
  const post = await visiblePost(u, id);
  await prisma.travelBlock.upsert({ where: { userId_blockedId: { userId: u.id, blockedId: post.userId } }, create: { userId: u.id, blockedId: post.userId }, update: {} });
  // M213: the Travel chat between them goes to my archive, muted (it stays readable; nothing more can be sent).
  const chat = await prisma.conversation.findFirst({ where: { isGroup: false, app: 'travel', AND: [{ participants: { some: { userId: u.id } } }, { participants: { some: { userId: post.userId } } }] }, select: { id: true } });
  if (chat) await prisma.conversationParticipant.updateMany({ where: { conversationId: chat.id, userId: u.id }, data: { archivedAt: new Date(), mutedUntil: new Date('9999-12-31T00:00:00Z') } });
  return { ok: true };
}

/** M213: why I can't send in this chat: a one-to-one Travel chat with someone I blocked, or who blocked me, on the board. */
export async function travelChatBlocked(conversationId: string, userId: string): Promise<string | null> {
  const other = await prisma.conversationParticipant.findFirst({ where: { conversationId, userId: { not: userId } }, select: { userId: true } });
  if (!other) return null;
  const block = await prisma.travelBlock.findFirst({ where: { OR: [{ userId, blockedId: other.userId }, { userId: other.userId, blockedId: userId }] }, select: { userId: true } });
  return !block ? null : block.userId === userId ? 'You blocked this traveller on the travellers board. Unblock them there to write again.' : 'This traveller isn’t taking messages from you.';
}

/** DELETE /travel/blocks: unblock everyone I blocked on the board. */
export async function unblockTravellers(u: SessionUser) {
  const r = await prisma.travelBlock.deleteMany({ where: { userId: u.id } });
  return { unblocked: r.count };
}
