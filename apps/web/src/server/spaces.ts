import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { NotFoundException } from './http';

// Spaces (Stage 4 · 3.1): every course and study group is a workspace with its call, documents,
// task boards and (courses) code rooms in one place. Nothing extra is stored: a space is the course
// or group itself, and docs and boards say which one they belong to (courseId / groupId).

export type SpaceKind = 'course' | 'group';

/** Whether I'm in this group, and whether I run it (its creator, admins and moderators). */
export async function groupAccess(groupId: string, user: SessionUser) {
  const g = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true, name: true, description: true, createdById: true, members: { where: { userId: user.id }, select: { role: true } } } });
  if (!g || (!g.members.length && user.role !== 'ADMIN')) return null;
  return { group: g, canManage: g.createdById === user.id || ['ADMIN', 'MODERATOR'].includes(g.members[0]?.role ?? '') || user.role === 'ADMIN' };
}

/** A group's members (up to 300), for live updates. */
export async function groupPeople(groupId: string) {
  return (await prisma.groupMembership.findMany({ where: { groupId }, select: { userId: true }, take: 300 })).map((m) => m.userId);
}

/** My courses and study groups. */
export async function mySpaces(user: SessionUser) {
  const [courses, groups] = await Promise.all([
    user.role === 'STUDENT'
      ? prisma.enrollment.findMany({ where: { studentId: user.id }, select: { course: { select: { id: true, code: true, name: true } } }, take: 100 }).then((r) => r.map((e) => e.course))
      : prisma.course.findMany({ where: { teacherId: user.id }, select: { id: true, code: true, name: true }, take: 100 }),
    prisma.groupMembership.findMany({ where: { userId: user.id }, select: { group: { select: { id: true, name: true } } }, take: 100 }).then((r) => r.map((m) => m.group)),
  ]);
  return { courses, groups };
}

/** Everything in one space. */
export async function getSpace(kind: SpaceKind, id: string, user: SessionUser) {
  let title: string, subtitle: string, canManage: boolean, people: { id: string; name: string; avatar: string | null }[];
  if (kind === 'course') {
    const a = await courseAccess(id, user);
    if (!a) throw new NotFoundException('This class isn’t one of yours.');
    title = `${a.course.code} · ${a.course.name}`;
    subtitle = a.course.teacher ? `With ${a.course.teacher.name}` : 'Class';
    canManage = a.canManage;
    const c = await prisma.course.findUnique({ where: { id }, select: { teacher: { select: { id: true, name: true, avatar: true } }, enrollments: { take: 60, select: { student: { select: { id: true, name: true, avatar: true } } } } } });
    people = [...(c?.teacher ? [c.teacher] : []), ...(c?.enrollments.map((e) => e.student) ?? [])];
  } else {
    const a = await groupAccess(id, user);
    if (!a) throw new NotFoundException('This group isn’t one of yours.');
    title = a.group.name;
    subtitle = a.group.description?.slice(0, 120) || 'Study group';
    canManage = a.canManage;
    people = (await prisma.groupMembership.findMany({ where: { groupId: id }, take: 60, select: { user: { select: { id: true, name: true, avatar: true } } } })).map((m) => m.user);
  }
  const where = kind === 'course' ? { courseId: id } : { groupId: id };
  const [docs, boards, code] = await Promise.all([
    prisma.doc.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 30, select: { id: true, title: true, preview: true, updatedAt: true } }),
    prisma.taskBoard.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 30, select: { id: true, title: true, updatedAt: true, _count: { select: { tasks: true } } } }),
    kind === 'course' ? prisma.codeRoom.findMany({ where: { courseId: id }, orderBy: { updatedAt: 'desc' }, take: 30, select: { id: true, title: true, language: true, updatedAt: true } }) : Promise.resolve([]),
  ]);
  const openTasks = boards.length ? await prisma.task.count({ where: { boardId: { in: boards.map((b) => b.id) }, doneAt: null } }) : 0;
  return {
    kind, id, title, subtitle, canManage, people,
    callId: `${kind === 'course' ? 'c' : 'g'}_${id}`,
    docs, boards: boards.map((b) => ({ id: b.id, title: b.title, updatedAt: b.updatedAt, tasks: b._count.tasks })), code, openTasks,
  };
}
