import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException } from './http';

// Device keys for private chats (Stage 5 · B7.6): each device registers its public key (X25519,
// 32 bytes in base64); people in a private chat fetch each other's (and their own other devices')
// keys to encrypt for. Private keys never come here. A device unused for 180 days is left out.

const MAX_DEVICES = 10, STALE_MS = 180 * 86_400_000;
const KEY = /^[A-Za-z0-9+/]{43}=$/;

/** POST /api/chat/keys { deviceId, publicKey, label? } — registers (or refreshes) this device. */
export async function registerDevice(user: SessionUser, b: Record<string, unknown>) {
  const deviceId = typeof b.deviceId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(b.deviceId) ? b.deviceId : null;
  const publicKey = typeof b.publicKey === 'string' && KEY.test(b.publicKey) ? b.publicKey : null;
  if (!deviceId || !publicKey) throw new BadRequestException('That device key isn’t valid.');
  const label = typeof b.label === 'string' ? b.label.slice(0, 40) : null;
  const existing = await prisma.chatDeviceKey.findUnique({ where: { userId_deviceId: { userId: user.id, deviceId } }, select: { publicKey: true } });
  if (existing && existing.publicKey !== publicKey) throw new BadRequestException('This device already has a different key.');
  if (!existing) {
    // Too many devices: the one unused longest makes room.
    const mine = await prisma.chatDeviceKey.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: 'asc' }, select: { id: true } });
    if (mine.length >= MAX_DEVICES) await prisma.chatDeviceKey.deleteMany({ where: { id: { in: mine.slice(0, mine.length - MAX_DEVICES + 1).map((d) => d.id) } } });
  }
  await prisma.chatDeviceKey.upsert({ where: { userId_deviceId: { userId: user.id, deviceId } }, create: { userId: user.id, deviceId, publicKey, label }, update: { lastSeenAt: new Date(), ...(label ? { label } : {}) } });
  return { ok: true };
}

/** GET /api/chat/keys?conversationId= — every device of the people in a private chat I'm in. */
export async function conversationDevices(user: SessionUser, conversationId: string) {
  const convo = await prisma.conversation.findFirst({ where: { id: conversationId, private: true, participants: { some: { userId: user.id } } }, select: { participants: { select: { userId: true } } } });
  if (!convo) throw new NotFoundException('Private chat not found.');
  const rows = await prisma.chatDeviceKey.findMany({
    where: { userId: { in: convo.participants.map((p) => p.userId) }, lastSeenAt: { gt: new Date(Date.now() - STALE_MS) } },
    orderBy: { createdAt: 'asc' }, take: 24, select: { userId: true, deviceId: true, publicKey: true, label: true },
  });
  return { devices: rows };
}

/** DELETE /api/chat/keys?deviceId= — forget one of my devices. */
export async function removeDevice(user: SessionUser, deviceId: string) {
  await prisma.chatDeviceKey.deleteMany({ where: { userId: user.id, deviceId } });
  return { ok: true };
}
