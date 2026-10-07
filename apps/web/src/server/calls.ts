import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { isMinor, schoolPolicy } from './safety';
import { featureOff } from './moderation';
import { planLimits } from '@/lib/plan-limits';
import { publishChat } from './realtime';
import { impactCallAccess } from './impact-rooms';

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
//   hc_<course id> / hg_<group id>   a class's or study group's Study Hall (4.2): a 2D campus where
//                  voice gets louder as you walk closer (src/components/hall/HallView.tsx).
//   o_<teacher id> a teacher's office hours (4.7): their students queue in the waiting room while
//                  they're open (src/server/office-hours.ts); "Next student" lets the next one in.
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
  if (callId.startsWith('o_')) {
    // Office hours: the teacher (host, any time) and, while they're open, their students.
    const teacher = await prisma.user.findUnique({ where: { id: callId.slice(2) }, select: { id: true, name: true, role: true, officeHours: { select: { open: true, until: true, topic: true } } } });
    if (!teacher || (teacher.role !== 'TEACHER' && teacher.role !== 'ADMIN')) throw new NotFoundException('These office hours don’t exist.');
    const host = teacher.id === user.id;
    const oh = teacher.officeHours;
    if (!host) {
      const theirs = user.role === 'ADMIN' || !!(await prisma.enrollment.findFirst({ where: { studentId: user.id, course: { teacherId: teacher.id } }, select: { id: true } }));
      if (!theirs) throw new NotFoundException('These office hours are for this teacher’s students.');
      if (!oh?.open || (oh.until && oh.until < new Date())) throw new HttpException(`${teacher.name}’s office hours are closed right now.`, 410);
    }
    return { kind, type: 'group', title: `Office hours · ${teacher.name}${oh?.topic ? ` · ${oh.topic}` : ''}`, conversationId: null, oneToOne: false, startedBy: null, ended: false, host };
  }
  if (/^h[cg]_/.test(callId)) {
    // A Study Hall: whoever may join the class's or group's call; voice only; chat in the hall itself.
    const space = await callAccess(`${callId[1]}_${callId.slice(3)}`, user, 'audio');
    return { ...space, kind: 'audio', title: `Study Hall · ${space.title}`, chatId: null };
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
  if (callId.startsWith('i_')) {
    // An impact room's call (Stage 4 · 4.12): staff run it, the room's followers join.
    const a = await impactCallAccess(callId.slice(2), user);
    return { kind, type: 'group', title: a.title, conversationId: null, chatId: null, oneToOne: false, startedBy: null, ended: false, host: a.host };
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
  // Safe by default (4.10): whether I'm under 18, and whether the school allows recording calls with
  // students under 18 (the call room stops recordings otherwise; never shown to anyone).
  const [me, policy] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { role: true, dateOfBirth: true } }), schoolPolicy()]);
  const minor = !!me && isMinor(me, policy);
  const res = await roomFetch(callId, '/ticket', { method: 'POST', body: JSON.stringify({ userId: user.id, name: user.name, host, max, minor, recMinors: policy.recordMinors }) });
  if (res?.status === 403) throw new HttpException('The host removed you from this call.', 403);
  if (!res?.ok) throw new HttpException('Calls are unavailable right now.', 503);
  const { ticket, audience } = (await res.json()) as { ticket: string; audience?: boolean };
  return {
    ...info, host, sfu, max, breakout,
    // A webinar's audience (2.10): joins watching, without camera or microphone.
    audience: sfu && audience === true,
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

/**
 * Questions from the class's own quizzes, to ask live in its class call as a quick quiz (2.7): the
 * teacher (the call's host) only, since they include the right answers.
 */
export async function callQuestions(callId: string, user: SessionUser) {
  const info = await callAccess(callId, user);
  const id = breakoutOf(callId)?.parent ?? callId;
  if (!id.startsWith('c_') || !info.host) return { quizzes: [] };
  const quizzes = await prisma.quiz.findMany({
    where: { courseId: id.slice(2) }, orderBy: { createdAt: 'desc' }, take: 10,
    select: { id: true, title: true, questions: { orderBy: { order: 'asc' }, take: 30, select: { id: true, question: true, options: true, correctAnswer: true } } },
  });
  return {
    quizzes: quizzes
      .map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        questions: quiz.questions.flatMap((x) => {
          const options = (Array.isArray(x.options) ? (x.options as unknown[]) : []).map((o) => String(o)).slice(0, 6);
          const correct = options.indexOf(x.correctAnswer);
          return options.length >= 2 && correct >= 0 ? [{ id: x.id, q: x.question.slice(0, 200), options: options.map((o) => o.slice(0, 80)), correct }] : [];
        }),
      }))
      .filter((quiz) => quiz.questions.length > 0),
  };
}

/**
 * A Study Hall table's whiteboard (4.2): made the first time someone opens it, by them, with "anyone
 * with the link can edit" (everyone in the hall gets the link). The hall's room remembers it.
 */
export async function hallTableBoard(hallId: string, user: SessionUser, n: unknown) {
  if (!/^h[cg]_/.test(hallId)) throw new BadRequestException('That isn’t a Study Hall.');
  const table = Number(n);
  if (!Number.isInteger(table) || table < 1 || table > 12) throw new BadRequestException('That table doesn’t exist.');
  const info = await callAccess(hallId, user);
  const known = await roomFetch(hallId, `/hall-board?n=${table}`);
  const had = ((await known?.json().catch(() => null)) as { boardId?: string | null } | null)?.boardId;
  if (had && (await prisma.board.findUnique({ where: { id: had }, select: { id: true } }))) return { boardId: had };
  const board = await prisma.board.create({ data: { title: `Table ${table} · ${info.title}`.slice(0, 120), ownerId: user.id, linkAccess: 'EDIT' }, select: { id: true } });
  const res = await roomFetch(hallId, `/hall-board?n=${table}`, { method: 'POST', body: JSON.stringify({ boardId: board.id }) });
  const kept = ((await res?.json().catch(() => null)) as { boardId?: string } | null)?.boardId ?? board.id;
  // Someone else made it a moment before: theirs is kept.
  if (kept !== board.id) await prisma.board.delete({ where: { id: board.id } }).catch(() => {});
  return { boardId: kept };
}

// ── Guest links (Stage 4 · 2.11) ────────────────────────────────────────────────────────────────
// A call link's creator invites people without an account: /guest/<call>?g=<token>. Guests give a
// name, always wait until a host lets them in, never see the call's earlier chat, and the link
// expires. The call room keeps the links and limits tickets per network address and per link.

const LINK_ID = /^l_[A-Za-z0-9_-]{10,40}$/;
const GUEST_TOKEN = /^[a-f0-9]{20}$/;

/** A guest link (its creator only): valid 1 hour, 1 day or 1 week. */
export async function createGuestLink(callId: string, user: SessionUser, hours: unknown) {
  if (!LINK_ID.test(callId)) throw new BadRequestException('Guests can join call links only.');
  if ((await callPeople(callId)).creator !== user.id) throw new ForbiddenException('Only whoever made this call link can invite guests.');
  const h = [1, 24, 168].includes(Number(hours)) ? Number(hours) : 24;
  const res = await roomFetch(callId, '/guest-link', { method: 'POST', body: JSON.stringify({ by: user.id, hours: h }) });
  if (!res?.ok) throw new HttpException('Calls are unavailable right now.', 503);
  const { token, exp } = (await res.json()) as { token: string; exp: number };
  return { path: `/guest/${callId}?g=${token}`, token, expiresAt: new Date(exp).toISOString(), hours: h };
}

/** Takes a guest link back (its creator only). */
export async function revokeGuestLink(callId: string, user: SessionUser, token: string) {
  if (!LINK_ID.test(callId) || !GUEST_TOKEN.test(token)) throw new BadRequestException('That isn’t a guest link.');
  if ((await callPeople(callId)).creator !== user.id) throw new ForbiddenException('Only whoever made this call link can do that.');
  await roomFetch(callId, '/guest-link', { method: 'POST', body: JSON.stringify({ revoke: token }) });
  return { ok: true };
}

/** No account needed: whether a guest link still works (for the join page). */
export async function guestLinkState(callId: string, token: string) {
  if (!LINK_ID.test(callId) || !GUEST_TOKEN.test(token)) return { ok: false as const };
  const res = await roomFetch(callId, '/guest-ticket', { method: 'POST', body: JSON.stringify({ token, check: true }) });
  const out = (await res?.json().catch(() => null)) as { exp?: number } | null;
  return res?.ok && out?.exp ? { ok: true as const, expiresAt: new Date(out.exp).toISOString() } : { ok: false as const };
}

/** No account needed: a guest's ticket (into the waiting room). `ip`: for the call room's limits. */
export async function guestTicket(callId: string, token: unknown, name: unknown, ip: string | null) {
  if (!LINK_ID.test(callId) || typeof token !== 'string' || !GUEST_TOKEN.test(token)) throw new NotFoundException('This guest link isn’t valid.');
  if (await featureOff('calls')) throw new HttpException('Voice and video calls: turned off on UniVerse for now. Please try again later.', 503);
  const sfu = sfuEnabled();
  const max = sfu ? planLimits().callPeers : 6;
  const res = await roomFetch(callId, '/guest-ticket', { method: 'POST', body: JSON.stringify({ token, name: String(name ?? ''), ip: ip ?? 'unknown', max }) });
  if (res?.status === 410) throw new HttpException('This guest link has expired. Ask for a new one.', 410);
  if (res?.status === 429) throw new HttpException('Too many people tried to join with this link just now. Wait a few minutes and try again.', 429);
  if (res?.status === 400) throw new BadRequestException('Type your name (at least 2 letters) so the host knows who you are.');
  if (!res?.ok) throw new HttpException('Calls are unavailable right now.', 503);
  const { ticket } = (await res.json()) as { ticket: string };
  return {
    kind: 'video' as const, type: 'group' as const, title: 'Call', oneToOne: false, conversationId: null, chatId: null, startedBy: null, ended: false,
    host: false, sfu, max, breakout: null, guest: true,
    path: `/call-live?call=${encodeURIComponent(callId)}&ticket=${encodeURIComponent(ticket)}`, iceServers: sfu ? SFU_ICE : await iceServers(),
  };
}

/** Office hours (4.7): how many wait and are in a turn now, or closing the line (those waiting are told). */
export async function officeRoom(teacherId: string, close = false): Promise<{ waiting: number; inTurn: number; avgMin: number }> {
  const res = await roomFetch(`o_${teacherId}`, '/office', close ? { method: 'POST', body: '{}' } : undefined);
  const out = (await res?.json().catch(() => null)) as { waiting?: number; inTurn?: number; avgMin?: number } | null;
  return { waiting: out?.waiting ?? 0, inTurn: out?.inTurn ?? 0, avgMin: out?.avgMin ?? 5 };
}

/** Who is in the call now (account ids), and who made it if it's a call link: for meeting notes and recordings. */
export async function callPeople(callId: string): Promise<{ ids: string[]; creator: string | null }> {
  const res = await roomFetch(callId, '/people');
  const out = (await res?.json().catch(() => null)) as { ids?: string[]; creator?: string | null } | null;
  return { ids: Array.isArray(out?.ids) ? out.ids : [], creator: out?.creator ?? null };
}

/** Watch together (4.8): the videos a call can watch from its course (class calls: the course's videos,
 *  recordings of classes included). YouTube links work in any call. */
export async function callVideos(callId: string, user: SessionUser) {
  await callAccess(callId, user);
  const base = breakoutOf(callId)?.parent ?? callId;
  if (!base.startsWith('c_')) return { videos: [] };
  const rows = await prisma.material.findMany({ where: { courseId: base.slice(2), type: 'VIDEO' }, orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, title: true, fileUrl: true, createdAt: true } });
  return { videos: rows.map((v) => ({ id: v.id, title: v.title, url: v.fileUrl, createdAt: v.createdAt })) };
}

/** Who is in a room call right now (names), for "3 in the room" on voice channels. */
export async function roomPeers(callId: string, user: SessionUser) {
  await callAccess(callId, user);
  // Office hours: who's with the teacher is between them.
  if (callId.startsWith('o_') && callId.slice(2) !== user.id) return { count: 0, names: [] as string[] };
  const res = await roomFetch(callId, '/peers');
  if (!res?.ok) return { count: 0, names: [] as string[] };
  return (await res.json()) as { count: number; names: string[] };
}

async function chatCall(callId: string, user: SessionUser) {
  if (/^(h[cg]|[gcrlo])_/.test(callId) || breakoutOf(callId)) throw new BadRequestException('Only chat calls can be declined or ended.');
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

export type CallKind = 'chat' | 'class' | 'group' | 'room' | 'link' | 'hall' | 'office';
const kindOfCall = (id: string): CallKind => (id.startsWith('o_') ? 'office' : /^h[cg]_/.test(id) ? 'hall' : id.startsWith('c_') ? 'class' : id.startsWith('g_') ? 'group' : id.startsWith('r_') ? 'room' : id.startsWith('l_') ? 'link' : 'chat');

/** One call in my history (Calls, Stage 4 · 2.13). */
export interface CallHistoryRow {
  /** Unique per meeting (class and group rooms keep one id for every meeting). */
  key: string;
  callId: string;
  type: CallKind;
  at: Date;
  kind: 'audio' | 'video' | null;
  title: string; avatar: string | null; isGroup: boolean;
  /** Chat calls: the chat, and how the call went. */
  conversationId: string | null; outgoing: boolean; answered: boolean; declined: boolean; live: boolean; missed: boolean;
  /** How long I was in it (a chat call: how long it lasted). */
  durationSec: number | null;
  /** Who else joined (names), and how many more. */
  people: string[]; more: number;
  noteId: string | null; recordingId: string | null;
  /** A class's study pack from that meeting. */
  study: { courseId: string; sessionId: string } | null;
}

const MEETING_GAP_MS = 30 * 60_000;
/** Splits a long list into pieces D1 accepts in one query (at most 100 values). */
const chunks = <T,>(xs: T[], n = 90) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * My calls in the last 30 days, newest first: every call I was in (chat calls, classes, study groups,
 * voice rooms, call links; from the call log each app sends when it leaves) and the chat calls I
 * missed, with how long I was in each, who else joined, and its meeting notes, recording or study
 * pack. In a class or group room, stays less than 30 minutes apart are one meeting.
 */
export async function recentCalls(user: SessionUser): Promise<CallHistoryRow[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const parentOf = (id: string) => breakoutOf(id)?.parent ?? id;
  const [messages, mine] = await Promise.all([
    prisma.message.findMany({
      where: { type: 'CALL', deletedAt: null, createdAt: { gte: since }, conversation: { participants: { some: { userId: user.id } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, metadata: true, createdAt: true, senderId: true,
        sender: { select: { name: true, avatar: true } },
        conversation: { select: { id: true, isGroup: true, name: true, participants: { where: { userId: { not: user.id } }, take: 1, select: { user: { select: { name: true, avatar: true } } } } } },
      },
    }),
    prisma.callStat.findMany({ where: { userId: user.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 300, select: { callId: true, seconds: true, createdAt: true } }),
  ]);

  // My meetings: my stays in each call, joined when less than 30 minutes apart.
  const stays = new Map<string, { start: number; end: number; seconds: number }[]>();
  for (const r of mine) {
    const end = r.createdAt.getTime();
    const id = parentOf(r.callId);
    stays.set(id, [...(stays.get(id) ?? []), { start: end - r.seconds * 1000, end, seconds: r.seconds }]);
  }
  const meetings: { callId: string; start: number; end: number; seconds: number }[] = [];
  for (const [callId, list] of stays) {
    let last: (typeof meetings)[number] | null = null;
    for (const st of list.sort((a, b) => a.start - b.start)) {
      if (last && st.start - last.end < MEETING_GAP_MS) { last.end = Math.max(last.end, st.end); last.seconds += st.seconds; continue; }
      last = { callId, ...st };
      meetings.push(last);
    }
  }

  // Who else was there (their call logs, breakout rooms included), and names, titles, notes, recordings.
  const ids = [...stays.keys()];
  // A Study Hall belongs to its class or group (hc_<course>, hg_<group>).
  const courseIds = [...new Set(ids.filter((i) => /^h?c_/.test(i)).map((i) => i.slice(i.indexOf('_') + 1)))];
  const groupIds = [...new Set(ids.filter((i) => /^h?g_/.test(i)).map((i) => i.slice(i.indexOf('_') + 1)))];
  const roomIds = ids.filter((i) => i.startsWith('r_')).map((i) => i.slice(2));
  const officeIds = ids.filter((i) => i.startsWith('o_')).map((i) => i.slice(2));
  const [others, notes, recordings, sessions, courses, groups, rooms] = await Promise.all([
    Promise.all(chunks(ids, 40).map((c) => prisma.callStat.findMany({
      where: { createdAt: { gte: since }, userId: { not: user.id }, OR: c.flatMap((id) => [{ callId: id }, { callId: { startsWith: `${id}~b` } }]) },
      select: { callId: true, userId: true, createdAt: true, seconds: true }, take: 2000,
    }))).then((x) => x.flat()),
    Promise.all(chunks(ids).map((c) => prisma.callNote.findMany({ where: { callId: { in: c }, createdAt: { gte: since } }, select: { id: true, callId: true, createdAt: true } }))).then((x) => x.flat()),
    Promise.all(chunks(ids).map((c) => prisma.callRecording.findMany({ where: { callId: { in: c }, createdAt: { gte: since } }, select: { id: true, callId: true, createdAt: true } }))).then((x) => x.flat()),
    Promise.all(chunks(courseIds).map((c) => prisma.classSession.findMany({ where: { courseId: { in: c }, startedAt: { gte: new Date(since.getTime() - 86_400_000) }, status: 'READY' }, select: { id: true, courseId: true, startedAt: true } }))).then((x) => x.flat()),
    Promise.all(chunks(courseIds).map((c) => prisma.course.findMany({ where: { id: { in: c } }, select: { id: true, code: true, name: true } }))).then((x) => x.flat()),
    Promise.all(chunks(groupIds).map((c) => prisma.group.findMany({ where: { id: { in: c } }, select: { id: true, name: true } }))).then((x) => x.flat()),
    Promise.all(chunks(roomIds).map((c) => prisma.conversation.findMany({ where: { id: { in: c } }, select: { id: true, name: true, community: { select: { name: true } } } }))).then((x) => x.flat()),
  ]);
  const names = new Map((await Promise.all(chunks([...new Set([...others.map((o) => o.userId), ...officeIds])]).map((c) => prisma.user.findMany({ where: { id: { in: c } }, select: { id: true, name: true } })))).flat().map((u) => [u.id, u.name]));

  const near = (t: number, m: { start: number; end: number }, before: number, after: number) => t >= m.start - before && t <= m.end + after;
  const extras = (m: { callId: string; start: number; end: number }) => {
    const who = [...new Set(others
      .filter((o) => parentOf(o.callId) === m.callId && o.createdAt.getTime() >= m.start - 10 * 60_000 && o.createdAt.getTime() - o.seconds * 1000 <= m.end + 10 * 60_000)
      .map((o) => names.get(o.userId)).filter((n): n is string => !!n))];
    const note = notes.filter((n) => n.callId === m.callId && near(n.createdAt.getTime(), m, 3600_000, 3 * 3600_000)).at(-1);
    const rec = recordings.filter((r) => r.callId === m.callId && near(r.createdAt.getTime(), m, 3600_000, 3 * 3600_000)).at(-1);
    const pack = m.callId.startsWith('c_') ? sessions.find((x) => x.courseId === m.callId.slice(2) && near(x.startedAt.getTime(), m, 30 * 60_000, 30 * 60_000)) : undefined;
    return { people: who.slice(0, 6), more: Math.max(0, who.length - 6), noteId: note?.id ?? null, recordingId: rec?.id ?? null, study: pack ? { courseId: pack.courseId, sessionId: pack.id } : null };
  };
  const blank = { conversationId: null, outgoing: false, answered: true, declined: false, live: false, missed: false, avatar: null };

  const rows: CallHistoryRow[] = [];
  // Chat calls, answered or missed (their own record says how they went).
  for (const r of messages) {
    const meta = (r.metadata ?? {}) as CallMeta;
    const other = r.conversation.participants[0]?.user;
    const live = !!meta.inApp && !meta.endedAt && Date.now() - r.createdAt.getTime() < CALL_HOURS * 3600_000;
    const outgoing = r.senderId === user.id;
    const m = meetings.find((x) => x.callId === r.id);
    rows.push({
      key: r.id, callId: r.id, type: 'chat', at: r.createdAt, kind: meta.kind === 'video' ? 'video' : 'audio',
      title: r.conversation.isGroup ? r.conversation.name ?? 'Group' : other?.name ?? r.sender.name,
      avatar: r.conversation.isGroup ? null : other?.avatar ?? null, isGroup: r.conversation.isGroup,
      conversationId: r.conversation.id, outgoing, answered: !!meta.answered, declined: !!meta.declinedBy, live,
      missed: !outgoing && !meta.answered && !live,
      durationSec: meta.durationSec ?? m?.seconds ?? null,
      ...(m ? extras(m) : { people: [], more: 0, noteId: null, recordingId: null, study: null }),
    });
  }
  // Every other call I was in.
  for (const m of meetings) {
    const type = kindOfCall(m.callId);
    if (type === 'chat') continue;
    const space = m.callId.replace(/^h/, '');
    const course = courses.find((c) => `c_${c.id}` === space);
    const group = groups.find((g) => `g_${g.id}` === space);
    const voice = rooms.find((x) => `r_${x.id}` === m.callId);
    const base = course ? `${course.code} · ${course.name}` : group ? group.name : voice ? `${voice.name ?? 'Voice room'}${voice.community ? ` · ${voice.community.name}` : ''}` : type === 'link' ? 'Call link' : 'Call';
    const title = type === 'hall' ? `Study Hall · ${base}` : type === 'office' ? `Office hours · ${names.get(m.callId.slice(2)) ?? 'a teacher'}` : base;
    rows.push({ key: `${m.callId}@${m.start}`, callId: m.callId, type, at: new Date(m.start), kind: null, title, isGroup: true, durationSec: m.seconds, ...blank, ...extras(m) });
  }
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 100);
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
