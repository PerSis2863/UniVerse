import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException } from './http';
import { strings, type Body } from './body';
import { num, short } from './trace';
import { publish } from './realtime';
import { notify } from './email';
import { pushService } from './services/push.service';

// Hyperion Signals → IoT (M475): a person's channels, each with up to 8 named fields, and the readings devices send
// with the channel's write key over HTTPS (POST JSON, or a plain GET for the smallest boards). The key is shown once
// and only its SHA-256 is kept, like a password; a channel takes at most one reading a second and keeps the newest
// 20,000. Only the channel's owner reads it back. Every query uses Prisma's placeholders.

export const MAX_CHANNELS = 10, MAX_FIELDS = 8, KEEP = 20_000, MIN_GAP_MS = 1000;
const hash = (key: string) => crypto.createHash('sha256').update(key).digest('hex');
/** A new write key: 20 characters from an alphabet without look-alikes (about 100 bits). */
function newKey() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.randomBytes(20);
  return Array.from(bytes, (b) => abc[b % 32]).join('');
}
const fieldsOf = (v: unknown) => {
  const f = strings(v).map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, MAX_FIELDS);
  if (!f.length) throw new BadRequestException('Name at least one field (what the device measures, such as “Temperature”).');
  return f;
};
const view = (c: { id: string; name: string; description: string | null; fields: string; keyHint: string; entries: number; lastEntryAt: Date | null; createdAt: Date }) => ({
  id: c.id, name: c.name, description: c.description, fields: JSON.parse(c.fields) as string[], keyHint: c.keyHint, entries: c.entries, lastEntryAt: c.lastEntryAt, createdAt: c.createdAt,
});
async function own(user: SessionUser, id: string) {
  const c = await prisma.iotChannel.findFirst({ where: { id, userId: user.id } });
  if (!c) throw new NotFoundException('That channel isn’t yours or doesn’t exist.');
  return c;
}

/** GET /iot/channels */
export async function myChannels(user: SessionUser) {
  const list = await prisma.iotChannel.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  return { channels: list.map(view), max: MAX_CHANNELS };
}
/** POST /iot/channels { name, description?, fields: string[] }: the write key comes back this once. */
export async function createChannel(user: SessionUser, body: Body) {
  const name = short(body.name, 80);
  if (!name) throw new BadRequestException('Give the channel a name.');
  const fields = fieldsOf(body.fields);
  if ((await prisma.iotChannel.count({ where: { userId: user.id } })) >= MAX_CHANNELS) throw new BadRequestException(`You have ${MAX_CHANNELS} channels already: delete one first.`);
  const key = newKey();
  const c = await prisma.iotChannel.create({ data: { userId: user.id, name, description: short(body.description, 300), fields: JSON.stringify(fields), keyHash: hash(key), keyHint: key.slice(0, 4) } });
  return { channel: view(c), writeKey: key };
}
/** PATCH /iot/channels/:id { name?, description?, fields? } */
export async function updateChannel(user: SessionUser, id: string, body: Body) {
  await own(user, id);
  const data: { name?: string; description?: string | null; fields?: string } = {};
  if (body.name !== undefined) { const n = short(body.name, 80); if (!n) throw new BadRequestException('Give the channel a name.'); data.name = n; }
  if (body.description !== undefined) data.description = short(body.description, 300);
  if (body.fields !== undefined) data.fields = JSON.stringify(fieldsOf(body.fields));
  return { channel: view(await prisma.iotChannel.update({ where: { id }, data })) };
}
/** POST /iot/channels/:id/key: a new write key (the old one stops working). */
export async function renewKey(user: SessionUser, id: string) {
  await own(user, id);
  const key = newKey();
  const c = await prisma.iotChannel.update({ where: { id }, data: { keyHash: hash(key), keyHint: key.slice(0, 4) } });
  return { channel: view(c), writeKey: key };
}
/** DELETE /iot/channels/:id (its readings go with it). */
export async function deleteChannel(user: SessionUser, id: string) {
  await own(user, id);
  await prisma.iotChannel.delete({ where: { id } });
  return { ok: true };
}
/** GET /iot/channels/:id/entries?after=<id>&limit=: the newest readings (up to 2,000), oldest first. */
export async function channelEntries(user: SessionUser, id: string, after?: string, limit?: string) {
  const c = await own(user, id);
  const n = Math.min(2000, Math.max(1, Number(limit) || 500)), from = Number(after) || 0;
  const rows = await prisma.iotEntry.findMany({ where: { channelId: id, ...(from ? { id: { gt: from } } : {}) }, orderBy: { id: 'desc' }, take: n });
  return { channel: view(c), entries: rows.reverse().map((r) => ({ id: r.id, at: r.at, values: [r.f1, r.f2, r.f3, r.f4, r.f5, r.f6, r.f7, r.f8].slice(0, (JSON.parse(c.fields) as string[]).length) })) };
}

/** POST /iot/write/:key { field1…field8 } (or GET with them in the address): a device's reading. */
export async function writeEntry(key: string, body: Body) {
  if (!/^[A-Z2-9]{20}$/.test(key)) throw new NotFoundException('Unknown write key.');
  const c = await prisma.iotChannel.findUnique({ where: { keyHash: hash(key) }, select: { id: true, userId: true, fields: true, lastEntryAt: true } });
  if (!c) throw new NotFoundException('Unknown write key.');
  const n = (JSON.parse(c.fields) as string[]).length, vals: (number | null)[] = [];
  for (let i = 1; i <= MAX_FIELDS; i++) vals.push(i <= n ? num(body[`field${i}`] ?? body[`f${i}`], -1e15, 1e15) : null);
  if (vals.every((v) => v === null)) throw new BadRequestException(`Send at least one number as field1…field${n}.`);
  const now = new Date();
  // One reading a second at most: claimed with a conditional update (D1 has no transactions).
  const since = new Date(now.getTime() - MIN_GAP_MS);
  const claimed = await prisma.iotChannel.updateMany({ where: { id: c.id, OR: [{ lastEntryAt: null }, { lastEntryAt: { lt: since } }] }, data: { lastEntryAt: now, entries: { increment: 1 } } });
  if (!claimed.count) return { ok: false, error: 'Too fast: a channel takes one reading a second.' };
  const e = await prisma.iotEntry.create({ data: { channelId: c.id, at: now, f1: vals[0], f2: vals[1], f3: vals[2], f4: vals[3], f5: vals[4], f6: vals[5], f7: vals[6], f8: vals[7] } });
  // Now and then, drop what is past the newest KEEP readings.
  if (e.id % 200 === 0) {
    const edge = await prisma.iotEntry.findFirst({ where: { channelId: c.id }, orderBy: { id: 'desc' }, skip: KEEP, select: { id: true } });
    if (edge) { const gone = await prisma.iotEntry.deleteMany({ where: { channelId: c.id, id: { lte: edge.id } } }); await prisma.iotChannel.update({ where: { id: c.id }, data: { entries: { decrement: gone.count } } }); }
  }
  publish([c.userId], { type: 'refresh', keys: [`/iot/channels/${c.id}*`, '/iot/channels'] });
  await checkAlerts(c.id, c.userId, JSON.parse(c.fields) as string[], vals, now);
  return { ok: true, entry: e.id };
}

// ——— M522: alerts ———
export const MAX_ALERTS = 10;
const OPS = ['>', '<', '>=', '<='] as const;
type Op = (typeof OPS)[number];
const breaks = (op: string, x: number, v: number) => (op === '>' ? x > v : op === '<' ? x < v : op === '>=' ? x >= v : x <= v);
const alertView = (a: { id: string; field: number; op: string; value: number; note: string | null; quietMinutes: number; lastFiredAt: Date | null; fired: number }) =>
  ({ id: a.id, field: a.field, op: a.op, value: a.value, note: a.note, quietMinutes: a.quietMinutes, lastFiredAt: a.lastFiredAt, fired: a.fired });
/** A reading's rules: each one it breaks tells the owner, claimed by a conditional update so two readings at once tell once. */
async function checkAlerts(channelId: string, userId: string, fields: string[], vals: (number | null)[], now: Date) {
  const rules = await prisma.iotAlert.findMany({ where: { channelId } });
  for (const a of rules) {
    const x = vals[a.field - 1];
    if (x === null || x === undefined || !breaks(a.op, x, a.value)) continue;
    const quiet = new Date(now.getTime() - a.quietMinutes * 60_000);
    const claimed = await prisma.iotAlert.updateMany({ where: { id: a.id, OR: [{ lastFiredAt: null }, { lastFiredAt: { lt: quiet } }] }, data: { lastFiredAt: now, fired: { increment: 1 } } });
    if (!claimed.count) continue;
    const name = fields[a.field - 1] ?? `field ${a.field}`, title = `${name} is ${x} (${a.op} ${a.value})`, body = a.note || `A reading on your IoT channel broke the rule ${name} ${a.op} ${a.value}.`;
    await notify(userId, { title, body, link: '/hyperion/signals?tab=iot', type: 'info', email: false });
    await pushService.sendToMany([userId], { title, body, url: '/hyperion/signals?tab=iot', tag: `iot-${a.id}` }).catch(() => 0);
  }
}
/** GET /iot/channels/:id/alerts */
export async function channelAlerts(user: SessionUser, id: string) {
  await own(user, id);
  const list = await prisma.iotAlert.findMany({ where: { channelId: id }, orderBy: { createdAt: 'asc' } });
  return { alerts: list.map(alertView), max: MAX_ALERTS };
}
/** POST /iot/channels/:id/alerts { field (1–8), op ('>', '<', '>=', '<='), value, note?, quietMinutes? } */
export async function addAlert(user: SessionUser, id: string, body: Body) {
  const c = await own(user, id), n = (JSON.parse(c.fields) as string[]).length;
  const field = num(body.field, 1, n), value = num(body.value, -1e15, 1e15), op = OPS.find((o) => o === body.op) as Op | undefined;
  if (field === null || !Number.isInteger(field)) throw new BadRequestException(`Choose one of the channel's fields (1 to ${n}).`);
  if (!op) throw new BadRequestException('The rule is above (>) or below (<) a value.');
  if (value === null) throw new BadRequestException('Give the value the reading is compared with.');
  if ((await prisma.iotAlert.count({ where: { channelId: id } })) >= MAX_ALERTS) throw new BadRequestException(`A channel has at most ${MAX_ALERTS} alerts: delete one first.`);
  const quiet = num(body.quietMinutes, 1, 1440);
  const a = await prisma.iotAlert.create({ data: { channelId: id, field, op, value, note: short(body.note, 200), quietMinutes: quiet === null ? 15 : Math.round(quiet) } });
  return { alert: alertView(a) };
}
/** DELETE /iot/alerts/:id (only the channel owner's). */
export async function deleteAlert(user: SessionUser, alertId: string) {
  const a = await prisma.iotAlert.findFirst({ where: { id: alertId, channel: { userId: user.id } }, select: { id: true } });
  if (!a) throw new NotFoundException('That alert isn’t yours or doesn’t exist.');
  await prisma.iotAlert.delete({ where: { id: alertId } });
  return { ok: true };
}
