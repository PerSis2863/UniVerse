import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { getSystemUser, isOwnBlobUrl } from '@/lib/chat';
import { planLimits } from '@/lib/plan-limits';
import { MAX_ROLES, ROLE_COLORS, canPost, canSee, parseIds, parseRules } from '@/lib/community-roles';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';

// Communities, like a Discord server or a WhatsApp community: members with roles (owner,
// moderator, member) and channels. A channel is an ordinary group conversation with communityId
// set, so messages, unread counts, live updates, reactions and calls all work in it unchanged;
// members are participants of the channels they can see. Kinds: TEXT, ANNOUNCE (moderators, and
// any roles chosen, post) and VOICE (a drop-in call room, /call/r_<channel id>). Channels aren't
// listed under Chats. Stage 5 · B7.4: the community's own roles with colours, channel categories,
// and private channels (moderators and chosen roles only; src/lib/community-roles.ts).

export type Role = 'OWNER' | 'MOD' | 'MEMBER';
const KINDS = new Set(['TEXT', 'ANNOUNCE', 'VOICE']);
const COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#e11d48', '#ea580c', '#059669', '#0891b2', '#334155'];
const MAX_CHANNELS = 30;
const MAX_MEMBERS = 1000;

const code = () => randomBytes(6).toString('base64url');
const cleanName = (v: unknown, max = 60) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const channelName = (v: unknown) => cleanName(v, 40).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-') || 'channel';

export async function myRole(communityId: string, userId: string): Promise<Role | null> {
  const m = await prisma.communityMember.findUnique({ where: { communityId_userId: { communityId, userId } }, select: { role: true } });
  return (m?.role as Role | undefined) ?? null;
}

export async function requireRole(communityId: string, user: SessionUser, min: 'MEMBER' | 'MOD' | 'OWNER') {
  const role = await myRole(communityId, user.id);
  if (!role) throw new NotFoundException('This community isn’t one of yours.');
  const rank = { MEMBER: 0, MOD: 1, OWNER: 2 };
  if (rank[role] < rank[min]) throw new ForbiddenException(min === 'OWNER' ? 'Only the community’s owner can do that.' : 'Only the community’s moderators can do that.');
  return role;
}

// ── Custom emoji (Stage 4 · 1.2): a community's own, used as :name: in its channels and reactions ──

const EMOJI_NAME = /^[a-z0-9_]{2,32}$/;
export const MAX_COMMUNITY_EMOJI = 50;

export async function listEmoji(user: SessionUser, id: string) {
  await requireRole(id, user, 'MEMBER');
  return prisma.communityEmoji.findMany({ where: { communityId: id }, orderBy: { name: 'asc' }, select: { name: true, url: true } });
}

/** A moderator adds an emoji: a name (letters, numbers, _) and an uploaded picture. */
export async function addEmoji(user: SessionUser, id: string, body: Record<string, unknown>) {
  await requireRole(id, user, 'MOD');
  const name = String(body.name ?? '').trim().toLowerCase().replace(/^:+|:+$/g, '');
  if (!EMOJI_NAME.test(name)) throw new BadRequestException('Use 2–32 lowercase letters, numbers or _ for the name.');
  if (!isOwnBlobUrl(body.url)) throw new BadRequestException('Upload a picture for the emoji.');
  if ((await prisma.communityEmoji.count({ where: { communityId: id } })) >= MAX_COMMUNITY_EMOJI) throw new BadRequestException(`A community can have up to ${MAX_COMMUNITY_EMOJI} emoji.`);
  if (await prisma.communityEmoji.findUnique({ where: { communityId_name: { communityId: id, name } }, select: { id: true } })) throw new BadRequestException(`:${name}: is already one of this community’s emoji.`);
  await prisma.communityEmoji.create({ data: { communityId: id, name, url: String(body.url), createdById: user.id } });
  return listEmoji(user, id);
}

export async function removeEmoji(user: SessionUser, id: string, name: unknown) {
  await requireRole(id, user, 'MOD');
  await prisma.communityEmoji.deleteMany({ where: { communityId: id, name: String(name ?? '') } });
  return listEmoji(user, id);
}

/** Tells members' open tabs to refresh their communities (capped: each live push is a subrequest). */
async function refreshMembers(communityId: string) {
  const ids = await prisma.communityMember.findMany({ where: { communityId }, select: { userId: true }, take: planLimits().livePushes });
  publish(ids.map((m) => m.userId), { type: 'refresh', keys: ['/api/chat/communities*'] });
}

/** My communities with their channels and unread counts. */
export async function listCommunities(user: SessionUser) {
  const memberships = await prisma.communityMember.findMany({
    where: { userId: user.id },
    orderBy: { joinedAt: 'asc' },
    take: 50,
    select: {
      role: true,
      community: {
        select: {
          id: true, name: true, description: true, color: true,
          _count: { select: { members: true } },
          // Private channels only when I'm one of their participants (src/lib/community-roles.ts canSee).
          channels: { where: { OR: [{ channelPrivate: false }, { participants: { some: { userId: user.id } } }] }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, channelKind: true, slowModeSec: true, channelCategory: true, channelPrivate: true } },
        },
      },
    },
  });
  const channelIds = memberships.flatMap((m) => m.community.channels.map((c) => c.id));
  // Unread per channel: others' messages after my last read (the same rule as Chats). 90 channels a
  // statement: D1 takes 100 values, and someone can be in many communities with many channels.
  const parts: string[][] = [];
  for (let i = 0; i < channelIds.length && i < 450; i += 90) parts.push(channelIds.slice(i, i + 90));
  const unread = (await Promise.all(parts.map((part) => prisma.$queryRawUnsafe<{ conversationId: string; n: number }[]>(
    `SELECT m."conversationId", COUNT(*) AS n FROM "messages" m
     JOIN "conversation_participants" p ON p."conversationId" = m."conversationId" AND p."userId" = ?
     WHERE m."conversationId" IN (${part.map(() => '?').join(', ')}) AND m."senderId" <> ? AND m."deletedAt" IS NULL AND m."threadId" IS NULL
       AND julianday(m."createdAt") > COALESCE(julianday(p."lastReadAt"), julianday(p."joinedAt"))
     GROUP BY m."conversationId"`,
    user.id, ...part, user.id,
  )))).flat();
  const unreadOf = new Map(unread.map((u) => [u.conversationId, Number(u.n)]));
  return memberships.map((m) => ({
    id: m.community.id,
    name: m.community.name,
    description: m.community.description,
    color: m.community.color,
    members: m.community._count.members,
    role: m.role as Role,
    channels: m.community.channels.map((c) => ({ id: c.id, name: c.name ?? 'channel', kind: (c.channelKind ?? 'TEXT') as 'TEXT' | 'ANNOUNCE' | 'VOICE', slowModeSec: c.slowModeSec, category: c.channelCategory, private: c.channelPrivate, unread: unreadOf.get(c.id) ?? 0 })),
  }));
}

/**
 * Communities open to the whole network (moderators turned on "Anyone can find and join") that I'm
 * not in yet, biggest first, with the campus of the person who started each.
 */
export async function discoverCommunities(user: SessionUser) {
  const found = await prisma.community.findMany({
    where: { discoverable: true, members: { none: { userId: user.id } } },
    orderBy: { members: { _count: 'desc' } },
    take: 50,
    select: { id: true, name: true, description: true, color: true, createdById: true, _count: { select: { members: true } } },
  });
  const starters = [...new Set(found.map((c) => c.createdById).filter((x): x is string => !!x))];
  const campusOf = new Map(
    starters.length ? (await prisma.user.findMany({ where: { id: { in: starters } }, select: { id: true, campus: { select: { name: true } } } })).map((u) => [u.id, u.campus?.name ?? null]) : [],
  );
  return found.map((c) => ({ id: c.id, name: c.name, description: c.description, color: c.color, members: c._count.members, campus: c.createdById ? campusOf.get(c.createdById) ?? null : null }));
}

/** One community: members (with roles) and, for moderators, the invite code. */
export async function getCommunity(user: SessionUser, id: string) {
  const role = await requireRole(id, user, 'MEMBER');
  const c = await prisma.community.findUnique({
    where: { id },
    select: {
      id: true, name: true, description: true, color: true, inviteCode: true, discoverable: true,
      members: { orderBy: { joinedAt: 'asc' }, take: 300, select: { role: true, roleIds: true, user: { select: { id: true, name: true, avatar: true, role: true, lastSeenAt: true, presence: true, statusText: true, statusEmoji: true } } } },
      roles: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, color: true, position: true } },
      channels: { where: role === 'MEMBER' ? { OR: [{ channelPrivate: false }, { participants: { some: { userId: user.id } } }] } : {}, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, channelKind: true, channelCategory: true, channelPrivate: true, channelRoles: true, slowModeSec: true } },
    },
  });
  if (!c) throw new NotFoundException('This community no longer exists.');
  const known = new Set(c.roles.map((r) => r.id));
  return {
    ...c, inviteCode: role === 'MEMBER' ? null : c.inviteCode, myRole: role,
    members: c.members.map((m) => ({ ...m.user, communityRole: m.role, roleIds: parseIds(m.roleIds).filter((id) => known.has(id)) })),
    channels: c.channels.map((ch) => ({ id: ch.id, name: ch.name ?? 'channel', kind: (ch.channelKind ?? 'TEXT') as 'TEXT' | 'ANNOUNCE' | 'VOICE', category: ch.channelCategory, private: ch.channelPrivate, slowModeSec: ch.slowModeSec, rules: parseRules(ch.channelRoles, known) })),
  };
}

async function addParticipants(channelIds: string[], userIds: string[]) {
  if (!channelIds.length || !userIds.length) return;
  const existing = await prisma.conversationParticipant.findMany({ where: { conversationId: { in: channelIds }, userId: { in: userIds } }, select: { conversationId: true, userId: true } });
  const have = new Set(existing.map((e) => `${e.conversationId}:${e.userId}`));
  const rows = channelIds.flatMap((conversationId) => userIds.filter((userId) => !have.has(`${conversationId}:${userId}`)).map((userId) => ({ conversationId, userId })));
  if (rows.length) await prisma.conversationParticipant.createMany({ data: rows });
}

const chunks = <T,>(xs: T[], n = 90) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));
const asMember = (m: { role: string; roleIds: string | null }) => ({ role: m.role, roleIds: parseIds(m.roleIds) });
const asChannel = (c: { channelKind: string | null; channelPrivate: boolean; channelRoles: string | null }) => ({ channelKind: c.channelKind, channelPrivate: c.channelPrivate, rules: parseRules(c.channelRoles) });

/** Keeps a channel's participants to the members who can see it (after it turns private or public, or its roles change). */
async function syncChannel(channelId: string) {
  const ch = await prisma.conversation.findUnique({ where: { id: channelId }, select: { communityId: true, channelKind: true, channelPrivate: true, channelRoles: true } });
  if (!ch?.communityId) return;
  const [members, current] = await Promise.all([
    prisma.communityMember.findMany({ where: { communityId: ch.communityId }, select: { userId: true, role: true, roleIds: true } }),
    prisma.conversationParticipant.findMany({ where: { conversationId: channelId }, select: { userId: true } }),
  ]);
  const rule = asChannel(ch);
  const want = new Map(members.filter((m) => canSee(rule, asMember(m))).map((m) => [m.userId, m.role]));
  const have = new Set(current.map((p) => p.userId));
  const add = [...want.keys()].filter((u) => !have.has(u));
  const drop = [...have].filter((u) => !want.has(u));
  if (add.length) await prisma.conversationParticipant.createMany({ data: add.map((userId) => ({ conversationId: channelId, userId, role: want.get(userId) === 'MEMBER' ? 'MEMBER' : 'ADMIN' })) });
  for (const part of chunks(drop)) await prisma.conversationParticipant.deleteMany({ where: { conversationId: channelId, userId: { in: part } } });
}

/** Keeps one member's channels to the ones they can see (after their roles change). */
async function syncMember(communityId: string, userId: string) {
  const [member, channels] = await Promise.all([
    prisma.communityMember.findUnique({ where: { communityId_userId: { communityId, userId } }, select: { role: true, roleIds: true } }),
    prisma.conversation.findMany({ where: { communityId }, select: { id: true, channelKind: true, channelPrivate: true, channelRoles: true, participants: { where: { userId }, select: { id: true } } } }),
  ]);
  if (!member) return;
  const me = asMember(member);
  const add = channels.filter((c) => canSee(asChannel(c), me) && !c.participants.length).map((c) => c.id);
  const drop = channels.filter((c) => !canSee(asChannel(c), me) && c.participants.length).map((c) => c.id);
  if (add.length) await prisma.conversationParticipant.createMany({ data: add.map((conversationId) => ({ conversationId, userId, role: me.role === 'MEMBER' ? 'MEMBER' : 'ADMIN' })) });
  if (drop.length) await prisma.conversationParticipant.deleteMany({ where: { userId, conversationId: { in: drop } } });
}

export async function createCommunity(user: SessionUser, body: Record<string, unknown>) {
  const name = cleanName(body.name);
  if (!name) throw new BadRequestException('Give the community a name.');
  const color = COLORS.includes(String(body.color)) ? String(body.color) : COLORS[Math.floor(Math.random() * COLORS.length)];
  const community = await prisma.community.create({
    data: { name, description: cleanName(body.description, 200) || null, color, inviteCode: code(), createdById: user.id, members: { create: { userId: user.id, role: 'OWNER' } } },
    select: { id: true },
  });
  const defaults: [string, string][] = [['general', 'TEXT'], ['announcements', 'ANNOUNCE'], ['Study room', 'VOICE']];
  for (const [i, [n, kind]] of defaults.entries()) {
    await prisma.conversation.create({ data: { isGroup: true, name: n, communityId: community.id, channelKind: kind, position: i, createdById: user.id, participants: { create: { userId: user.id, role: 'ADMIN' } } } });
  }
  const members = Array.isArray(body.memberIds) ? body.memberIds : [];
  if (members.length) await addMembers(user, community.id, { userIds: members });
  return community;
}

export async function addMembers(user: SessionUser, id: string, body: Record<string, unknown>) {
  await requireRole(id, user, 'MOD');
  const system = await getSystemUser();
  const ids = [...new Set<string>((Array.isArray(body.userIds) ? body.userIds : []).filter((x: unknown) => typeof x === 'string'))].filter((x) => x !== system.id).slice(0, 200);
  const people = await prisma.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true } });
  const count = await prisma.communityMember.count({ where: { communityId: id } });
  if (count + people.length > MAX_MEMBERS) throw new BadRequestException(`A community can have up to ${MAX_MEMBERS} members.`);
  const existing = await prisma.communityMember.findMany({ where: { communityId: id, userId: { in: people.map((p) => p.id) } }, select: { userId: true } });
  const fresh = people.map((p) => p.id).filter((u) => !existing.some((e) => e.userId === u));
  if (fresh.length) await prisma.communityMember.createMany({ data: fresh.map((userId) => ({ communityId: id, userId })) });
  // New members have no roles yet, so they see the channels that aren't private.
  const channels = await prisma.conversation.findMany({ where: { communityId: id, channelPrivate: false }, select: { id: true } });
  await addParticipants(channels.map((c) => c.id), fresh);
  await refreshMembers(id);
  return { added: fresh.length };
}

/** Joins with an invite link ({ code }), or a community open to the network ({ communityId }). */
export async function joinCommunity(user: SessionUser, body: Record<string, unknown>) {
  const open = typeof body.communityId === 'string';
  const c = open
    ? await prisma.community.findFirst({ where: { id: String(body.communityId), discoverable: true }, select: { id: true, name: true } })
    : await prisma.community.findUnique({ where: { inviteCode: String(body.code ?? '') }, select: { id: true, name: true } });
  if (!c) throw new NotFoundException(open ? 'This community isn’t open to join any more. Ask a member for an invite link.' : 'This invite link isn’t valid any more.');
  if (!(await myRole(c.id, user.id))) {
    if ((await prisma.communityMember.count({ where: { communityId: c.id } })) >= MAX_MEMBERS) throw new BadRequestException('This community is full.');
    await prisma.communityMember.create({ data: { communityId: c.id, userId: user.id } });
    const channels = await prisma.conversation.findMany({ where: { communityId: c.id, channelPrivate: false }, select: { id: true } });
    await addParticipants(channels.map((ch) => ch.id), [user.id]);
    await refreshMembers(c.id);
  }
  return c;
}

export async function leaveCommunity(user: SessionUser, id: string) {
  const role = await requireRole(id, user, 'MEMBER');
  if (role === 'OWNER') {
    const owners = await prisma.communityMember.count({ where: { communityId: id, role: 'OWNER' } });
    if (owners <= 1) throw new BadRequestException('Make someone else an owner first, or delete the community.');
  }
  await removeFromCommunity(id, user.id);
  return { ok: true };
}

async function removeFromCommunity(id: string, userId: string) {
  const channels = await prisma.conversation.findMany({ where: { communityId: id }, select: { id: true } });
  await prisma.conversationParticipant.deleteMany({ where: { userId, conversationId: { in: channels.map((c) => c.id) } } });
  await prisma.communityMember.deleteMany({ where: { communityId: id, userId } });
  await refreshMembers(id);
}

export async function manageMember(user: SessionUser, id: string, body: Record<string, unknown>) {
  const mine = await requireRole(id, user, 'MOD');
  const target = String(body.userId ?? '');
  const theirs = await myRole(id, target);
  if (!theirs) throw new NotFoundException('They aren’t in this community.');
  if (body.remove === true) {
    if (theirs === 'OWNER' || (theirs === 'MOD' && mine !== 'OWNER')) throw new ForbiddenException('You can’t remove them.');
    await removeFromCommunity(id, target);
    await prisma.communityModLog.create({ data: { communityId: id, actorId: user.id, action: 'remove_member', targetId: target } }).catch(() => null);
    return { ok: true };
  }
  if (mine !== 'OWNER') throw new ForbiddenException('Only the owner can change roles.');
  const role = body.role === 'MOD' || body.role === 'OWNER' ? body.role : 'MEMBER';
  await prisma.communityMember.update({ where: { communityId_userId: { communityId: id, userId: target } }, data: { role } });
  // Moderators see private channels; a former moderator stops seeing them.
  await syncMember(id, target);
  await prisma.communityModLog.create({ data: { communityId: id, actorId: user.id, action: 'role', targetId: target, detail: role } }).catch(() => null);
  await refreshMembers(id);
  return { ok: true };
}

/** A channel's roles from a request, kept to this community's roles. */
async function rolesFrom(communityId: string, body: Record<string, unknown>, before?: string | null) {
  const known = new Set((await prisma.communityRole.findMany({ where: { communityId }, select: { id: true } })).map((r) => r.id));
  const old = parseRules(before, known);
  const ids = (v: unknown, fallback: string[]) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && known.has(x)))] : fallback);
  return JSON.stringify({ view: ids(body.viewRoles, old.view), post: ids(body.postRoles, old.post) });
}
const categoryName = (v: unknown) => cleanName(v, 30) || null;

export async function createChannel(user: SessionUser, id: string, body: Record<string, unknown>) {
  await requireRole(id, user, 'MOD');
  const kind = KINDS.has(String(body.kind)) ? String(body.kind) : 'TEXT';
  const count = await prisma.conversation.count({ where: { communityId: id } });
  if (count >= MAX_CHANNELS) throw new BadRequestException(`A community can have up to ${MAX_CHANNELS} channels.`);
  const members = await prisma.communityMember.findMany({ where: { communityId: id }, select: { userId: true, role: true, roleIds: true } });
  const channelPrivate = body.private === true;
  const channelRoles = await rolesFrom(id, body);
  const rule = { channelKind: kind, channelPrivate, rules: parseRules(channelRoles) };
  const channel = await prisma.conversation.create({
    data: {
      isGroup: true, name: kind === 'VOICE' ? cleanName(body.name, 40) || 'Voice room' : channelName(body.name), communityId: id, channelKind: kind, position: count, createdById: user.id,
      channelCategory: categoryName(body.category), channelPrivate, channelRoles,
      participants: { create: members.filter((m) => canSee(rule, asMember(m))).map((m) => ({ userId: m.userId, role: m.role === 'MEMBER' ? 'MEMBER' : 'ADMIN' })) },
    },
    select: { id: true },
  });
  await refreshMembers(id);
  return channel;
}

export async function updateChannel(user: SessionUser, channelId: string, body: Record<string, unknown>) {
  const ch = await prisma.conversation.findUnique({ where: { id: channelId }, select: { communityId: true, channelKind: true, channelPrivate: true, channelRoles: true, position: true } });
  if (!ch?.communityId) throw new NotFoundException('Channel not found.');
  await requireRole(ch.communityId, user, 'MOD');
  if (body.move === 'up' || body.move === 'down') {
    // Swaps places with the channel above or below.
    const all = await prisma.conversation.findMany({ where: { communityId: ch.communityId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
    const i = all.findIndex((c) => c.id === channelId);
    const j = body.move === 'up' ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < all.length) {
      [all[i], all[j]] = [all[j], all[i]];
      await prisma.$executeRawUnsafe(`UPDATE conversations SET position = (SELECT key FROM json_each(?1) WHERE value = conversations.id) WHERE "communityId" = ?2 AND id IN (SELECT value FROM json_each(?1))`, JSON.stringify(all.map((c) => c.id)), ch.communityId);
    }
    await refreshMembers(ch.communityId);
    return { ok: true };
  }
  if (body.delete === true) {
    const left = await prisma.conversation.count({ where: { communityId: ch.communityId } });
    if (left <= 1) throw new BadRequestException('A community needs at least one channel.');
    await prisma.conversation.delete({ where: { id: channelId } });
  } else {
    const data: { name?: string; slowModeSec?: number; channelCategory?: string | null; channelPrivate?: boolean; channelRoles?: string } = {};
    if (body.name !== undefined) data.name = ch.channelKind === 'VOICE' ? cleanName(body.name, 40) || 'Voice room' : channelName(body.name);
    if (body.slowModeSec !== undefined) data.slowModeSec = [0, 10, 30, 60, 300, 900].includes(Number(body.slowModeSec)) ? Number(body.slowModeSec) : 0;
    if (body.category !== undefined) data.channelCategory = categoryName(body.category);
    if (typeof body.private === 'boolean') data.channelPrivate = body.private;
    if (body.viewRoles !== undefined || body.postRoles !== undefined) data.channelRoles = await rolesFrom(ch.communityId, body, ch.channelRoles);
    await prisma.conversation.update({ where: { id: channelId }, data });
    // Who sees it may have changed: its participants follow.
    if (data.channelPrivate !== undefined || data.channelRoles !== undefined) await syncChannel(channelId);
  }
  await refreshMembers(ch.communityId);
  return { ok: true };
}

export async function updateCommunity(user: SessionUser, id: string, body: Record<string, unknown>) {
  if (body.delete === true) {
    await requireRole(id, user, 'OWNER');
    await prisma.community.delete({ where: { id } });
    publish([user.id], { type: 'refresh', keys: ['/api/chat/communities*'] });
    return { ok: true };
  }
  await requireRole(id, user, 'MOD');
  const data: { name?: string; description?: string | null; color?: string; inviteCode?: string; discoverable?: boolean } = {};
  if (typeof body.discoverable === 'boolean') data.discoverable = body.discoverable;
  if (body.name !== undefined) data.name = cleanName(body.name) || 'Community';
  if (body.description !== undefined) data.description = cleanName(body.description, 200) || null;
  if (COLORS.includes(String(body.color))) data.color = String(body.color);
  if (body.newInvite === true) data.inviteCode = code();
  const c = await prisma.community.update({ where: { id }, data, select: { inviteCode: true } });
  await refreshMembers(id);
  return { ok: true, inviteCode: c.inviteCode };
}

/**
 * The rules a channel adds when sending a message (src/app/api/chat/conversations/[id]/messages):
 * announcements are for moderators, and slow mode spaces out one person's messages.
 */
export async function channelSendCheck(conversationId: string, userId: string, opts: { slowMode?: boolean } = {}): Promise<string | null> {
  const ch = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { communityId: true, channelKind: true, slowModeSec: true, channelPrivate: true, channelRoles: true } });
  if (!ch?.communityId) return null;
  const member = await prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: ch.communityId, userId } }, select: { role: true, timeoutUntil: true, roleIds: true } });
  const role = (member?.role as Role | undefined) ?? null;
  if (ch.channelKind === 'VOICE') return 'This is a voice room: join the call to talk.';
  // Timed out by a moderator (Stage 4 · 1.13): can read, can't post.
  if (member?.timeoutUntil && member.timeoutUntil > new Date()) return `A moderator timed you out: you can post again in ${Math.max(1, Math.ceil((member.timeoutUntil.getTime() - Date.now()) / 60_000))} min.`;
  // Announcements: moderators, and members with a role the moderators chose (Stage 5 · B7.4).
  if (ch.channelKind === 'ANNOUNCE' && member && !canPost(asChannel(ch), asMember(member))) return 'Only moderators can post in announcements.';
  if (ch.channelKind === 'ANNOUNCE' && !member) return 'Only moderators can post in announcements.';
  // Scheduled messages are spaced out when they're scheduled instead (src/server/scheduled-messages.ts).
  if (opts.slowMode !== false && ch.slowModeSec > 0 && role === 'MEMBER') {
    const last = await prisma.message.findFirst({ where: { conversationId, senderId: userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    const wait = last ? Math.ceil((last.createdAt.getTime() + ch.slowModeSec * 1000 - Date.now()) / 1000) : 0;
    if (wait > 0) return `Slow mode is on: you can send another message in ${wait} s.`;
  }
  return null;
}

// ── The community's own roles (Stage 5 · B7.4) ──────────────────────────────────────────────

/**
 * POST /api/chat/communities/:id { action: 'role-create', name, color } | { action: 'role-update', roleId, name?, color? }
 * | { action: 'role-delete', roleId } | { action: 'member-roles', userId, roleIds }. Moderators.
 */
export async function communityRoleAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  await requireRole(id, user, 'MOD');
  const color = (v: unknown) => (ROLE_COLORS.includes(String(v)) ? String(v) : null);
  const roleId = typeof b.roleId === 'string' ? b.roleId : '';
  switch (b.action) {
    case 'role-create': {
      const name = cleanName(b.name, 30);
      if (!name) throw new BadRequestException('Name the role.');
      const count = await prisma.communityRole.count({ where: { communityId: id } });
      if (count >= MAX_ROLES) throw new BadRequestException(`A community can have up to ${MAX_ROLES} roles.`);
      const r = await prisma.communityRole.create({ data: { communityId: id, name, color: color(b.color) ?? ROLE_COLORS[count % ROLE_COLORS.length], position: count }, select: { id: true, name: true, color: true, position: true } });
      await refreshMembers(id);
      return r;
    }
    case 'role-update': {
      const data: { name?: string; color?: string } = {};
      if (b.name !== undefined) { const n = cleanName(b.name, 30); if (!n) throw new BadRequestException('Name the role.'); data.name = n; }
      if (color(b.color)) data.color = color(b.color)!;
      const res = await prisma.communityRole.updateMany({ where: { id: roleId, communityId: id }, data });
      if (!res.count) throw new NotFoundException('That role isn’t in this community.');
      await refreshMembers(id);
      return { ok: true };
    }
    case 'role-delete': {
      const res = await prisma.communityRole.deleteMany({ where: { id: roleId, communityId: id } });
      if (!res.count) throw new NotFoundException('That role isn’t in this community.');
      // Off everyone who had it, in one statement; then private channels it opened lose those members.
      await prisma.$executeRawUnsafe(`UPDATE community_members SET "roleIds" = (SELECT json_group_array(value) FROM json_each(community_members."roleIds") WHERE value <> ?1) WHERE "communityId" = ?2 AND "roleIds" LIKE ?3`, roleId, id, `%${roleId}%`);
      const affected = await prisma.conversation.findMany({ where: { communityId: id, channelPrivate: true, channelRoles: { contains: roleId } }, select: { id: true } });
      for (const c of affected.slice(0, 10)) await syncChannel(c.id);
      await refreshMembers(id);
      return { ok: true };
    }
    case 'member-roles': {
      const target = typeof b.userId === 'string' ? b.userId : '';
      if (!(await myRole(id, target))) throw new NotFoundException('They aren’t in this community.');
      const known = new Set((await prisma.communityRole.findMany({ where: { communityId: id }, select: { id: true } })).map((r) => r.id));
      const ids = (Array.isArray(b.roleIds) ? b.roleIds : []).filter((x): x is string => typeof x === 'string' && known.has(x));
      await prisma.communityMember.update({ where: { communityId_userId: { communityId: id, userId: target } }, data: { roleIds: JSON.stringify([...new Set(ids)]) } });
      await syncMember(id, target);
      await prisma.communityModLog.create({ data: { communityId: id, actorId: user.id, action: 'roles', targetId: target, detail: ids.join(',') || 'none' } }).catch(() => null);
      await refreshMembers(id);
      return { ok: true };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}
