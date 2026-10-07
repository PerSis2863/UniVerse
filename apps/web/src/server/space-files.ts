import prisma from '@/lib/db';
import { isOwnBlobUrl } from '@/lib/chat';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { deleteFile } from '@/lib/storage';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';
import { groupAccess, groupPeople } from './spaces';

// Files hub per space (Stage 4 · 3.7): folders, files, every version of each file, and where a file
// is used (chat messages, task notes). Everyone in the space can add files and new versions;
// whoever runs the space (the teacher, the group's admins) and a file's uploader can rename, move
// or delete it. A space keeps up to 250 MB (all versions count).

export type SpaceKind = 'course' | 'group';
const QUOTA = 250 * 1024 * 1024, MAX_FOLDERS = 100, MAX_FILES = 1000, MAX_VERSIONS = 20;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/[\\/]/g, '-').slice(0, max) : '');

async function space(kind: string, id: string, user: SessionUser) {
  if (kind === 'course') {
    const a = await courseAccess(id, user);
    if (!a) throw new NotFoundException('This class isn’t one of yours.');
    return { kind: 'course' as const, id, canManage: a.canManage };
  }
  if (kind === 'group') {
    const a = await groupAccess(id, user);
    if (!a) throw new NotFoundException('This group isn’t one of yours.');
    return { kind: 'group' as const, id, canManage: a.canManage };
  }
  throw new NotFoundException('Space not found.');
}

async function people(kind: SpaceKind, id: string) {
  if (kind === 'group') return groupPeople(id);
  const c = await prisma.course.findUnique({ where: { id }, select: { teacherId: true, enrollments: { select: { studentId: true }, take: 300 } } });
  return [...(c?.teacherId ? [c.teacherId] : []), ...(c?.enrollments.map((e) => e.studentId) ?? [])];
}
async function refresh(kind: SpaceKind, id: string) {
  publish(await people(kind, id), { type: 'refresh', keys: [`/api/spaces/${kind}/${id}/files*`] });
}

async function usage(kind: SpaceKind, id: string) {
  const r = await prisma.spaceFileVersion.aggregate({ where: { file: { spaceKind: kind, spaceId: id } }, _sum: { size: true } });
  return r._sum.size ?? 0;
}

function upload(b: Record<string, unknown>) {
  const url = typeof b.url === 'string' ? b.url : '';
  if (!isOwnBlobUrl(url)) throw new BadRequestException('Upload the file first.');
  const size = Math.round(Number(b.size));
  if (!Number.isFinite(size) || size <= 0) throw new BadRequestException('The file is empty.');
  const mime = typeof b.mime === 'string' && b.mime ? b.mime.slice(0, 120) : 'application/octet-stream';
  return { url, size, mime };
}

/** GET /api/spaces/:kind/:id/files?folder= — a folder's contents (the top when none). */
export async function listFiles(kind: string, id: string, user: SessionUser, folderRaw: string | null) {
  const s = await space(kind, id, user);
  const folderId = folderRaw || null;
  const where = { spaceKind: s.kind, spaceId: id };
  const [folder, folders, files, used] = await Promise.all([
    folderId ? prisma.spaceFolder.findFirst({ where: { ...where, id: folderId }, select: { id: true, name: true, parentId: true } }) : null,
    prisma.spaceFolder.findMany({ where: { ...where, parentId: folderId }, orderBy: { name: 'asc' }, select: { id: true, name: true, createdAt: true, _count: { select: { files: true, children: true } } } }),
    prisma.spaceFile.findMany({ where: { ...where, folderId }, orderBy: { updatedAt: 'desc' }, take: 300, select: { id: true, name: true, url: true, mime: true, size: true, createdById: true, updatedAt: true, _count: { select: { versions: true } } } }),
    usage(s.kind, id),
  ]);
  if (folderId && !folder) throw new NotFoundException('This folder isn’t there any more.');
  // The path from the top, for the breadcrumb.
  const path: { id: string; name: string }[] = [];
  let up = folder;
  for (let i = 0; up && i < 8; i++) {
    path.unshift({ id: up.id, name: up.name });
    up = up.parentId ? await prisma.spaceFolder.findUnique({ where: { id: up.parentId }, select: { id: true, name: true, parentId: true } }) : null;
  }
  const names = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(files.map((f) => f.createdById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    path, canManage: s.canManage, usage: used, quota: QUOTA,
    folders: folders.map((f) => ({ id: f.id, name: f.name, items: f._count.files + f._count.children })),
    files: files.map((f) => ({ id: f.id, name: f.name, url: f.url, mime: f.mime, size: f.size, updatedAt: f.updatedAt, versions: f._count.versions, by: names.get(f.createdById) ?? 'Someone', canChange: s.canManage || f.createdById === user.id })),
  };
}

/** POST /api/spaces/:kind/:id/files { action: 'folder', name, parentId? } | { action: 'file', name, url, mime, size, folderId? } */
export async function addToSpace(kind: string, id: string, user: SessionUser, b: Record<string, unknown>) {
  const s = await space(kind, id, user);
  const where = { spaceKind: s.kind, spaceId: id };
  const inFolder = typeof (b.parentId ?? b.folderId) === 'string' && (b.parentId ?? b.folderId) ? String(b.parentId ?? b.folderId) : null;
  if (inFolder && !(await prisma.spaceFolder.findFirst({ where: { ...where, id: inFolder }, select: { id: true } }))) throw new NotFoundException('Folder not found.');
  if (b.action === 'folder') {
    const name = clean(b.name, 60);
    if (!name) throw new BadRequestException('Name the folder.');
    if ((await prisma.spaceFolder.count({ where })) >= MAX_FOLDERS) throw new BadRequestException(`A space can have up to ${MAX_FOLDERS} folders.`);
    const f = await prisma.spaceFolder.create({ data: { ...where, parentId: inFolder, name, createdById: user.id }, select: { id: true } });
    await refresh(s.kind, id);
    return f;
  }
  const up = upload(b);
  const name = clean(b.name, 120) || 'File';
  if ((await prisma.spaceFile.count({ where })) >= MAX_FILES) throw new BadRequestException(`A space can have up to ${MAX_FILES} files.`);
  if ((await usage(s.kind, id)) + up.size > QUOTA) throw new BadRequestException('This space is full (250 MB). Delete old files or versions first.');
  const f = await prisma.spaceFile.create({
    data: { ...where, folderId: inFolder, name, ...up, createdById: user.id, updatedById: user.id, versions: { create: { ...up, uploadedById: user.id } } },
    select: { id: true },
  });
  await refresh(s.kind, id);
  return f;
}

async function fileAccess(fileId: string, user: SessionUser) {
  const f = await prisma.spaceFile.findUnique({ where: { id: fileId } });
  if (!f) throw new NotFoundException('This file isn’t there any more.');
  const s = await space(f.spaceKind, f.spaceId, user);
  return { f, s, canChange: s.canManage || f.createdById === user.id };
}

/** GET /api/space-files/:fid — the versions, and where the file is used. */
export async function fileDetail(fileId: string, user: SessionUser) {
  const { f, canChange } = await fileAccess(fileId, user);
  const versions = await prisma.spaceFileVersion.findMany({ where: { fileId }, orderBy: { createdAt: 'desc' }, select: { id: true, url: true, size: true, note: true, uploadedById: true, createdAt: true } });
  const urls = versions.map((v) => v.url);
  const [names, messages, tasks] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(versions.map((v) => v.uploadedById))] } }, select: { id: true, name: true } }),
    // "Used in": chats I'm in that shared it, and task cards whose notes link to it.
    prisma.message.findMany({ where: { deletedAt: null, OR: urls.map((u) => ({ attachmentUrl: u })), conversation: { participants: { some: { userId: user.id } } } }, take: 10, orderBy: { createdAt: 'desc' }, select: { id: true, conversationId: true, createdAt: true, conversation: { select: { name: true, isGroup: true } } } }),
    prisma.task.findMany({ where: { OR: urls.map((u) => ({ notes: { contains: u } })) }, take: 10, select: { id: true, title: true, boardId: true } }),
  ]);
  const who = new Map(names.map((u) => [u.id, u.name]));
  return {
    id: f.id, name: f.name, canChange,
    versions: versions.map((v, i) => ({ id: v.id, url: v.url, size: v.size, note: v.note, by: who.get(v.uploadedById) ?? 'Someone', at: v.createdAt, current: i === 0 })),
    usedIn: [
      ...messages.map((m) => ({ kind: 'chat' as const, label: m.conversation.isGroup ? m.conversation.name ?? 'Group chat' : 'Direct chat', chatId: m.conversationId, messageId: m.id, at: m.createdAt })),
      ...tasks.map((t) => ({ kind: 'task' as const, label: t.title, href: `/tasks/${t.boardId}?task=${t.id}` })),
    ],
  };
}

/** POST /api/space-files/:fid { url, mime, size, note? } — a new version (anyone in the space). */
export async function addVersion(fileId: string, user: SessionUser, b: Record<string, unknown>) {
  const { f, s } = await fileAccess(fileId, user);
  const up = upload(b);
  if ((await usage(s.kind, f.spaceId)) + up.size > QUOTA) throw new BadRequestException('This space is full (250 MB). Delete old files or versions first.');
  await prisma.$transaction([
    prisma.spaceFileVersion.create({ data: { fileId, ...up, note: clean(b.note, 200) || null, uploadedById: user.id } }),
    prisma.spaceFile.update({ where: { id: fileId }, data: { ...up, updatedById: user.id, updatedAt: new Date() } }),
  ]);
  // Only the latest versions are kept (the oldest are deleted from storage too).
  const old = await prisma.spaceFileVersion.findMany({ where: { fileId }, orderBy: { createdAt: 'desc' }, skip: MAX_VERSIONS, select: { id: true, url: true } });
  if (old.length) {
    await prisma.spaceFileVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    for (const o of old) await deleteFile(o.url).catch(() => null);
  }
  await refresh(s.kind, f.spaceId);
  return { ok: true };
}

/** PATCH /api/space-files/:fid { name?, folderId? (null = the top), restore?: versionId } */
export async function updateSpaceFile(fileId: string, user: SessionUser, b: Record<string, unknown>) {
  const { f, s, canChange } = await fileAccess(fileId, user);
  if (!canChange) throw new ForbiddenException('Only whoever added it or runs the space can change this file.');
  const data: { name?: string; folderId?: string | null; url?: string; mime?: string; size?: number; updatedAt?: Date; updatedById?: string } = {};
  if (b.name !== undefined) { const n = clean(b.name, 120); if (n) data.name = n; }
  if (b.folderId !== undefined) {
    const to = typeof b.folderId === 'string' && b.folderId ? b.folderId : null;
    if (to && !(await prisma.spaceFolder.findFirst({ where: { id: to, spaceKind: f.spaceKind, spaceId: f.spaceId }, select: { id: true } }))) throw new NotFoundException('Folder not found.');
    data.folderId = to;
  }
  if (typeof b.restore === 'string') {
    // Restoring an older version makes it the current one again (as a new version).
    const v = await prisma.spaceFileVersion.findFirst({ where: { id: b.restore, fileId } });
    if (!v) throw new NotFoundException('Version not found.');
    await prisma.spaceFileVersion.create({ data: { fileId, url: v.url, mime: v.mime, size: v.size, note: `Restored from ${v.createdAt.toISOString().slice(0, 10)}`, uploadedById: user.id } });
    Object.assign(data, { url: v.url, mime: v.mime, size: v.size, updatedAt: new Date(), updatedById: user.id });
  }
  await prisma.spaceFile.update({ where: { id: fileId }, data });
  await refresh(s.kind, f.spaceId);
  return { ok: true };
}

/** DELETE /api/space-files/:fid — the file and all its versions (from storage too). */
export async function deleteSpaceFile(fileId: string, user: SessionUser) {
  const { f, s, canChange } = await fileAccess(fileId, user);
  if (!canChange) throw new ForbiddenException('Only whoever added it or runs the space can delete this file.');
  const versions = await prisma.spaceFileVersion.findMany({ where: { fileId }, select: { url: true } });
  await prisma.spaceFile.delete({ where: { id: fileId } });
  // A file shared in a chat keeps working: only versions nothing else uses are deleted from storage.
  for (const url of new Set(versions.map((v) => v.url))) {
    const elsewhere = await prisma.message.count({ where: { attachmentUrl: url } });
    if (!elsewhere) await deleteFile(url).catch(() => null);
  }
  await refresh(s.kind, f.spaceId);
  return { ok: true };
}

/** PATCH /api/space-folders/:id { name } · DELETE (empty folders only; whoever runs the space or made it). */
export async function changeFolder(folderId: string, user: SessionUser, b: Record<string, unknown> | null) {
  const folder = await prisma.spaceFolder.findUnique({ where: { id: folderId }, select: { id: true, spaceKind: true, spaceId: true, createdById: true, _count: { select: { files: true, children: true } } } });
  if (!folder) throw new NotFoundException('This folder isn’t there any more.');
  const s = await space(folder.spaceKind, folder.spaceId, user);
  if (!s.canManage && folder.createdById !== user.id) throw new ForbiddenException('Only whoever made it or runs the space can change this folder.');
  if (b === null) {
    if (folder._count.files || folder._count.children) throw new BadRequestException('Empty the folder first.');
    await prisma.spaceFolder.delete({ where: { id: folderId } });
  } else {
    const name = clean(b.name, 60);
    if (!name) throw new BadRequestException('Name the folder.');
    await prisma.spaceFolder.update({ where: { id: folderId }, data: { name } });
  }
  await refresh(s.kind, folder.spaceId);
  return { ok: true };
}
