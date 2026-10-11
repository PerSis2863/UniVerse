import prisma from '@/lib/db';
import { isOwnBlobUrl } from '@/lib/chat';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';

// Sticker packs (Stage 5 · B7.2). Anyone can make their own packs; an admin can make packs for the
// whole school. Stickers are images uploaded like chat photos (src/components/chat/chat-client.ts
// uploadChatFile); sending one posts a photo message marked as a sticker. GIF search (Tenor or
// Giphy) needs the owner's key and isn't here.

const MY_PACKS = 5;
const SCHOOL_PACKS = 20;
const PER_PACK = 30;

const SELECT = { id: true, name: true, school: true, ownerId: true, stickers: { orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }], select: { id: true, url: true, label: true } } };
const shape = (user: SessionUser) => (p: { id: string; name: string; school: boolean; ownerId: string; stickers: { id: string; url: string; label: string }[] }) => ({
  id: p.id, name: p.name, school: p.school, stickers: p.stickers,
  canEdit: p.ownerId === user.id || (p.school && user.role === 'ADMIN'),
});

/** GET /api/chat/stickers: the school's packs, then mine. */
export async function stickerPacks(user: SessionUser) {
  const [school, mine] = await Promise.all([
    prisma.stickerPack.findMany({ where: { school: true }, orderBy: { createdAt: 'asc' }, take: SCHOOL_PACKS, select: SELECT }),
    prisma.stickerPack.findMany({ where: { ownerId: user.id, school: false }, orderBy: { createdAt: 'asc' }, take: MY_PACKS, select: SELECT }),
  ]);
  return { packs: [...school, ...mine].map(shape(user)), canMakeSchool: user.role === 'ADMIN' };
}

const name = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 40) : '');

/** POST /api/chat/stickers { name, school? }: a new, empty pack. */
export async function createPack(user: SessionUser, b: Record<string, unknown>) {
  const n = name(b.name);
  if (!n) throw new BadRequestException('Name the pack.');
  const school = b.school === true;
  if (school && user.role !== 'ADMIN') throw new ForbiddenException('Only an admin can make a pack for the whole school.');
  const count = await prisma.stickerPack.count({ where: school ? { school: true } : { ownerId: user.id, school: false } });
  if (count >= (school ? SCHOOL_PACKS : MY_PACKS)) throw new BadRequestException(school ? `Up to ${SCHOOL_PACKS} school packs.` : `Up to ${MY_PACKS} packs of your own.`);
  const p = await prisma.stickerPack.create({ data: { name: n, ownerId: user.id, school }, select: SELECT });
  return shape(user)(p);
}

/**
 * POST /api/chat/stickers/:id { action: 'add', stickers: [{ url, label? }] } | { action: 'remove', stickerId }
 * | { action: 'rename', name } | { action: 'delete' }. The pack's maker, or an admin for a school pack.
 */
export async function packAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  const p = await prisma.stickerPack.findUnique({ where: { id }, select: { id: true, ownerId: true, school: true, _count: { select: { stickers: true } } } });
  if (!p || (!p.school && p.ownerId !== user.id)) throw new NotFoundException('That sticker pack isn’t yours.');
  if (p.ownerId !== user.id && !(p.school && user.role === 'ADMIN')) throw new ForbiddenException('Only an admin can change the school’s packs.');
  switch (b.action) {
    case 'add': {
      const list = (Array.isArray(b.stickers) ? b.stickers : []).slice(0, PER_PACK).map((x) => (x ?? {}) as Record<string, unknown>);
      const items = list.filter((x) => typeof x.url === 'string' && isOwnBlobUrl(x.url)).map((x) => ({ url: x.url as string, label: typeof x.label === 'string' ? x.label.trim().slice(0, 40) : '' }));
      if (!items.length) throw new BadRequestException('Add an image.');
      if (p._count.stickers + items.length > PER_PACK) throw new BadRequestException(`Up to ${PER_PACK} stickers in a pack.`);
      await prisma.sticker.createMany({ data: items.map((x, i) => ({ packId: id, url: x.url, label: x.label, position: p._count.stickers + i })) });
      break;
    }
    case 'remove': {
      const res = await prisma.sticker.deleteMany({ where: { id: typeof b.stickerId === 'string' ? b.stickerId : '', packId: id } });
      if (!res.count) throw new NotFoundException('That sticker isn’t in this pack.');
      break;
    }
    case 'rename': {
      const n = name(b.name);
      if (!n) throw new BadRequestException('Name the pack.');
      await prisma.stickerPack.update({ where: { id }, data: { name: n } });
      break;
    }
    case 'delete':
      await prisma.stickerPack.delete({ where: { id } });
      return { deleted: true };
    default: throw new BadRequestException('Unknown action.');
  }
  return shape(user)(await prisma.stickerPack.findUniqueOrThrow({ where: { id }, select: SELECT }));
}
