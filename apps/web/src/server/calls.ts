import { getCloudflareContext } from '@opennextjs/cloudflare';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { HttpException, NotFoundException } from './http';

// UniVerse's own voice and video calls. A call is a CALL message in a chat; the people in that
// chat may join. Audio and video go straight between browsers (WebRTC, up to 6 people, each
// connected to each); the call's Durable Object (cloudflare/worker.ts CallRoom) only passes the
// connection details between them. STUN finds a direct route on most networks; strict ones
// (some campus and office Wi-Fi) need a TURN relay, used when TURN_KEY_ID and TURN_KEY_API_TOKEN
// (Cloudflare Realtime TURN) are set.

const CALL_HOURS = 4; // a call link stops working after this

interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> };
}

declare global {
  interface CloudflareEnv {
    CALLS?: RoomNamespace;
  }
}

async function roomFetch(callId: string, path: string, init?: RequestInit): Promise<Response | null> {
  let ns: RoomNamespace | undefined;
  try {
    ns = getCloudflareContext().env.CALLS;
  } catch {
    return null;
  }
  if (!ns) return null;
  try {
    return await ns.get(ns.idFromName(callId)).fetch(`https://call${path}`, init);
  } catch (e) {
    console.error('call room call failed:', e);
    return null;
  }
}

export async function callAccess(callId: string, user: SessionUser) {
  const msg = await prisma.message.findUnique({
    where: { id: callId },
    select: {
      type: true, metadata: true, createdAt: true, deletedAt: true, senderId: true,
      sender: { select: { name: true } },
      conversation: { select: { id: true, isGroup: true, name: true, participants: { select: { userId: true, user: { select: { name: true, avatar: true } } } } } },
    },
  });
  if (!msg || msg.type !== 'CALL' || msg.deletedAt || !msg.conversation.participants.some((p) => p.userId === user.id)) throw new NotFoundException('This call doesn’t exist or isn’t in one of your chats.');
  if (Date.now() - msg.createdAt.getTime() > CALL_HOURS * 3600_000) throw new HttpException('This call has ended. Start a new one from the chat.', 410);
  const meta = (msg.metadata ?? {}) as { kind?: string };
  const others = msg.conversation.participants.filter((p) => p.userId !== user.id);
  return {
    kind: meta.kind === 'video' ? 'video' : 'audio',
    conversationId: msg.conversation.id,
    title: msg.conversation.isGroup ? msg.conversation.name ?? 'Group call' : others[0]?.user.name ?? 'Call',
    startedBy: msg.sender.name,
    members: msg.conversation.participants.map((p) => ({ id: p.userId, name: p.user.name, avatar: p.user.avatar })),
  };
}

/** STUN always; TURN credentials (valid a few hours) when Cloudflare Realtime TURN is set up. */
async function iceServers(): Promise<RTCIceServer[]> {
  const stun: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
  const keyId = process.env.TURN_KEY_ID, token = process.env.TURN_KEY_API_TOKEN;
  if (!keyId || !token) return stun;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: CALL_HOURS * 3600 }),
    });
    if (!res.ok) throw new Error(`TURN ${res.status}`);
    const body = (await res.json()) as { iceServers?: RTCIceServer[] | RTCIceServer };
    const turn = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    return [...stun, ...turn];
  } catch (e) {
    console.error('TURN credentials failed:', e);
    return stun;
  }
}

/** The address for the call's live connection (one use, within 60 seconds) and the ICE servers. */
export async function callTicket(callId: string, user: SessionUser) {
  const info = await callAccess(callId, user);
  const res = await roomFetch(callId, '/ticket', { method: 'POST', body: JSON.stringify({ userId: user.id, name: user.name }) });
  if (!res?.ok) throw new HttpException('Calls are unavailable right now.', 503);
  const { ticket } = (await res.json()) as { ticket: string };
  return { ...info, path: `/call-live?call=${encodeURIComponent(callId)}&ticket=${encodeURIComponent(ticket)}`, iceServers: await iceServers() };
}
