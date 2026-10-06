import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, HttpException, NotFoundException } from './http';
import { planLimits } from '@/lib/plan-limits';
import { publishChat } from './realtime';

// UniVerse's own voice and video calls. Audio and video go straight between browsers (WebRTC,
// up to 6 people, each connected to each); the call's Durable Object (cloudflare/worker.ts
// CallRoom) only passes connection details. Three kinds of call, by id:
//   <message id>   a call started in a chat (a CALL message); the chat's members may join.
//                  Ends after 4 hours; how it ended (answered and how long, missed, declined) is
//                  written back onto the message so the chat shows it.
//   g_<group id>   a study group's standing room; its members may join.
//   c_<course id>  a class's standing room; its teacher and enrolled students may join.
//   r_<chat id>    a drop-in voice room in a group or a community voice channel: members join and
//                  leave any time, nobody is rung (Discord-style). Moderators are its hosts.
//   l_<random>     a call link (like a FaceTime link): anyone signed in with the link may join.
//   <call>~b<n>    breakout room n of a call (2.6): the call's host splits it into smaller rooms for
//                  a while; the call's room keeps who goes where (cloudflare/worker.ts CallRoom).
// STUN finds a direct route on most networks; strict ones (some campus and office Wi-Fi) need a
// TURN relay, used when TURN_KEY_ID and TURN_KEY_API_TOKEN (Cloudflare Realtime TURN) are set.
// Bigger calls: with CALLS_APP_ID and CALLS_APP_SECRET (Cloudflare Realtime SFU, 1,000 GB a month
// free) every call except one-to-one goes through the SFU instead, so a class of 30+ fits; each
// person sends their audio and video once and receives only the video they look at.

const CALL_HOURS = 4;

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

export interface CallMeta { kind?: string; inApp?: boolean; url?: string; endedAt?: string; durationSec?: number; answered?: boolean; declinedBy?: string }

/** A breakout room's id → its call and room number (1–20). */
export function breakoutOf(callId: string) {
  const m = /^(.+)~b(\d{1,2})$/.exec(callId);
  const n = m ? Number(m[2]) : 0;
  return m && n >= 1 && n <= 20 ? { parent: m[1], n } : null;
}

export interface CallInfo {
  kind: 'audio' | 'video';
  type: 'chat' | 'group' | 'class';
  title: string;
  /** For chat calls: the chat, so the call screen can go back to it. */
  conversationId: string | null;
  /** The chat the call's chat panel uses (chat calls, voice rooms); other calls chat in the call
   *  room itself, for as long as the call lasts (cloudflare/worker.ts CallRoom). */
  chatId?: string | null;
  /** One-to-one chat calls ring the other person and stop after 45 s without an answer. */
  oneToOne: boolean;
  startedBy: string | null;
  ended: boolean;
  /** Runs the call (host controls): the class's teacher (who alone may record), a study group's
   *  creator and admins, a room's moderators, a group chat call's starter and the chat's admins,
   *  a call link's creator (cloudflare/worker.ts CallRoom). */
  host: boolean;
}

export async function callAccess(callId: string, user: SessionUser, wantKind?: unknown): Promise<CallInfo> {
  const kind = wantKind === 'audio' ? 'audio' : 'video';
  // A breakout room: whoever may join the call (whether this room is theirs is the call room's call,
  // asked in callTicket). Each room chats in its own room, not in the call's chat.
  const room = breakoutOf(callId);
  if (room) {
    const info = await callAccess(room.parent, user, wantKind);
    if (info.oneToOne) throw new NotFoundException('Breakout rooms are for group calls.');
    return { ...info, chatId: null };
  }
  if (callId.startsWith('g_')) {
    const group = await prisma.group.findUnique({ where: { id: callId.slice(2) }, select: { name: true, createdById: true, members: { where: { userId: user.id }, select: { role: true } } } });
    if (!group || (!group.members.length && user.role !== 'ADMIN')) throw new NotFoundException('This group call isn’t for one of your groups.');
    const host = group.createdById === user.id || ['ADMIN', 'MODERATOR'].includes(group.members[0]?.role ?? '');
    return { kind, type: 'group', title: group.name, conversationId: null, oneToOne: false, startedBy: null, ended: false, host };
  }
  if (callId.startsWith('r_')) {
    const convo = await prisma.conversation.findUnique({
      where: { id: callId.slice(2) },
      select: { isGroup: true, name: true, communityId: true, community: { select: { name: true } }, participants: { where: { userId: user.id }, select: { role: true } } },
    });
    if (!convo?.isGroup || !convo.participants.length) throw new NotFoundException('This voice room isn’t in one of your groups.');
    let host = convo.participants[0].role === 'ADMIN';
    if (convo.communityId) {
      const m = await prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: convo.communityId, userId: user.id } }, select: { role: true } });
      host = m?.role === 'OWNER' || m?.role === 'MOD';
    }
    const title = convo.communityId ? `${convo.name ?? 'Voice room'} · ${convo.community?.name ?? ''}` : `${convo.name ?? 'Group'} · voice room`;
    return { kind: wantKind === 'video' ? 'video' : 'audio', type: 'group', title, conversationId: null, chatId: callId.slice(2), oneToOne: false, startedBy: null, ended: false, host };
  }
  if (callId.startsWith('l_')) {
    if (!/^l_[A-Za-z0-9_-]{10,40}$/.test(callId)) throw new NotFoundException('This call link isn’t valid.');
    return { kind: wantKind === 'audio' ? 'audio' : 'video', type: 'group', title: 'Call link', conversationId: null, oneToOne: false, startedBy: null, ended: false, host: false };
  }
  if (callId.startsWith('c_')) {
    const a = await courseAccess(callId.slice(2), user);
    if (!a) throw new NotFoundException('This class call isn’t for one of your classes.');
    return { kind, type: 'class', title: `${a.course.code} · ${a.course.name}`, conversationId: null, oneToOne: false, startedBy: null, ended: false, host: a.canManage };
  }
  const msg = await prisma.message.findUnique({
    where: { id: callId },
    select: {
      type: true, metadata: true, createdAt: true, deletedAt: true, senderId: true,
      sender: { select: { name: true } },
      conversation: { select: { id: true, isGroup: true, name: true, participants: { select: { userId: true, role: true, user: { select: { name: true } } } } } },
    },
  });
  if (!msg || msg.type !== 'CALL' || msg.deletedAt || !msg.conversation.participants.some((p) => p.userId === user.id)) throw new NotFoundException('This call doesn’t exist or isn’t in one of your chats.');
  const meta = (msg.metadata ?? {}) as CallMeta;
  if (!meta.inApp) throw new HttpException('This call has ended. Start a new one from the chat.', 410);
  const ended = !!meta.endedAt || Date.now() - msg.createdAt.getTime() > CALL_HOURS * 3600_000;
  const others = msg.conversation.participants.filter((p) => p.userId !== user.id);
  return {
    kind: meta.kind === 'video' ? 'video' : 'audio',
    type: 'chat',
    title: msg.conversation.isGroup ? msg.conversation.name ?? 'Group call' : others[0]?.user.name ?? 'Call',
    conversationId: msg.conversation.id,
    chatId: msg.conversation.id,
    oneToOne: !msg.conversation.isGroup,
    startedBy: msg.sender.name,
    ended,
    // Group calls: whoever started it, and the chat's admins.
    host: msg.conversation.isGroup && (msg.senderId === user.id || msg.conversation.participants.some((p) => p.userId === user.id && p.role === 'ADMIN')),
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
    // Browsers block port 53 (DNS), so those addresses only time out and slow connecting down.
    const usable = (u: string) => !/:53(\?|$)/.test(u);
    return [...stun, ...turn.map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(usable) })).filter((s) => s.urls.length)];
  } catch (e) {
    console.error('TURN credentials failed:', e);
    return stun;
  }
}

export const sfuEnabled = () => !!process.env.CALLS_APP_ID?.trim() && !!process.env.CALLS_APP_SECRET?.trim();
// The SFU is reachable from almost anywhere (TCP and port 443 included), so it needs no TURN.
const SFU_ICE: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

/** The address for the call's live connection (one use, within 60 seconds) and the ICE servers. */
export async function callTicket(callId: string, user: SessionUser, wantKind?: unknown) {
  const info = await callAccess(callId, user, wantKind);
  if (info.ended) throw new HttpException('This call has ended. Start a new one from the chat.', 410);
  const sfu = sfuEnabled() && !info.oneToOne;
  const max = sfu ? planLimits().callPeers : 6;
  // A breakout room: the call's room says whether it's this person's room (and the room's name);
  // the call's hosts and co-hosts may visit any room.
  const room = breakoutOf(callId);
  let host = info.host, breakout: { parent: string; n: number; name: string } | null = null;
  if (room) {
    const pass = await roomFetch(room.parent, '/breakout-pass', { method: 'POST', body: JSON.stringify({ userId: user.id, host: info.host, n: room.n }) });
    const out = ((await pass?.json().catch(() => null)) ?? {}) as { ok?: boolean; host?: boolean; name?: string; error?: string };
    if (!pass?.ok || !out.ok) throw new HttpException(out.error === 'removed' ? 'The host removed you from this call.' : out.error || 'This breakout room isn’t available.', pass?.status === 404 ? 410 : 403);
    host = out.host === true;
    breakout = { parent: room.parent, n: room.n, name: out.name ?? `Room ${room.n}` };
  }
  const res = await roomFetch(callId, '/ticket', { method: 'POST', body: JSON.stringify({ userId: user.id, name: user.name, host, max }) });
  if (res?.status === 403) throw new HttpException('The host removed you from this call.', 403);
  if (!res?.ok) throw new HttpException('Calls are unavailable right now.', 503);
  const { ticket } = (await res.json()) as { ticket: string };
  return {
    ...info, host, sfu, max, breakout,
    title: breakout ? `${breakout.name} · ${info.title}` : info.title,
    path: `/call-live?call=${encodeURIComponent(callId)}&ticket=${encodeURIComponent(ticket)}`, iceServers: sfu ? SFU_ICE : await iceServers(),
  };
}

/** A new call link (like a FaceTime link): anyone signed in with it may join; its creator hosts. */
export async function createCallLink(user: SessionUser) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const id = `l_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  await roomFetch(id, '/creator', { method: 'POST', body: JSON.stringify({ userId: user.id }) });
  return { id, path: `/call/${id}` };
}

/** Who is in a room call right now (names), for "3 in the room" on voice channels. */
export async function roomPeers(callId: string, user: SessionUser) {
  await callAccess(callId, user);
  const res = await roomFetch(callId, '/peers');
  if (!res?.ok) return { count: 0, names: [] as string[] };
  return (await res.json()) as { count: number; names: string[] };
}

async function chatCall(callId: string, user: SessionUser) {
  if (/^[gcrl]_/.test(callId) || breakoutOf(callId)) throw new BadRequestException('Only chat calls can be declined or ended.');
  await callAccess(callId, user);
  const msg = await prisma.message.findUnique({ where: { id: callId }, select: { metadata: true, conversationId: true } });
  return { meta: (msg?.metadata ?? {}) as CallMeta, conversationId: msg!.conversationId };
}

/** Someone turned the call down: whoever is in it hears so; a one-to-one call shows "Declined". */
export async function declineCall(callId: string, user: SessionUser) {
  const { meta, conversationId } = await chatCall(callId, user);
  await roomFetch(callId, '/notify', { method: 'POST', body: JSON.stringify({ type: 'declined', name: user.name }) });
  if (!meta.endedAt) {
    await prisma.message.update({ where: { id: callId }, data: { metadata: { ...meta, declinedBy: user.name } as Prisma.InputJsonValue } });
    publishChat(conversationId);
  }
  return { ok: true };
}

/** The last person left: how it went, shown on the call in the chat (answered and how long, or missed). */
export async function endCall(callId: string, user: SessionUser, body: Record<string, unknown>) {
  const { meta, conversationId } = await chatCall(callId, user);
  const durationSec = Math.max(0, Math.min(CALL_HOURS * 3600, Math.round(Number(body.durationSec) || 0)));
  const answered = body.answered === true || durationSec > 0;
  if (meta.endedAt && (meta.durationSec ?? 0) >= durationSec) return { ok: true };
  await prisma.message.update({
    where: { id: callId },
    data: { metadata: { ...meta, endedAt: new Date().toISOString(), durationSec, answered } as Prisma.InputJsonValue },
  });
  publishChat(conversationId);
  return { ok: true };
}

/** My calls in the last 30 days (chat calls), newest first, for the Calls list. */
export async function recentCalls(user: SessionUser) {
  const rows = await prisma.message.findMany({
    where: { type: 'CALL', deletedAt: null, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, conversation: { participants: { some: { userId: user.id } } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, metadata: true, createdAt: true, senderId: true,
      sender: { select: { name: true, avatar: true } },
      conversation: { select: { id: true, isGroup: true, name: true, participants: { where: { userId: { not: user.id } }, take: 1, select: { user: { select: { name: true, avatar: true } } } } } },
    },
  });
  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as CallMeta;
    const other = r.conversation.participants[0]?.user;
    return {
      id: r.id,
      at: r.createdAt,
      kind: meta.kind === 'video' ? 'video' : 'audio',
      outgoing: r.senderId === user.id,
      answered: !!meta.answered,
      declined: !!meta.declinedBy,
      durationSec: meta.durationSec ?? null,
      live: !!meta.inApp && !meta.endedAt && Date.now() - r.createdAt.getTime() < CALL_HOURS * 3600_000,
      conversationId: r.conversation.id,
      title: r.conversation.isGroup ? r.conversation.name ?? 'Group' : other?.name ?? r.sender.name,
      avatar: r.conversation.isGroup ? null : other?.avatar ?? null,
      isGroup: r.conversation.isGroup,
    };
  });
}

// ── Call health log (owner console → Calls) ──────────────────────────────────────────────────

const FAILURES = new Set(['media', 'ticket', 'connect', 'dropped']);
const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null);

/** How one person's call went: connection numbers only. One report per person per call. */
export async function recordCallStat(callId: string, user: SessionUser, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const info = await callAccess(callId, user).catch(() => null);
  if (!info) return { ok: false };
  const recent = await prisma.callStat.findFirst({ where: { callId, userId: user.id, createdAt: { gt: new Date(Date.now() - 30_000) } }, select: { id: true } });
  if (recent) return { ok: true };
  // Keep 90 days (checked now and then, not on every report).
  if (Math.random() < 0.02) await prisma.callStat.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } }).catch(() => {});
  const loss = typeof b.worstLoss === 'number' && Number.isFinite(b.worstLoss) ? Math.max(0, Math.min(1, b.worstLoss)) : null;
  await prisma.callStat.create({
    data: {
      callId, userId: user.id,
      type: callId.startsWith('r_') ? 'room' : info.type,
      mode: b.mode === 'sfu' ? 'sfu' : 'p2p',
      peers: int(b.peers, 500) ?? 0,
      seconds: int(b.seconds, 12 * 3600) ?? 0,
      setupMs: int(b.setupMs, 600_000),
      worstRttMs: int(b.worstRttMs, 60_000),
      worstLoss: loss,
      relay: b.relay === true,
      audioOnly: b.audioOnly === true,
      failure: typeof b.failure === 'string' && FAILURES.has(b.failure) ? b.failure : null,
      device: typeof b.device === 'string' ? b.device.slice(0, 40) : null,
    },
  });
  return { ok: true };
}

/** The owner console's Calls tab: the last 14 days of call reports, summed up. */
export async function callHealth() {
  const rows = await prisma.callStat.findMany({
    where: { createdAt: { gt: new Date(Date.now() - 14 * 86_400_000) } }, orderBy: { createdAt: 'desc' }, take: 5000,
    select: { id: true, callId: true, userId: true, type: true, mode: true, peers: true, seconds: true, setupMs: true, worstRttMs: true, worstLoss: true, relay: true, audioOnly: true, failure: true, device: true, createdAt: true },
  });
  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 100) : 0);
  const setups = rows.map((r) => r.setupMs).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const at = (q: number) => (setups.length ? setups[Math.min(setups.length - 1, Math.floor(q * setups.length))] : null);
  const poor = (r: (typeof rows)[number]) => (r.worstLoss ?? 0) > 0.08 || (r.worstRttMs ?? 0) > 400;
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10));
  const count = <K extends string>(key: (r: (typeof rows)[number]) => K | null) => {
    const m = new Map<K, { n: number; failed: number }>();
    for (const r of rows) { const k = key(r); if (!k) continue; const v = m.get(k) ?? { n: 0, failed: 0 }; v.n++; if (r.failure) v.failed++; m.set(k, v); }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.n - a.n);
  };
  const problems = rows.filter((r) => r.failure || poor(r) || r.audioOnly).slice(0, 60);
  const ids = [...new Set(problems.map((r) => r.userId))].slice(0, 90);
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } }) : [];
  const byId = new Map(people.map((u) => [u.id, u]));
  const talked = rows.filter((r) => r.seconds > 0);
  return {
    turn: !!(process.env.TURN_KEY_ID && process.env.TURN_KEY_API_TOKEN),
    joins: rows.length,
    failed: rows.filter((r) => r.failure).length,
    successRate: rows.length ? 100 - pct(rows.filter((r) => r.failure).length) : null,
    setupMedianMs: at(0.5), setupP90Ms: at(0.9),
    poorShare: pct(rows.filter(poor).length),
    relayShare: pct(rows.filter((r) => r.relay).length),
    sfuShare: pct(rows.filter((r) => r.mode === 'sfu').length),
    audioOnly: rows.filter((r) => r.audioOnly).length,
    avgMinutes: talked.length ? Math.round(talked.reduce((n, r) => n + r.seconds, 0) / talked.length / 6) / 10 : null,
    perDay: days.map((d) => {
      const day = rows.filter((r) => r.createdAt.toISOString().slice(0, 10) === d);
      return { day: d, ok: day.filter((r) => !r.failure).length, failed: day.filter((r) => r.failure).length };
    }),
    failures: count((r) => r.failure),
    devices: count((r) => r.device).slice(0, 8),
    types: count((r) => r.type),
    problems: problems.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), user: byId.get(r.userId) ?? null })),
  };
}
