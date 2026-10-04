import { getCloudflareContext } from '@opennextjs/cloudflare';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';

// Shared code editors for a course: everyone in the course can open a room; everyone can edit
// unless the teacher locks it (then the teacher and whoever created it). The code itself lives
// in the room's Durable Object (cloudflare/worker.ts CodeRoom), which merges simultaneous edits
// (Yjs) and passes cursors between people. Access is checked here, which hands out one-time
// tickets for the live connection, like whiteboards (src/server/boards.ts).

export const LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'cpp'] as const;
const MAX_ROOMS_PER_COURSE = 200;

interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> };
}

declare global {
  interface CloudflareEnv {
    CODE?: RoomNamespace;
  }
}

async function roomFetch(roomId: string, path: string, init?: RequestInit): Promise<Response | null> {
  let ns: RoomNamespace | undefined;
  try {
    ns = getCloudflareContext().env.CODE;
  } catch {
    return null;
  }
  if (!ns) return null;
  try {
    return await ns.get(ns.idFromName(roomId)).fetch(`https://code${path}`, init);
  } catch (e) {
    console.error('code room call failed:', e);
    return null;
  }
}

async function access(roomId: string, user: SessionUser) {
  const room = await prisma.codeRoom.findUnique({ where: { id: roomId } });
  const a = room ? await courseAccess(room.courseId, user) : null;
  if (!room || !a) throw new NotFoundException('This code room doesn’t exist or isn’t in one of your courses.');
  const canManage = a.canManage || room.createdById === user.id;
  return { room, course: a.course, canManage, canEdit: canManage || !room.locked };
}

export async function listRooms(user: SessionUser) {
  const courses = user.role === 'STUDENT'
    ? (await prisma.enrollment.findMany({ where: { studentId: user.id }, select: { course: { select: { id: true, code: true, name: true } } } })).map((e) => e.course)
    : await prisma.course.findMany({ where: user.role === 'ADMIN' ? {} : { teacherId: user.id }, select: { id: true, code: true, name: true }, take: 200 });
  const rooms = courses.length
    ? await prisma.codeRoom.findMany({
        where: { courseId: { in: courses.map((c) => c.id).slice(0, 90) } },
        orderBy: { updatedAt: 'desc' },
        take: 300,
        select: { id: true, courseId: true, title: true, language: true, locked: true, updatedAt: true, createdBy: { select: { name: true } } },
      })
    : [];
  return { courses, rooms };
}

export async function createRoom(user: SessionUser, body: Record<string, unknown>) {
  const courseId = typeof body.courseId === 'string' ? body.courseId : '';
  const a = courseId ? await courseAccess(courseId, user) : null;
  if (!a) throw new NotFoundException('Course not found.');
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  if (!title) throw new BadRequestException('Give the room a name.');
  const language = (LANGUAGES as readonly string[]).includes(String(body.language)) ? String(body.language) : 'javascript';
  if ((await prisma.codeRoom.count({ where: { courseId } })) >= MAX_ROOMS_PER_COURSE) throw new BadRequestException('This course has the most code rooms it can have. Delete some first.');
  return prisma.codeRoom.create({ data: { courseId, createdById: user.id, title, language } });
}

export async function getRoom(roomId: string, user: SessionUser) {
  const { room, course, canManage, canEdit } = await access(roomId, user);
  return { ...room, course: { id: course.id, code: course.code, name: course.name }, canManage, canEdit };
}

export async function updateRoom(roomId: string, user: SessionUser, body: Record<string, unknown>) {
  const { canManage } = await access(roomId, user);
  if (!canManage) throw new ForbiddenException('Only the teacher or whoever made this room can change it.');
  const data: { title?: string; language?: string; locked?: boolean } = {};
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim().slice(0, 120);
  if ((LANGUAGES as readonly string[]).includes(String(body.language))) data.language = String(body.language);
  if (typeof body.locked === 'boolean') data.locked = body.locked;
  const saved = await prisma.codeRoom.update({ where: { id: roomId }, data });
  // Reconnect everyone so who-may-edit takes effect at once.
  if (data.locked !== undefined) await roomFetch(roomId, '/kick', { method: 'POST', body: JSON.stringify({}) });
  return saved;
}

export async function deleteRoom(roomId: string, user: SessionUser) {
  const { canManage } = await access(roomId, user);
  if (!canManage) throw new ForbiddenException('Only the teacher or whoever made this room can delete it.');
  await prisma.codeRoom.delete({ where: { id: roomId } });
  await roomFetch(roomId, '/kick', { method: 'POST', body: JSON.stringify({ wipe: true }) });
  return { ok: true };
}

/** The address for the live connection (one use, within 60 seconds). */
export async function roomTicket(roomId: string, user: SessionUser) {
  const { canEdit } = await access(roomId, user);
  const res = await roomFetch(roomId, '/ticket', { method: 'POST', body: JSON.stringify({ userId: user.id, name: user.name, canEdit }) });
  if (!res?.ok) throw new HttpException('Live code rooms are unavailable right now.', 503);
  const { ticket } = (await res.json()) as { ticket: string };
  await prisma.codeRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } }).catch(() => {});
  return { path: `/code-live?room=${encodeURIComponent(roomId)}&ticket=${encodeURIComponent(ticket)}`, canEdit };
}
