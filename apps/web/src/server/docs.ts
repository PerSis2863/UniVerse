import { getCloudflareContext } from '@opennextjs/cloudflare';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { publish } from './realtime';
import { notify } from './email';
import { groupAccess, groupPeople } from './spaces';
import { channelSendCheck } from './communities';
import { notifyMentioned } from './mentions';
import { indexDoc, indexLater } from './semester';

// Documents (Stage 4 · 3.2). The text is written together live: a Yjs document kept by the same
// Durable Object as code rooms (cloudflare/worker.ts CodeRoom), in a room named "doc:<id>", so
// nothing new runs on the server. Here: who may open a doc, versions (saved by the editors' apps
// while they write, at most every 2 minutes, or named on purpose), and comments on quoted text.
// A doc is yours and whoever you share it with (editors or viewers), or a course's.

const MAX_DOCS = 200, MAX_HTML = 400_000, VERSION_GAP_MS = 2 * 60_000, KEEP_AUTO = 50;

interface RoomNamespace { idFromName(name: string): unknown; get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> } }

async function roomFetch(docId: string, path: string, init?: RequestInit): Promise<Response | null> {
  let ns: RoomNamespace | undefined;
  try { ns = (getCloudflareContext().env as { CODE?: RoomNamespace }).CODE; } catch { return null; }
  if (!ns) return null;
  try { return await ns.get(ns.idFromName(`doc:${docId}`)).fetch(`https://code${path}`, init); } catch (e) { console.error('doc room call failed:', e); return null; }
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function access(docId: string, user: SessionUser) {
  const doc = await prisma.doc.findUnique({ where: { id: docId }, select: { id: true, title: true, ownerId: true, courseId: true, groupId: true, conversationId: true, members: { select: { userId: true, role: true } } } });
  if (!doc) throw new NotFoundException('Document not found.');
  const mine = doc.members.find((m) => m.userId === user.id);
  const course = doc.courseId ? await courseAccess(doc.courseId, user) : null;
  const group = doc.groupId ? await groupAccess(doc.groupId, user) : null;
  const chat = doc.conversationId ? await chatAccess(doc.conversationId, user) : null;
  const isOwner = doc.ownerId === user.id;
  // A chat's canvas belongs to the chat: someone who left it can't open it any more.
  if (doc.conversationId && !chat && user.role !== 'ADMIN') throw new NotFoundException('Document not found.');
  if (!isOwner && !mine && !course && !group && !chat && user.role !== 'ADMIN') throw new NotFoundException('Document not found.');
  return { doc, canEdit: isOwner || mine?.role === 'EDITOR' || !!course || !!group || !!chat?.canEdit, canManage: !!course?.canManage || !!group?.canManage || !!chat?.canManage || (isOwner && !doc.conversationId) };
}

/** A chat's canvas (1.12): everyone in the chat edits it (in a community channel, those who may
 *  post there); the group's admins or the community's moderators manage it. */
async function chatAccess(conversationId: string, user: SessionUser) {
  const me = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId: user.id } }, select: { role: true, conversation: { select: { communityId: true, isGroup: true } } } });
  if (!me) return null;
  const c = me.conversation;
  if (c.communityId) {
    const m = await prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: c.communityId, userId: user.id } }, select: { role: true } });
    const mod = m?.role === 'OWNER' || m?.role === 'MOD';
    return { canEdit: mod || !(await channelSendCheck(conversationId, user.id, { slowMode: false })), canManage: mod };
  }
  return { canEdit: true, canManage: !c.isGroup || me.role === 'ADMIN' };
}

/** GET (create: false) or POST (create: true) /api/chat/conversations/:id/canvas → { id } or { id: null }. */
export async function chatCanvas(conversationId: string, user: SessionUser, create: boolean) {
  const a = await chatAccess(conversationId, user);
  if (!a) throw new NotFoundException('Chat not found.');
  const found = await prisma.doc.findUnique({ where: { conversationId }, select: { id: true } });
  if (found || !create) return { id: found?.id ?? null };
  if (!a.canEdit) throw new ForbiddenException('Only people who can post here can start the canvas.');
  const convo = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { name: true, isGroup: true } });
  try {
    const doc = await prisma.doc.create({ data: { title: `${convo?.isGroup && convo.name ? convo.name : 'Chat'} canvas`.slice(0, 120), ownerId: user.id, conversationId } });
    return { id: doc.id };
  } catch {
    // Someone else made it a moment ago.
    return { id: (await prisma.doc.findUnique({ where: { conversationId }, select: { id: true } }))?.id ?? null };
  }
}

async function audience(doc: { ownerId: string; courseId: string | null; groupId?: string | null; conversationId?: string | null; members: { userId: string }[] }) {
  const ids = new Set([doc.ownerId, ...doc.members.map((m) => m.userId)]);
  if (doc.conversationId) for (const p of await prisma.conversationParticipant.findMany({ where: { conversationId: doc.conversationId }, select: { userId: true }, take: 300 })) ids.add(p.userId);
  if (doc.groupId) for (const u of await groupPeople(doc.groupId)) ids.add(u);
  if (doc.courseId) {
    const c = await prisma.course.findUnique({ where: { id: doc.courseId }, select: { teacherId: true, enrollments: { select: { studentId: true }, take: 300 } } });
    if (c?.teacherId) ids.add(c.teacherId);
    for (const e of c?.enrollments ?? []) ids.add(e.studentId);
  }
  return [...ids].slice(0, 300);
}

export async function listDocs(user: SessionUser) {
  const courses = user.role === 'STUDENT'
    ? (await prisma.enrollment.findMany({ where: { studentId: user.id }, select: { course: { select: { id: true, code: true, name: true } } }, take: 100 })).map((e) => e.course)
    : await prisma.course.findMany({ where: user.role === 'ADMIN' ? {} : { teacherId: user.id }, select: { id: true, code: true, name: true }, take: 100 });
  const groups = (await prisma.groupMembership.findMany({ where: { userId: user.id }, select: { group: { select: { id: true, name: true } } }, take: 100 })).map((m) => m.group);
  const docs = await prisma.doc.findMany({
    where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }, ...(courses.length ? [{ courseId: { in: courses.map((c) => c.id) } }] : []), ...(groups.length ? [{ groupId: { in: groups.map((g) => g.id) } }] : [])] },
    orderBy: { updatedAt: 'desc' }, take: 200,
    select: { id: true, title: true, preview: true, courseId: true, groupId: true, ownerId: true, updatedAt: true },
  });
  const code = new Map([...courses.map((c) => [c.id, c.code] as const), ...groups.map((g) => [g.id, g.name] as const)]);
  return { courses, groups, docs: docs.map((d) => ({ id: d.id, title: d.title, preview: d.preview, course: d.courseId ? code.get(d.courseId) ?? null : d.groupId ? code.get(d.groupId) ?? null : null, mine: d.ownerId === user.id, updatedAt: d.updatedAt })) };
}

export async function createDoc(user: SessionUser, body: Record<string, unknown>) {
  const title = clean(body.title, 120) || 'Untitled';
  const courseId = typeof body.courseId === 'string' && body.courseId ? body.courseId : null;
  const groupId = !courseId && typeof body.groupId === 'string' && body.groupId ? body.groupId : null;
  if (courseId && !(await courseAccess(courseId, user))) throw new NotFoundException('Course not found.');
  if (groupId && !(await groupAccess(groupId, user))) throw new NotFoundException('Group not found.');
  if ((await prisma.doc.count({ where: { ownerId: user.id } })) >= MAX_DOCS) throw new BadRequestException(`You can have up to ${MAX_DOCS} documents. Delete some first.`);
  const doc = await prisma.doc.create({ data: { title, ownerId: user.id, courseId, groupId } });
  return { id: doc.id };
}

export async function getDoc(docId: string, user: SessionUser) {
  const { doc, canEdit, canManage } = await access(docId, user);
  const [course, people, chat] = await Promise.all([
    doc.courseId ? prisma.course.findUnique({ where: { id: doc.courseId }, select: { code: true, name: true } }) : null,
    prisma.user.findMany({ where: { id: { in: doc.members.map((m) => m.userId).slice(0, 90) } }, select: { id: true, name: true } }),
    doc.conversationId ? prisma.conversation.findUnique({ where: { id: doc.conversationId }, select: { id: true, name: true, isGroup: true } }) : null,
  ]);
  const name = new Map(people.map((p) => [p.id, p.name]));
  return { id: doc.id, title: doc.title, course, chat: chat ? { id: chat.id, name: chat.isGroup ? chat.name ?? 'Group chat' : 'Chat' } : null, canEdit, canManage, me: { id: user.id, name: user.name }, members: doc.members.map((m) => ({ ...m, name: name.get(m.userId) ?? 'Someone' })) };
}

export async function updateDoc(docId: string, user: SessionUser, body: Record<string, unknown>) {
  const { canEdit } = await access(docId, user);
  if (!canEdit) throw new ForbiddenException('You can only read this document.');
  const title = clean(body.title, 120);
  if (title) await prisma.doc.update({ where: { id: docId }, data: { title } });
  return { ok: true };
}

export async function deleteDoc(docId: string, user: SessionUser) {
  const { canManage } = await access(docId, user);
  if (!canManage) throw new ForbiddenException('Only whoever made this document can delete it.');
  await prisma.doc.delete({ where: { id: docId } });
  await roomFetch(docId, '/kick', { method: 'POST', body: JSON.stringify({ wipe: true }) });
  return { ok: true };
}

export async function setDocMember(docId: string, user: SessionUser, body: Record<string, unknown>) {
  const { doc, canManage } = await access(docId, user);
  if (!canManage) throw new ForbiddenException('Only whoever made this document can share it.');
  if (body.remove && typeof body.userId === 'string') {
    await prisma.docMember.deleteMany({ where: { docId, userId: body.userId } });
  } else {
    const email = clean(body.email, 200).toLowerCase();
    const who = email ? await prisma.user.findUnique({ where: { email }, select: { id: true } }) : null;
    if (!who) throw new NotFoundException('Nobody on UniVerse has that email.');
    if (doc.members.length >= 100) throw new BadRequestException('A document can be shared with up to 100 people.');
    const role = body.role === 'VIEWER' ? 'VIEWER' : 'EDITOR';
    await prisma.docMember.upsert({ where: { docId_userId: { docId, userId: who.id } }, create: { docId, userId: who.id, role }, update: { role } });
    void notify(who.id, { title: `${user.name} shared a document with you`, body: doc.title, link: `/docs/${docId}`, type: 'info', email: false });
  }
  // Who may edit changed: everyone reconnects with a fresh ticket.
  await roomFetch(docId, '/kick', { method: 'POST', body: JSON.stringify({}) });
  return { ok: true };
}

/** A one-time address for the live connection (with whether I may edit). */
export async function docTicket(docId: string, user: SessionUser) {
  const { canEdit } = await access(docId, user);
  const res = await roomFetch(docId, '/ticket', { method: 'POST', body: JSON.stringify({ userId: user.id, name: user.name, canEdit }) });
  if (!res?.ok) throw new HttpException('Live editing is unavailable right now.', 503);
  const { ticket } = (await res.json()) as { ticket: string };
  return { path: `/code-live?room=${encodeURIComponent(`doc:${docId}`)}&ticket=${encodeURIComponent(ticket)}`, canEdit };
}

// ── Versions ───────────────────────────────────────────────────────────────────────────────

/** Saves a version (html + its text for the preview). Unnamed ones at most every 2 minutes. */
export async function saveVersion(docId: string, user: SessionUser, body: Record<string, unknown>) {
  const { canEdit } = await access(docId, user);
  if (!canEdit) throw new ForbiddenException('You can only read this document.');
  const html = typeof body.html === 'string' ? body.html : '';
  if (!html || html.length > MAX_HTML) throw new BadRequestException('That version is empty or too long.');
  const name = clean(body.name, 80) || null;
  const text = clean(body.text, 300);
  await prisma.doc.update({ where: { id: docId }, data: { preview: text || null } });
  if (!name) {
    const last = await prisma.docVersion.findFirst({ where: { docId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, html: true } });
    if (last && (last.html === html || Date.now() - last.createdAt.getTime() < VERSION_GAP_MS)) return { saved: false };
  }
  await prisma.docVersion.create({ data: { docId, html, authorId: user.id, name } });
  indexLater(() => indexDoc(docId)); // "Ask your semester" (Stage 4 · 4.5)
  // Keep the latest unnamed versions; named ones stay.
  const old = await prisma.docVersion.findMany({ where: { docId, name: null }, orderBy: { createdAt: 'desc' }, skip: KEEP_AUTO, take: 50, select: { id: true } });
  if (old.length) await prisma.docVersion.deleteMany({ where: { id: { in: old.map((v) => v.id) } } });
  return { saved: true };
}

export async function listVersions(docId: string, user: SessionUser) {
  await access(docId, user);
  const rows = await prisma.docVersion.findMany({ where: { docId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, name: true, authorId: true, createdAt: true } });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.authorId))].slice(0, 90) } }, select: { id: true, name: true } });
  const by = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, author: by.get(r.authorId) ?? 'Someone' }));
}

export async function getVersion(docId: string, versionId: string, user: SessionUser) {
  await access(docId, user);
  const v = await prisma.docVersion.findFirst({ where: { id: versionId, docId }, select: { id: true, html: true, name: true, createdAt: true } });
  if (!v) throw new NotFoundException('Version not found.');
  return v;
}

// ── Comments ───────────────────────────────────────────────────────────────────────────────

export async function listDocComments(docId: string, user: SessionUser) {
  await access(docId, user);
  const rows = await prisma.docComment.findMany({ where: { docId }, orderBy: { createdAt: 'asc' }, take: 300, select: { id: true, userId: true, quote: true, body: true, resolvedAt: true, createdAt: true } });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))].slice(0, 90) } }, select: { id: true, name: true, avatar: true } });
  const by = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, user: by.get(r.userId) ?? { id: r.userId, name: 'Someone', avatar: null } }));
}

export async function addDocComment(docId: string, user: SessionUser, body: Record<string, unknown>) {
  const { doc } = await access(docId, user);
  const text = clean(body.body, 2000);
  if (!text) throw new BadRequestException('Write something first.');
  const c = await prisma.docComment.create({ data: { docId, userId: user.id, body: text, quote: clean(body.quote, 500) || null } });
  const people = await audience(doc);
  // @mentions (3.9) notify whoever is named; the owner hears about other comments as before.
  const pinged = await notifyMentioned(text, people, user, { title: doc.title, link: `/docs/${docId}` });
  if (doc.ownerId !== user.id && !pinged.includes(doc.ownerId)) void notify(doc.ownerId, { title: `${user.name} commented on ${doc.title}`, body: text.slice(0, 160), link: `/docs/${docId}`, type: 'info', email: false });
  publish(people, { type: 'refresh', keys: [`/api/docs/${docId}/comments`] });
  return c;
}

export async function resolveDocComment(docId: string, commentId: string, user: SessionUser, body: Record<string, unknown>) {
  const { doc, canEdit } = await access(docId, user);
  const c = await prisma.docComment.findFirst({ where: { id: commentId, docId }, select: { userId: true } });
  if (!c) throw new NotFoundException('Comment not found.');
  if (!canEdit && c.userId !== user.id) throw new ForbiddenException('You can only change your own comments.');
  if (body.delete === true) {
    if (c.userId !== user.id && doc.ownerId !== user.id) throw new ForbiddenException('Only its writer or the document’s owner can delete a comment.');
    await prisma.docComment.delete({ where: { id: commentId } });
  } else {
    await prisma.docComment.update({ where: { id: commentId }, data: { resolvedAt: body.resolved === false ? null : new Date() } });
  }
  publish(await audience(doc), { type: 'refresh', keys: [`/api/docs/${docId}/comments`] });
  return { ok: true };
}

/** Who can be @mentioned here (3.9 autocomplete): the people who can see it. */
export async function docPeople(id: string, user: SessionUser) {
  const { doc } = await access(id, user);
  return audience(doc);
}
