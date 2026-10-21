import crypto from 'node:crypto';
import prisma from '@/lib/db';
import { getSystemUser, membership, visibleTo } from '@/lib/chat';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { computeWebhookSignature } from './webhooks';
import { chatMuted, featureOff } from './moderation';
import { channelSendCheck } from './communities';
import { publishChat } from './realtime';

// Chat apps (Stage 5 · Q20, B7.3): a school adds its own slash commands in Admin → Integrations →
// Chat apps. Typing "/<command> …" in a chat sends the command, signed like the school's webhooks
// (UniVerse-Signature: t=<seconds>,v1=<HMAC-SHA256 of "<t>.<body>">), to the app's https address;
// the app answers with JSON { text, visibility? } within 5 seconds and the answer is posted in the
// chat, labelled with the app's name (or shown only to the person who typed it).
//
// What an app receives is only what its permissions allow: always the command, its text, who typed
// it (id, first name, role) and the chat's id and name; with "read_recent" also the last 10 messages.
// It can post for everyone only with "post"; otherwise its answers are for the person who asked.
// Never: email addresses, private (end-to-end encrypted) chats, announcement channels.

export const BUILT_IN_COMMANDS = ['ask', 'catchup', 'remind', 'poll', 'call', 'video', 'shrug'];
export const APP_PERMISSIONS = ['post', 'read_recent'] as const;
export type AppPermission = (typeof APP_PERMISSIONS)[number];
export type AppCommand = { name: string; hint: string };
const MAX_APPS = 20;
const TIMEOUT_MS = 5000;
const MAX_REPLY = 2000;

const parseList = <T,>(raw: string | null | undefined, keep: (x: unknown) => x is T): T[] => {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter(keep) : [];
  } catch {
    return [];
  }
};
const isCommand = (x: unknown): x is AppCommand => !!x && typeof (x as AppCommand).name === 'string' && typeof (x as AppCommand).hint === 'string';
const isPermission = (x: unknown): x is AppPermission => APP_PERMISSIONS.includes(x as AppPermission);
export const commandsOf = (raw: string | null | undefined) => parseList(raw, isCommand);
export const permissionsOf = (raw: string | null | undefined) => parseList(raw, isPermission);

/** 1–5 commands: lower-case letters, digits and dashes, not one of UniVerse's own, each once. */
export function cleanCommands(raw: unknown): AppCommand[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: AppCommand[] = [];
  for (const c of list.slice(0, 5)) {
    const name = String((c as { name?: unknown })?.name ?? '').trim().replace(/^\//, '').toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,19}$/.test(name)) throw new BadRequestException(`“/${name}”: a command is 2–20 letters, digits or dashes, starting with a letter.`);
    if (BUILT_IN_COMMANDS.includes(name)) throw new BadRequestException(`“/${name}” is one of UniVerse’s own commands.`);
    if (out.some((x) => x.name === name)) continue;
    out.push({ name, hint: String((c as { hint?: unknown })?.hint ?? '').trim().slice(0, 80) });
  }
  if (!out.length) throw new BadRequestException('Add at least one command.');
  return out;
}

/** The app's address: https only (plain http to this machine only while testing locally). */
export function cleanAppUrl(raw: unknown, local = process.env.DEMO_LOGIN_ENABLED === 'true'): string {
  let u: URL;
  try {
    u = new URL(String(raw ?? '').trim());
  } catch {
    throw new BadRequestException('Enter the app’s web address (https://…).');
  }
  const here = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(local && here && u.protocol === 'http:')) throw new BadRequestException('The app’s address must start with https://');
  if (u.username || u.password) throw new BadRequestException('Leave the user name and password out of the address.');
  return u.toString().slice(0, 500);
}

/** What the app answered: JSON { text, visibility } or plain text, shortened; null when empty. */
export function parseAppReply(body: string, contentType: string | null): { text: string; everyone: boolean | null } | null {
  let text = body;
  let everyone: boolean | null = null;
  if ((contentType ?? '').includes('json')) {
    try {
      const j = JSON.parse(body) as { text?: unknown; visibility?: unknown };
      text = typeof j.text === 'string' ? j.text : '';
      if (j.visibility === 'me') everyone = false;
      else if (j.visibility === 'everyone') everyone = true;
    } catch {
      return null;
    }
  }
  text = text.trim().slice(0, MAX_REPLY);
  return text ? { text, everyone } : null;
}

/** The schools a person belongs to: the one they're in, and the one they run (school admins). */
async function schoolsOf(user: SessionUser): Promise<string[]> {
  const owned = user.role === 'ADMIN' ? await prisma.organization.findUnique({ where: { ownerId: user.id }, select: { id: true } }) : null;
  return [...new Set([user.organizationId, owned?.id].filter((x): x is string => !!x))];
}

const adminView = (a: { id: string; name: string; description: string | null; url: string; commands: string; permissions: string; enabled: boolean; lastCalledAt: Date | null; lastStatus: string | null; createdAt: Date }) => ({
  id: a.id, name: a.name, description: a.description, url: a.url, commands: commandsOf(a.commands), permissions: permissionsOf(a.permissions),
  enabled: a.enabled, lastCalledAt: a.lastCalledAt, lastStatus: a.lastStatus, createdAt: a.createdAt,
});

export async function listApps(orgId: string) {
  const apps = await prisma.chatApp.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' }, take: MAX_APPS });
  return { apps: apps.map(adminView), permissions: APP_PERMISSIONS, builtIn: BUILT_IN_COMMANDS };
}

/** No two apps of a school may answer the same command. */
async function checkFree(orgId: string, commands: AppCommand[], exceptId?: string) {
  const others = await prisma.chatApp.findMany({ where: { organizationId: orgId, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true, commands: true }, take: MAX_APPS });
  for (const o of others) {
    const taken = commandsOf(o.commands).find((c) => commands.some((x) => x.name === c.name));
    if (taken) throw new BadRequestException(`“/${taken.name}” is already used by ${o.name}.`);
  }
}

/** Adds an app. Its signing secret is returned this once (like webhook secrets). */
export async function createApp(orgId: string, userId: string, b: Record<string, unknown>) {
  const name = String(b.name ?? '').trim().slice(0, 60);
  if (!name) throw new BadRequestException('Give the app a name.');
  if ((await prisma.chatApp.count({ where: { organizationId: orgId } })) >= MAX_APPS) throw new BadRequestException(`A school can have up to ${MAX_APPS} chat apps.`);
  const commands = cleanCommands(b.commands);
  await checkFree(orgId, commands);
  const app = await prisma.chatApp.create({
    data: {
      organizationId: orgId, name, description: String(b.description ?? '').trim().slice(0, 200) || null, url: cleanAppUrl(b.url),
      secret: `appsec_${crypto.randomBytes(24).toString('hex')}`, commands: JSON.stringify(commands),
      permissions: JSON.stringify(Array.isArray(b.permissions) ? [...new Set(b.permissions.filter(isPermission))] : []), createdById: userId,
    },
  });
  return { ...adminView(app), secret: app.secret };
}

export async function updateApp(orgId: string, id: string, b: Record<string, unknown>) {
  const app = await prisma.chatApp.findFirst({ where: { id, organizationId: orgId } });
  if (!app) throw new NotFoundException('App not found.');
  const data: Record<string, unknown> = {};
  if (typeof b.enabled === 'boolean') data.enabled = b.enabled;
  if (b.name !== undefined) data.name = String(b.name).trim().slice(0, 60) || app.name;
  if (b.description !== undefined) data.description = String(b.description ?? '').trim().slice(0, 200) || null;
  if (b.url !== undefined) data.url = cleanAppUrl(b.url);
  if (Array.isArray(b.permissions)) data.permissions = JSON.stringify([...new Set(b.permissions.filter(isPermission))]);
  if (b.commands !== undefined) {
    const commands = cleanCommands(b.commands);
    await checkFree(orgId, commands, id);
    data.commands = JSON.stringify(commands);
  }
  let secret: string | undefined;
  if (b.newSecret === true) data.secret = secret = `appsec_${crypto.randomBytes(24).toString('hex')}`;
  const saved = await prisma.chatApp.update({ where: { id }, data });
  return { ...adminView(saved), ...(secret ? { secret } : {}) };
}

export async function deleteApp(orgId: string, id: string) {
  const { count } = await prisma.chatApp.deleteMany({ where: { id, organizationId: orgId } });
  if (!count) throw new NotFoundException('App not found.');
  return { ok: true };
}

/** Sends the app a signed request and reads its answer (never throws; times out after 5 s). */
async function deliver(app: { id: string; url: string; secret: string }, event: string, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  let status: string;
  let reply: ReturnType<typeof parseAppReply> = null;
  try {
    const res = await fetch(app.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'UniVerse-Apps/1.0', 'UniVerse-Signature': computeWebhookSignature(body, app.secret, t), 'UniVerse-Event': event },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'manual',
    });
    status = String(res.status);
    if (res.ok) reply = parseAppReply((await res.text()).slice(0, 16_000), res.headers.get('content-type'));
    else void res.body?.cancel();
  } catch (e) {
    status = (e as Error).name === 'TimeoutError' ? 'timeout' : 'unreachable';
  }
  await prisma.chatApp.update({ where: { id: app.id }, data: { lastCalledAt: new Date(), lastStatus: status } }).catch(() => {});
  return { status, reply };
}

/** "Send a test": a ping the app should answer with any 2xx. */
export async function testApp(orgId: string, id: string) {
  const app = await prisma.chatApp.findFirst({ where: { id, organizationId: orgId } });
  if (!app) throw new NotFoundException('App not found.');
  const { status, reply } = await deliver(app, 'ping', { type: 'ping', id: crypto.randomUUID(), createdAt: new Date().toISOString(), app: { id: app.id } });
  return { ok: /^2\d\d$/.test(status), status, reply: reply?.text ?? null };
}

/** The commands of the apps a person's school has switched on (for the "/" menu). */
export async function commandsFor(user: SessionUser) {
  if (user.role === 'GUARDIAN') return { commands: [] };
  const orgs = await schoolsOf(user);
  if (!orgs.length) return { commands: [] };
  const apps = await prisma.chatApp.findMany({ where: { organizationId: { in: orgs }, enabled: true }, select: { id: true, name: true, commands: true }, take: MAX_APPS * 2 });
  const seen = new Set<string>();
  const commands = apps.flatMap((a) => commandsOf(a.commands).map((c) => ({ name: c.name, hint: c.hint || `${a.name}`, app: a.name })))
    .filter((c) => !seen.has(c.name) && seen.add(c.name));
  return { commands };
}

/**
 * POST /api/chat/conversations/:id/app { command, text }: runs a school app's command in a chat.
 * Returns { posted: true } when the answer went into the chat, or { text, app } for the person only.
 */
export async function runCommand(user: SessionUser, conversationId: string, b: Record<string, unknown>) {
  const command = String(b.command ?? '').trim().replace(/^\//, '').toLowerCase();
  const text = String(b.text ?? '').trim().slice(0, 1000);
  const me = await membership(conversationId, user.id);
  if (!me) throw new NotFoundException('Conversation not found.');
  const orgs = await schoolsOf(user);
  const apps = orgs.length ? await prisma.chatApp.findMany({ where: { organizationId: { in: orgs }, enabled: true }, take: MAX_APPS * 2 }) : [];
  const app = apps.find((a) => commandsOf(a.commands).some((c) => c.name === command));
  if (!app) throw new NotFoundException(`There’s no /${command} app in your school.`);
  const [convo, system] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true, name: true, isGroup: true, private: true, communityId: true } }),
    getSystemUser(),
  ]);
  if (!convo) throw new NotFoundException('Conversation not found.');
  if (convo.private) throw new ForbiddenException('Apps can’t be used in private (end-to-end encrypted) chats.');
  if (await prisma.conversationParticipant.findFirst({ where: { conversationId, userId: system.id }, select: { id: true } })) throw new ForbiddenException('This is an announcements-only channel.');
  const perms = permissionsOf(app.permissions);
  let recent: { from: string; text: string; at: Date }[] = [];
  if (perms.includes('read_recent')) {
    const rows = await prisma.message.findMany({
      where: { conversationId, deletedAt: null, type: 'TEXT', threadId: null, ...visibleTo(user.id) }, orderBy: { createdAt: 'desc' }, take: 10,
      select: { body: true, createdAt: true, sender: { select: { name: true } } },
    });
    recent = rows.reverse().map((m) => ({ from: m.sender.name.split(' ')[0], text: m.body.slice(0, 500), at: m.createdAt }));
  }
  const org = await prisma.organization.findUnique({ where: { id: app.organizationId }, select: { id: true, name: true } });
  const { status, reply } = await deliver(app, 'chat.command', {
    type: 'chat.command', id: crypto.randomUUID(), createdAt: new Date().toISOString(), app: { id: app.id }, school: org,
    command, text, user: { id: user.id, name: user.name.split(' ')[0], role: user.role }, chat: { id: convo.id, name: convo.name, isGroup: convo.isGroup },
    ...(perms.includes('read_recent') ? { recent } : {}),
  });
  if (!reply) {
    throw new HttpException(status === 'timeout' ? `${app.name} didn’t answer in time. Try again in a moment.` : /^2\d\d$/.test(status) ? `${app.name} had nothing to say.` : `${app.name} isn’t answering right now.`, 502);
  }
  const everyone = perms.includes('post') && reply.everyone !== false;
  if (!everyone) return { text: reply.text, app: app.name };
  // Posting for everyone follows the same rules as sending a message.
  if (await featureOff('chat', user.organizationId)) throw new HttpException('Sending messages is turned off for now.', 503);
  const muted = await chatMuted(user.id);
  if (muted) throw new ForbiddenException(muted);
  if (convo.communityId) {
    const why = await channelSendCheck(conversationId, user.id);
    if (why) throw new ForbiddenException(why);
  }
  await prisma.message.create({
    data: { conversationId, senderId: system.id, type: 'TEXT', body: reply.text, metadata: { app: { id: app.id, name: app.name }, command, askedBy: user.name, question: text.slice(0, 200) } },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  publishChat(conversationId);
  return { posted: true, app: app.name };
}
