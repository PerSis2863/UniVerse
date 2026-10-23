import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { isOwnBlobUrl } from '@/lib/chat';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { searchWords, snippet } from '@/lib/files-hub';
import { deleteFile, saveFile } from '@/lib/storage';
import { later } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';
import { groupAccess, groupPeople, mySpaces } from './spaces';

// Files hub per space (Stage 4 · 3.7): folders, files, every version of each file, and where a file
// is used (chat messages, task notes). Everyone in the space can add files and new versions;
// whoever runs the space (the teacher, the group's admins) and a file's uploader can rename, move
// or delete it. A space keeps up to 250 MB (all versions count).
//
// Stage 5 · B9.13 adds My files (a space of kind 'me' whose id is the person; 100 MB), stars, the
// words inside files for search (taken out in the browser at upload), Recent / Starred / Search
// across every space someone is in, and share links that expire.

export type SpaceKind = 'course' | 'group' | 'me';
const QUOTA = 250 * 1024 * 1024, MY_QUOTA = 100 * 1024 * 1024, MAX_FOLDERS = 100, MAX_FILES = 1000, MAX_VERSIONS = 20;
const quotaOf = (kind: SpaceKind) => (kind === 'me' ? MY_QUOTA : QUOTA);
const full = (kind: SpaceKind) => (kind === 'me' ? 'Your files are full (100 MB). Delete old files or versions first.' : 'This space is full (250 MB). Delete old files or versions first.');

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
  if (kind === 'me') {
    if (id !== user.id) throw new NotFoundException('These aren’t your files.');
    return { kind: 'me' as const, id, canManage: true };
  }
  throw new NotFoundException('Space not found.');
}

async function people(kind: SpaceKind, id: string) {
  if (kind === 'group') return groupPeople(id);
  if (kind === 'me') return [id];
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
  const [folder, folders, files, used, stars] = await Promise.all([
    folderId ? prisma.spaceFolder.findFirst({ where: { ...where, id: folderId }, select: { id: true, name: true, parentId: true } }) : null,
    prisma.spaceFolder.findMany({ where: { ...where, parentId: folderId }, orderBy: { name: 'asc' }, select: { id: true, name: true, createdAt: true, _count: { select: { files: true, children: true } } } }),
    prisma.spaceFile.findMany({ where: { ...where, folderId }, orderBy: { updatedAt: 'desc' }, take: 300, select: { id: true, name: true, url: true, mime: true, size: true, createdById: true, updatedAt: true, _count: { select: { versions: true } } } }),
    usage(s.kind, id),
    prisma.spaceFileStar.findMany({ where: { userId: user.id, file: where }, select: { fileId: true } }),
  ]);
  const starred = new Set(stars.map((x) => x.fileId));
  if (folderId && !folder) throw new NotFoundException('This folder isn’t there any more.');
  // The path from the top, for the breadcrumb.
  // Up to 8 folders, this one and those above it, in one query (not one per level).
  const path = folder
    ? await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
        `WITH RECURSIVE "up"("id", "name", "parentId", "depth") AS (
           SELECT "id", "name", "parentId", 1 FROM "space_folders" WHERE "id" = ?
           UNION ALL SELECT f."id", f."name", f."parentId", u."depth" + 1 FROM "space_folders" f JOIN "up" u ON f."id" = u."parentId" WHERE u."depth" < 8
         ) SELECT "id", "name" FROM "up" ORDER BY "depth" DESC`,
        folder.id,
      )
    : [];
  const [people, inside, subs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(files.map((f) => f.createdById))] } }, select: { id: true, name: true } }),
    // What's inside each folder, newest first: the folder card fans out its first three (M5).
    folders.length ? prisma.spaceFile.findMany({ where: { ...where, folderId: { in: folders.map((f) => f.id) } }, orderBy: { updatedAt: 'desc' }, take: 240, select: { folderId: true, name: true, url: true, mime: true, size: true, updatedAt: true } }) : [],
    // Folders inside each folder: shown rising out of it when it has fewer than three files.
    folders.length ? prisma.spaceFolder.findMany({ where: { ...where, parentId: { in: folders.map((f) => f.id) } }, orderBy: { name: 'asc' }, take: 240, select: { parentId: true, name: true, _count: { select: { files: true, children: true } } } }) : [],
  ]);
  const names = new Map(people.map((u) => [u.id, u.name]));
  const peek = new Map<string, typeof inside>();
  for (const f of inside) if (f.folderId) peek.set(f.folderId, [...(peek.get(f.folderId) ?? []), f].slice(0, 3));
  const kids = new Map<string, { name: string; items: number }[]>();
  for (const k of subs) if (k.parentId) kids.set(k.parentId, [...(kids.get(k.parentId) ?? []), { name: k.name, items: k._count.files + k._count.children }].slice(0, 3));
  return {
    path, canManage: s.canManage, usage: used, quota: quotaOf(s.kind),
    folders: folders.map((f) => {
      const top = peek.get(f.id) ?? [];
      return { id: f.id, name: f.name, items: f._count.files + f._count.children, updatedAt: top[0]?.updatedAt ?? f.createdAt, preview: [...top.map((x) => ({ name: x.name, url: x.url, mime: x.mime, size: x.size })), ...(kids.get(f.id) ?? []).map((k) => ({ name: k.name, folder: k.items }))].slice(0, 3) };
    }),
    files: files.map((f) => ({ id: f.id, name: f.name, url: f.url, mime: f.mime, size: f.size, updatedAt: f.updatedAt, versions: f._count.versions, by: names.get(f.createdById) ?? 'Someone', canChange: s.canManage || f.createdById === user.id, starred: starred.has(f.id) })),
  };
}

/** POST /api/spaces/:kind/:id/files { action: 'folder', name, parentId? } | { action: 'file', name, url, mime, size, folderId?, text? } */
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
  if ((await usage(s.kind, id)) + up.size > quotaOf(s.kind)) throw new BadRequestException(full(s.kind));
  const f = await prisma.spaceFile.create({
    data: { ...where, folderId: inFolder, name, ...up, text: searchWords(b.text) ?? null, createdById: user.id, updatedById: user.id, versions: { create: { ...up, uploadedById: user.id } } },
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
  const [versions, links] = await Promise.all([
    prisma.spaceFileVersion.findMany({ where: { fileId }, orderBy: { createdAt: 'desc' }, select: { id: true, url: true, size: true, note: true, uploadedById: true, createdAt: true } }),
    canChange ? prisma.spaceFileLink.findMany({ where: { fileId, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { id: true, token: true, expiresAt: true, opens: true } }) : [],
  ]);
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
    links: links.map((l) => ({ id: l.id, path: `/api/share/${l.token}`, expiresAt: l.expiresAt, opens: l.opens })),
    versions: versions.map((v, i) => ({ id: v.id, url: v.url, size: v.size, note: v.note, by: who.get(v.uploadedById) ?? 'Someone', at: v.createdAt, current: i === 0 })),
    usedIn: [
      ...messages.map((m) => ({ kind: 'chat' as const, label: m.conversation.isGroup ? m.conversation.name ?? 'Group chat' : 'Direct chat', chatId: m.conversationId, messageId: m.id, at: m.createdAt })),
      ...tasks.map((t) => ({ kind: 'task' as const, label: t.title, href: `/tasks/${t.boardId}?task=${t.id}` })),
    ],
  };
}

/** POST /api/space-files/:fid { url, mime, size, note?, text? } — a new version (anyone in the space). */
export async function addVersion(fileId: string, user: SessionUser, b: Record<string, unknown>) {
  const { f, s } = await fileAccess(fileId, user);
  const up = upload(b);
  if ((await usage(s.kind, f.spaceId)) + up.size > quotaOf(s.kind)) throw new BadRequestException(full(s.kind));
  await prisma.$transaction([
    prisma.spaceFileVersion.create({ data: { fileId, ...up, note: clean(b.note, 200) || null, uploadedById: user.id } }),
    prisma.spaceFile.update({ where: { id: fileId }, data: { ...up, text: searchWords(b.text) ?? null, updatedById: user.id, updatedAt: new Date() } }),
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

/** PATCH /api/space-files/:fid { name?, folderId? (null = the top), restore?: versionId } · { star: boolean } (anyone in the space) */
export async function updateSpaceFile(fileId: string, user: SessionUser, b: Record<string, unknown>) {
  const { f, s, canChange } = await fileAccess(fileId, user);
  if (typeof b.star === 'boolean') {
    if (b.star) await prisma.spaceFileStar.upsert({ where: { userId_fileId: { userId: user.id, fileId } }, create: { userId: user.id, fileId }, update: {} });
    else await prisma.spaceFileStar.deleteMany({ where: { userId: user.id, fileId } });
    return { ok: true, starred: b.star };
  }
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

/** POST /api/space-files/:fid/links { days: 1 | 7 | 30 } — a link anyone can download the file with until it expires. */
export async function createFileLink(fileId: string, user: SessionUser, b: Record<string, unknown>) {
  const { canChange } = await fileAccess(fileId, user);
  if (!canChange) throw new ForbiddenException('Only whoever added it or runs the space can share a link to this file.');
  const days = [1, 7, 30].includes(Number(b.days)) ? Number(b.days) : 7;
  if ((await prisma.spaceFileLink.count({ where: { fileId, expiresAt: { gt: new Date() } } })) >= 10) throw new BadRequestException('A file can have up to 10 links at once. Stop an old one first.');
  const link = await prisma.spaceFileLink.create({
    data: { fileId, token: randomBytes(18).toString('base64url'), createdById: user.id, expiresAt: new Date(Date.now() + days * 86_400_000) },
    select: { id: true, token: true, expiresAt: true },
  });
  return { id: link.id, path: `/api/share/${link.token}`, expiresAt: link.expiresAt, opens: 0 };
}

/** DELETE /api/space-file-links/:id — the link stops working now. */
export async function deleteFileLink(linkId: string, user: SessionUser) {
  const link = await prisma.spaceFileLink.findUnique({ where: { id: linkId }, select: { fileId: true } });
  if (!link) return { ok: true };
  const { canChange } = await fileAccess(link.fileId, user);
  if (!canChange) throw new ForbiddenException('Only whoever added it or runs the space can stop this link.');
  await prisma.spaceFileLink.delete({ where: { id: linkId } });
  return { ok: true };
}

/** The file behind a share link (the current version), or null when it's wrong or expired. */
export async function sharedFile(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const link = await prisma.spaceFileLink.findUnique({ where: { token }, select: { id: true, expiresAt: true, file: { select: { name: true, url: true, mime: true } } } });
  if (!link || link.expiresAt <= new Date()) return null;
  later(() => prisma.spaceFileLink.update({ where: { id: link.id }, data: { opens: { increment: 1 } } }));
  return link.file;
}

const spaceHref = (kind: string, id: string) => (kind === 'me' ? '/files' : `/spaces/${kind}/${id}/files`);
/**
 * GET /api/files-hub?view=recent|starred&q= — files across My files and every class and group
 * someone is in: changed lately, starred, or matching words in the name or inside the file.
 */
export async function filesHub(user: SessionUser, view: string | null, qRaw: string | null) {
  const { courses, groups } = await mySpaces(user);
  // At most 40 classes and 40 groups, so the query stays inside D1's limits.
  const labels = new Map<string, string>([[`me:${user.id}`, 'My files'], ...courses.slice(0, 40).map((c) => [`course:${c.id}`, c.code ? `${c.code} · ${c.name}` : c.name] as [string, string]), ...groups.slice(0, 40).map((g) => [`group:${g.id}`, g.name] as [string, string])]);
  const mine = [
    { spaceKind: 'me', spaceId: user.id },
    ...(courses.length ? [{ spaceKind: 'course', spaceId: { in: courses.slice(0, 40).map((c) => c.id) } }] : []),
    ...(groups.length ? [{ spaceKind: 'group', spaceId: { in: groups.slice(0, 40).map((g) => g.id) } }] : []),
  ];
  const q = (qRaw ?? '').trim().slice(0, 80);
  const select = { id: true, name: true, url: true, mime: true, size: true, updatedAt: true, spaceKind: true, spaceId: true } as const;
  type Row = { id: string; name: string; url: string; mime: string; size: number; updatedAt: Date; spaceKind: string; spaceId: string; text?: string | null };
  let rows: Row[];
  if (q.length >= 2) {
    rows = await prisma.spaceFile.findMany({ where: { OR: mine, AND: [{ OR: [{ name: { contains: q } }, { text: { contains: q } }] }] }, orderBy: { updatedAt: 'desc' }, take: 40, select: { ...select, text: true } });
  } else if (view === 'starred') {
    const stars = await prisma.spaceFileStar.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100, select: { file: { select } } });
    rows = stars.map((x) => x.file).filter((f) => labels.has(`${f.spaceKind}:${f.spaceId}`));
  } else {
    rows = await prisma.spaceFile.findMany({ where: { OR: mine, updatedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } }, orderBy: { updatedAt: 'desc' }, take: 40, select });
  }
  const starred = view === 'starred' && q.length < 2
    ? new Set(rows.map((r) => r.id))
    : new Set((rows.length ? await prisma.spaceFileStar.findMany({ where: { userId: user.id, fileId: { in: rows.map((r) => r.id) } }, select: { fileId: true } }) : []).map((x) => x.fileId));
  return {
    files: rows.map((r) => ({
      id: r.id, name: r.name, url: r.url, mime: r.mime, size: r.size, updatedAt: r.updatedAt, starred: starred.has(r.id),
      space: { kind: r.spaceKind, id: r.spaceId, label: labels.get(`${r.spaceKind}:${r.spaceId}`) ?? 'A space', href: spaceHref(r.spaceKind, r.spaceId) },
      snippet: q.length >= 2 ? snippet(r.text ?? null, q) : null,
    })),
  };
}

/**
 * Saves a file the app made (a scheduled report) to someone's My files, in a top-level folder named
 * `folder` (made when it isn't there). The same limits as an upload: 1,000 files, 100 MB.
 */
export async function saveToMyFiles(userId: string, folder: string, file: { name: string; mime: string; bytes: Buffer }) {
  const where = { spaceKind: 'me' as const, spaceId: userId };
  const [found, folders, files, used] = await Promise.all([
    prisma.spaceFolder.findFirst({ where: { ...where, parentId: null, name: folder }, select: { id: true } }),
    prisma.spaceFolder.count({ where }),
    prisma.spaceFile.count({ where }),
    usage('me', userId),
  ]);
  if (files >= MAX_FILES) throw new BadRequestException(`My files can hold up to ${MAX_FILES} files. Delete some first.`);
  if (used + file.bytes.length > MY_QUOTA) throw new BadRequestException(full('me'));
  if (!found && folders >= MAX_FOLDERS) throw new BadRequestException(`My files can have up to ${MAX_FOLDERS} folders.`);
  const folderId = found?.id ?? (await prisma.spaceFolder.create({ data: { ...where, parentId: null, name: folder, createdById: userId }, select: { id: true } })).id;
  const up = { url: await saveFile({ ownerId: userId, name: file.name, mime: file.mime, bytes: file.bytes }), mime: file.mime, size: file.bytes.length };
  const f = await prisma.spaceFile.create({
    data: { ...where, folderId, name: file.name, ...up, createdById: userId, updatedById: userId, versions: { create: { ...up, uploadedById: userId } } },
    select: { id: true },
  });
  await refresh('me', userId);
  return f;
}
