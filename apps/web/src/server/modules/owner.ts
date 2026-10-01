import type { Router } from '../router';
import { diagnoseErrors } from '../errors';
import prisma from '@/lib/db';
import { BadRequestException, ForbiddenException, NotFoundException } from '../http';
import { forgetUser, isOwnerEmail } from '../auth';
import schema from '../owner-schema.json';
import { decideDeletion, eraseAccount } from '../account-deletion';
import { publishChat } from '../realtime';
import { FEATURE_SWITCHES, parseSwitches } from '@/lib/feature-switches';
import { forgetRules } from '../moderation';
import { countTables, selectColumns } from '../table-stats';
import { serverSettings } from '../server-settings';

// The owner console (hidden; see RouteOptions.owner): everything about every account, the
// sign-in and activity history, private conversations, and a record editor for any table in the
// database. Every edit or delete is stored in owner_changes with the record before and after, so
// it can be undone. For everyone else these routes answer 404.

type Field = { name: string; type: string; kind: 'scalar' | 'enum' | 'object'; list: boolean; optional: boolean; id: boolean; unique: boolean; hasDefault: boolean; updatedAt: boolean; relationFields?: string[] };
type Model = { name: string; delegate: string; table: string; fields: Field[] };
const MODELS = (schema.models as Model[]);
const ENUMS = schema.enums as Record<string, string[]>;
// Changes & undo filters: which tables each kind of change touches.
const AREA_MODELS: Record<string, string[]> = {
  people: ['User', 'Notification'],
  chats: ['Message', 'Conversation', 'ConversationParticipant'],
  server: ['ServerControl'],
};
const byName = new Map(MODELS.map((m) => [m.name, m]));

/** Tables that can't be edited here (binary files, and the history of these edits itself). */
const LOCKED = new Set(['OwnerChange', 'StoredFile']);
const owned = { owner: true } as const;

function model(name: string): Model {
  const m = byName.get(name);
  if (!m) throw new NotFoundException(`Unknown table ${name}`);
  return m;
}
const delegate = (m: Model) => (prisma as unknown as Record<string, any>)[m.delegate]; // eslint-disable-line @typescript-eslint/no-explicit-any -- dynamic table access
const columns = (m: Model) => m.fields.filter((f) => f.kind !== 'object' && f.type !== 'Bytes');
const select = (m: Model) => Object.fromEntries(columns(m).map((f) => [f.name, true]));
const hasField = (m: Model, name: string) => m.fields.some((f) => f.name === name);

/** Converts a value from the editor to what the database column expects. */
function coerce(f: Field, v: unknown): unknown {
  if (v === '' || v === undefined) v = null;
  if (v === null) {
    if (!f.optional && !f.list) throw new BadRequestException(`${f.name} can't be empty`);
    return null;
  }
  if (f.kind === 'enum') {
    if (!ENUMS[f.type]?.includes(String(v))) throw new BadRequestException(`${f.name} must be one of ${ENUMS[f.type]?.join(', ')}`);
    return String(v);
  }
  switch (f.type) {
    case 'String':
      return String(v);
    case 'Int': {
      const n = Number(v);
      if (!Number.isInteger(n)) throw new BadRequestException(`${f.name} must be a whole number`);
      return n;
    }
    case 'Float':
    case 'Decimal': {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new BadRequestException(`${f.name} must be a number`);
      return n;
    }
    case 'Boolean':
      return v === true || v === 'true';
    case 'DateTime': {
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`${f.name} must be a date`);
      return d;
    }
    case 'Json':
      if (typeof v === 'string') {
        try {
          return JSON.parse(v);
        } catch {
          throw new BadRequestException(`${f.name} must be valid JSON`);
        }
      }
      return v;
    default:
      return v;
  }
}

/** A stored snapshot back into column values (dates come back as strings). */
function revive(m: Model, snapshot: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of columns(m)) {
    if (!(f.name in snapshot)) continue;
    const v = snapshot[f.name];
    if (f.type === 'Json' && v === null) continue; // Prisma refuses a plain null here: see clearJson
    out[f.name] = f.type === 'DateTime' && typeof v === 'string' ? new Date(v) : v;
  }
  return out;
}

/** Empties the JSON columns that were empty in a snapshot (revive leaves them out). */
async function clearJson(m: Model, id: string, snapshot: Record<string, unknown>) {
  const cols = columns(m).filter((f) => f.type === 'Json' && f.name in snapshot && snapshot[f.name] === null);
  if (cols.length) await prisma.$executeRawUnsafe(`UPDATE "${m.table}" SET ${cols.map((f) => `"${f.name}" = NULL`).join(', ')} WHERE "id" = ?`, id);
}

/** Stops the owner from locking themselves out, and keeps the owner account safe. */
async function guardUserEdit(m: Model, id: string, data: Record<string, unknown>) {
  if (m.name !== 'User') return;
  const u = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (u && isOwnerEmail(u.email) && (('role' in data && data.role !== 'ADMIN') || ('status' in data && data.status !== 'ACTIVE') || ('email' in data && !isOwnerEmail(String(data.email))))) {
    throw new ForbiddenException("The owner account's role, status and email can't be changed here.");
  }
}

export default function ownerModule(router: Router) {
  const r = router.controller('owner', owned);

  // ── Account deletion requests ──
  r.get('deletion-requests', ({ query }) => prisma.accountDeletionRequest.findMany({
    where: query.status === 'all' ? {} : { status: String(query.status || 'PENDING') },
    orderBy: { createdAt: 'desc' }, take: 200,
    include: { user: { select: { id: true, role: true, status: true, createdAt: true, lastSeenAt: true, _count: { select: { loginEvents: true } } } } },
  }));
  r.patch<{ id: string }>('deletion-requests/:id', async ({ params, body, user }) => {
    const decision = body?.decision === 'approve' ? 'approve' : body?.decision === 'decline' ? 'decline' : null;
    if (!decision) throw new BadRequestException('Choose approve or decline.');
    const done = await decideDeletion(params.id, decision, user, typeof body?.note === 'string' ? body.note.trim() : null);
    if (!done) throw new NotFoundException('This request was already handled.');
    return done;
  });

  // ── Overview & live activity ──

  // ── Error monitoring (src/server/errors.ts) ──
  r.get('errors', async ({ query }) => {
    const status = typeof query.status === 'string' && ['NEW', 'DIAGNOSED', 'RESOLVED', 'IGNORED', 'OPEN'].includes(query.status) ? query.status : 'OPEN';
    const where = status === 'OPEN' ? { status: { in: ['NEW', 'DIAGNOSED'] } } : { status };
    const day = new Date(Date.now() - 86_400_000);
    const [items, counts, recent] = await Promise.all([
      prisma.errorReport.findMany({ where, orderBy: [{ lastSeen: 'desc' }], take: 200 }),
      prisma.errorReport.groupBy({ by: ['status'], _count: { _all: true } }),
      // For the summary and the 14-day chart (one row per problem, so this stays small).
      prisma.errorReport.findMany({ where: { lastSeen: { gt: new Date(Date.now() - 14 * 86_400_000) } }, select: { firstSeen: true, lastSeen: true, source: true, count: true, users: true, severity: true, status: true } }),
    ]);
    // Who ran into each problem last (name and role, to see if it's one person or many).
    const userIds = [...new Set(items.map((e) => e.lastUserId).filter((x): x is string => !!x))];
    const people = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds.slice(0, 90) } }, select: { id: true, name: true, email: true, role: true } }) : [];
    const byId = new Map(people.map((u) => [u.id, u]));
    const open = recent.filter((e) => e.status === 'NEW' || e.status === 'DIAGNOSED');
    const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10));
    return {
      items: items.map((e) => ({ ...e, lastUser: e.lastUserId ? byId.get(e.lastUserId) ?? null : null })),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      summary: {
        seenToday: recent.filter((e) => e.lastSeen > day).length,
        newToday: recent.filter((e) => e.firstSeen > day).length,
        openServer: open.filter((e) => e.source === 'SERVER').length,
        openBrowser: open.filter((e) => e.source !== 'SERVER').length,
        openHigh: open.filter((e) => e.severity === 'high').length,
        peopleAffected: open.reduce((n, e) => n + e.users, 0),
        timesSeen: open.reduce((n, e) => n + e.count, 0),
        // New problems per day, and problems still happening per day (by last time seen).
        perDay: days.map((d) => ({ day: d, new: recent.filter((e) => e.firstSeen.toISOString().slice(0, 10) === d).length, seen: recent.filter((e) => e.lastSeen.toISOString().slice(0, 10) === d).length })),
      },
    };
  });

  /** Resolve, ignore or reopen several problems at once. */
  r.post('errors/bulk', async ({ body }) => {
    const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 90) : [];
    const status = body?.status;
    if (!ids.length || !['NEW', 'RESOLVED', 'IGNORED'].includes(status)) throw new BadRequestException('Choose problems and a status.');
    const { count } = await prisma.errorReport.updateMany({ where: { id: { in: ids } }, data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : null } });
    return { updated: count };
  });

  r.post('errors/diagnose', async ({ body }) => {
    const ids = Array.isArray((body as { ids?: unknown })?.ids) ? ((body as { ids: unknown[] }).ids.filter((x) => typeof x === 'string') as string[]).slice(0, 10) : undefined;
    if (!process.env.GEMINI_API_KEY) throw new BadRequestException('AI diagnosis needs the GEMINI_API_KEY secret.');
    return { diagnosed: await diagnoseErrors(ids ? { ids } : { limit: 10 }) };
  });

  r.patch<{ id: string }>('errors/:id', async ({ params, body }) => {
    const status = (body as { status?: unknown })?.status;
    if (typeof status !== 'string' || !['NEW', 'RESOLVED', 'IGNORED'].includes(status)) throw new BadRequestException('Invalid status.');
    return prisma.errorReport.update({ where: { id: params.id }, data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : null } });
  });

  r.get('overview', async () => {
    const now = Date.now();
    const day = new Date(now - 86_400_000);
    const month = new Date(now - 30 * 86_400_000);
    const [roles, statuses, online, signInsToday, newUsers, messagesToday, pendingApps, recentSignIns, recentActions, openErrors, pendingDeletions, joined, countries, devices, guard] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.user.findMany({ where: { lastSeenAt: { gt: new Date(now - 5 * 60_000) } }, select: { id: true, name: true, role: true, lastSeenAt: true }, orderBy: { lastSeenAt: 'desc' }, take: 50 }),
      prisma.loginEvent.count({ where: { createdAt: { gt: day } } }),
      prisma.user.count({ where: { createdAt: { gt: new Date(now - 7 * 86_400_000) } } }),
      prisma.message.count({ where: { createdAt: { gt: day } } }),
      prisma.roleApplication.count({ where: { status: 'PENDING' } }),
      prisma.loginEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 15, include: { user: { select: { id: true, name: true, role: true, email: true } } } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
      prisma.errorReport.count({ where: { status: { in: ['NEW', 'DIAGNOSED'] } } }),
      prisma.accountDeletionRequest.count({ where: { status: 'PENDING' } }),
      prisma.user.findMany({ where: { createdAt: { gt: new Date(now - 14 * 86_400_000) } }, select: { createdAt: true, role: true } }),
      prisma.loginEvent.groupBy({ by: ['country'], where: { createdAt: { gt: month } }, _count: { _all: true } }),
      prisma.loginEvent.groupBy({ by: ['device'], where: { createdAt: { gt: month } }, _count: { _all: true } }),
      prisma.usageGuard.findUnique({ where: { id: 'main' } }).catch(() => null),
    ]);
    // New accounts per day for the last 14 days (oldest first).
    const signUps = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now - (13 - i) * 86_400_000).toISOString().slice(0, 10);
      return { day: d, count: joined.filter((u) => u.createdAt.toISOString().slice(0, 10) === d).length };
    });
    const top = (rows: { _count: { _all: number } }[], key: (r: never) => string | null) =>
      rows.map((r) => ({ name: key(r as never) ?? 'Unknown', count: r._count._all })).sort((a, b) => b.count - a.count).slice(0, 6);
    return {
      roles: Object.fromEntries(roles.map((x) => [x.role, x._count._all])),
      statuses: Object.fromEntries(statuses.map((x) => [x.status, x._count._all])),
      online,
      signInsToday,
      newUsers,
      messagesToday,
      pendingApps,
      recentSignIns,
      recentActions,
      openErrors,
      pendingDeletions,
      signUps,
      countries: top(countries, (r: { country: string | null }) => r.country),
      devices: top(devices, (r: { device: string | null }) => r.device),
      // The spending guard (cloudflare/usage-guard.ts): this billing month's Cloudflare usage.
      usage: guard && { paused: guard.paused, reason: guard.reason, resumeAt: guard.resumeAt, checkedAt: guard.checkedAt, error: guard.error, meters: guard.meters ? JSON.parse(guard.meters) : [] },
    };
  });

  // ── Server: live, read-only or maintenance, a notice on every page, and the spending guard ──
  // The Worker (cloudflare/usage-guard.ts) reads the server_control row at most once a minute. The
  // owner always gets through: these answers give their browser the uv_owner cookie.

  r.get('server', async () => {
    const day = new Date(Date.now() - 86_400_000);
    const [ctl, guard, people, activeToday, signInsToday, messagesToday, openErrors, newErrors, pendingDeletions, suspended, history] = await Promise.all([
      serverControl(),
      prisma.usageGuard.findUnique({ where: { id: 'main' } }).catch(() => null),
      prisma.user.count(),
      prisma.user.count({ where: { lastSeenAt: { gt: day } } }),
      prisma.loginEvent.count({ where: { createdAt: { gt: day } } }),
      prisma.message.count({ where: { createdAt: { gt: day } } }),
      prisma.errorReport.count({ where: { status: { in: ['NEW', 'DIAGNOSED'] } } }),
      prisma.errorReport.count({ where: { lastSeen: { gt: day } } }),
      prisma.accountDeletionRequest.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.ownerChange.findMany({ where: { model: 'ServerControl' }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return withOwnerPass(ctl.bypass, {
      control: publicControl(ctl),
      usage: guard && { paused: guard.paused, reason: guard.reason, resumeAt: guard.resumeAt, checkedAt: guard.checkedAt, error: guard.error, meters: guard.meters ? JSON.parse(guard.meters) : [] },
      health: { people, activeToday, signInsToday, messagesToday, openErrors, newErrors, pendingDeletions, suspended },
      settings: serverSettings(),
      history,
    });
  });

  r.post('server', async ({ body, user }) => {
    const ctl = await serverControl();
    const data: { mode?: string; message?: string | null; until?: Date | null; banner?: string | null; switches?: string | null } = {};
    if (body?.mode !== undefined) {
      if (!['LIVE', 'READ_ONLY', 'MAINTENANCE'].includes(body.mode)) throw new BadRequestException('Mode must be LIVE, READ_ONLY or MAINTENANCE');
      data.mode = body.mode;
    }
    if (body?.message !== undefined) data.message = String(body.message ?? '').trim().slice(0, 500) || null;
    if (body?.banner !== undefined) data.banner = String(body.banner ?? '').trim().slice(0, 300) || null;
    if (body?.until !== undefined) {
      const until = body.until ? new Date(String(body.until)) : null;
      if (until && (Number.isNaN(until.getTime()) || until.getTime() < Date.now())) throw new BadRequestException('Pick a time in the future');
      data.until = until;
    }
    // Feature switches: the list of features turned off.
    let switched = '';
    if (body?.switches !== undefined) {
      if (!Array.isArray(body.switches)) throw new BadRequestException('switches must be a list');
      const off = parseSwitches(JSON.stringify(body.switches));
      const was = parseSwitches(ctl.switches);
      data.switches = off.length ? JSON.stringify(off) : null;
      const name = (id: string) => FEATURE_SWITCHES.find((f) => f.id === id)?.label ?? id;
      const turnedOff = off.filter((x) => !was.includes(x)).map(name);
      const turnedOn = was.filter((x) => !off.includes(x)).map(name);
      switched = [turnedOff.length && `Turned off: ${turnedOff.join(', ')}`, turnedOn.length && `Turned back on: ${turnedOn.join(', ')}`].filter(Boolean).join(' · ');
    }
    // Back to normal clears the end time.
    if (data.mode === 'LIVE') data.until = null;
    const keys = Object.keys(data) as (keyof typeof data)[];
    if (!keys.length) throw new BadRequestException('Nothing to change');
    const after = await prisma.serverControl.update({ where: { id: 'main' }, data: { ...data, updatedAt: new Date(), updatedBy: user.id } });
    const words: Record<string, string> = { LIVE: 'Server back to normal', READ_ONLY: 'Server set to read-only', MAINTENANCE: 'Server paused for maintenance' };
    forgetRules();
    const summary = data.mode && data.mode !== ctl.mode ? words[data.mode] : switched ? switched : data.banner !== undefined && data.banner !== ctl.banner ? (data.banner ? `Notice set: “${data.banner.slice(0, 60)}”` : 'Notice removed') : 'Server settings changed';
    const change = await prisma.ownerChange.create({
      data: { ownerId: user.id, action: 'UPDATE', model: 'ServerControl', recordId: 'main', summary, before: json(pickKeys(publicControl(ctl), keys)), after: json(pickKeys(publicControl(after), keys)) },
    });
    return withOwnerPass(after.bypass, { control: publicControl(after), changeId: change.id });
  });

  // ── Ban and permanent delete ──

  r.post<{ id: string }>('people/:id/ban', async ({ params, body, user }) => {
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, name: true, email: true, status: true } });
    if (!target) throw new NotFoundException('Person not found');
    if (isOwnerEmail(target.email) || target.id === user.id) throw new ForbiddenException("The owner account can't be banned.");
    const ban = body?.ban !== false;
    const status = ban ? 'SUSPENDED' : 'ACTIVE';
    await prisma.user.update({ where: { id: target.id }, data: { status } });
    forgetUser(target.id);
    const change = await prisma.ownerChange.create({
      data: { ownerId: user.id, action: 'UPDATE', model: 'User', recordId: target.id, summary: `${ban ? 'Banned' : 'Let back in'} ${label(target)}`, before: { status: target.status }, after: { status } },
    });
    return { ok: true, changeId: change.id };
  });

  /** Removes the account and everything that belongs only to it. Can't be undone. */
  r.delete<{ id: string }>('people/:id', async ({ params, query, user }) => {
    const before = (await prisma.user.findUnique({ where: { id: params.id }, select: select(model('User')) })) as Record<string, unknown> | null;
    if (!before) throw new NotFoundException('Person not found');
    if (isOwnerEmail(String(before.email)) || before.id === user.id) throw new ForbiddenException("The owner account can't be deleted.");
    if (String(query.confirm ?? '').trim().toLowerCase() !== String(before.email).toLowerCase()) throw new BadRequestException('Type their email address to confirm.');
    let how: 'removed' | 'erased' = 'removed';
    try {
      await prisma.user.delete({ where: { id: params.id } });
    } catch {
      // Something else points at them (a course they teach, a payment…): remove everything
      // personal and keep a "Deleted user" in their place, so the rest stays intact.
      await eraseAccount(params.id);
      how = 'erased';
    }
    forgetUser(params.id);
    await prisma.ownerChange.create({
      data: {
        ownerId: user.id, action: 'PURGE', model: 'User', recordId: params.id, before: json(before),
        summary: `Permanently deleted ${label(before)}${how === 'erased' ? ' (kept as “Deleted user” where other records need them)' : ''}`,
      },
    });
    return { ok: true, how };
  });

  /**
   * Everything happening: sign-ins, actions (Activity Log), messages sent, pages opened and buttons
   * clicked, newest first. `kind` limits it to one of those, `q` searches names, emails, text,
   * pages, devices and places, `role` limits it to students, teachers, admins or mentors.
   */
  r.get('activity', async ({ query }) => {
    const before = query.before ? new Date(String(query.before)) : new Date(Date.now() + 1000);
    const userId = typeof query.userId === 'string' && query.userId ? query.userId : undefined;
    const kind = ['signin', 'action', 'message', 'ui'].includes(query.kind) ? String(query.kind) : '';
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    const role = (['STUDENT', 'TEACHER', 'ADMIN', 'INDUSTRY_MENTOR'] as const).find((x) => x === query.role);
    const want = (k: string) => !kind || kind === k;
    const person = { ...(role && { role }), ...(q && { OR: [{ name: { contains: q } }, { email: { contains: q } }] }) };
    const byPerson = role || q ? { user: { is: person } } : {};
    const take = 40;
    const none = Promise.resolve([]);
    const [signIns, actions, messages, ui] = await Promise.all([
      want('signin') ? prisma.loginEvent.findMany({
        where: {
          createdAt: { lt: before }, ...(userId && { userId }),
          ...(q ? { OR: [{ user: { is: person } }, ...['device', 'city', 'country', 'ip', 'method'].map((f) => ({ [f]: { contains: q } }))], ...(role && { user: { is: { role } } }) } : byPerson),
        },
        orderBy: { createdAt: 'desc' }, take, include: { user: { select: { id: true, name: true, role: true } } },
      }) : none,
      want('action') ? prisma.auditLog.findMany({
        where: {
          createdAt: { lt: before }, ...(userId && { actorId: userId }), ...(role && { actorRole: role }),
          ...(q && { OR: [{ summary: { contains: q } }, { actorName: { contains: q } }, { action: { contains: q } }] }),
        },
        orderBy: { createdAt: 'desc' }, take,
      }) : none,
      want('message') ? prisma.message.findMany({
        where: {
          createdAt: { lt: before }, ...(userId && { senderId: userId }), ...(role && { sender: { is: { role } } }),
          ...(q && { OR: [{ body: { contains: q } }, { sender: { is: { OR: [{ name: { contains: q } }, { email: { contains: q } }] } } }, { conversation: { is: { name: { contains: q } } } }] }),
        },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, type: true, body: true, createdAt: true, conversationId: true, sender: { select: { id: true, name: true, role: true } }, conversation: { select: { name: true, isGroup: true } } },
      }) : none,
      want('ui') ? prisma.uiEvent.findMany({
        where: {
          createdAt: { lt: before }, ...(userId && { userId }), ...(role && { user: { is: { role } } }),
          ...(q && { OR: [{ label: { contains: q } }, { path: { contains: q } }, { user: { is: { OR: [{ name: { contains: q } }, { email: { contains: q } }] } } }] }),
        },
        orderBy: { createdAt: 'desc' }, take, include: { user: { select: { id: true, name: true, role: true } } },
      }) : none,
    ]);
    const items = [
      ...signIns.map((e) => ({ kind: 'signin' as const, at: e.createdAt, user: e.user, data: e })),
      ...actions.map((e) => ({ kind: 'action' as const, at: e.createdAt, user: { id: e.actorId, name: e.actorName, role: e.actorRole }, data: e })),
      ...messages.map((e) => ({ kind: 'message' as const, at: e.createdAt, user: e.sender, data: e })),
      ...ui.map((e) => ({ kind: 'ui' as const, at: e.createdAt, user: e.user, data: e })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
    return { items, next: items.length === take ? items[items.length - 1].at : null };
  });

  // ── People ──

  r.get('people', async ({ query }) => {
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    const where: Record<string, unknown> = {};
    if (['STUDENT', 'TEACHER', 'ADMIN', 'INDUSTRY_MENTOR'].includes(query.role)) where.role = query.role;
    if (['PENDING', 'ACTIVE', 'SUSPENDED'].includes(query.status)) where.status = query.status;
    if (q) where.OR = [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }];
    const people = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      skip: Math.max(0, Number(query.skip) || 0),
      select: {
        id: true, name: true, email: true, phone: true, role: true, status: true, avatar: true, accountType: true, onboardedAt: true, createdAt: true, lastSeenAt: true,
        loginEvents: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, device: true, country: true, city: true } },
        _count: { select: { loginEvents: true, enrollments: true, taughtCourses: true, sentMessages: true } },
      },
    });
    const total = await prisma.user.count({ where });
    return {
      total,
      people: people.map(({ loginEvents, _count, ...p }) => ({
        ...p, lastSignIn: loginEvents[0] ?? null, owner: isOwnerEmail(p.email),
        signIns: _count.loginEvents, courses: p.role === 'TEACHER' ? _count.taughtCourses : _count.enrollments, messages: _count.sentMessages,
      })),
    };
  });

  /** Everything linked to one person, from every table in the database. */
  r.get<{ id: string }>('people/:id', async ({ params }) => {
    const um = model('User');
    const user = await prisma.user.findUnique({ where: { id: params.id }, select: select(um) });
    if (!user) throw new NotFoundException('Person not found');
    const links = MODELS.flatMap((m) =>
      m.fields.filter((f) => f.kind === 'object' && f.type === 'User' && f.relationFields?.length).map((f) => ({ m, fk: f.relationFields![0], via: f.name })),
    ).filter((l) => !LOCKED.has(l.m.name));
    // Counted in one query first (a query per table is over D1's 50-per-request limit), then records
    // are read only for the tables that have some, up to 35 tables.
    if (!/^[\w-]+$/.test(params.id)) throw new NotFoundException('Person not found');
    const counts = await selectColumns(links.map(({ m, fk }, i) => [`l${i}`, `(SELECT COUNT(*) FROM "${m.table}" WHERE "${fk}" = '${params.id}')`]));
    const withRecords = new Set(links.map((_, i) => i).filter((i) => Number(counts[`l${i}`]) > 0).slice(0, 35));
    const sections = await Promise.all(
      links.map(async ({ m, fk, via }, i) => {
        const count = Number(counts[`l${i}`] ?? 0);
        const records = withRecords.has(i) ? await delegate(m).findMany({ where: { [fk]: params.id }, select: select(m), take: 100, ...(hasField(m, 'createdAt') ? { orderBy: { createdAt: 'desc' } } : {}) }) : [];
        const sameModel = links.filter((l) => l.m.name === m.name).length > 1;
        return { model: m.name, field: fk, title: humanize(m.name) + (sameModel ? ` (as ${humanize(via).toLowerCase()})` : ''), count, records };
      }),
    );
    const activity = await prisma.auditLog.findMany({ where: { actorId: params.id }, orderBy: { createdAt: 'desc' }, take: 100 });
    return {
      user: { ...user, owner: isOwnerEmail(String((user as Record<string, unknown>).email ?? "")) },
      sections: [...sections.filter((s) => s.count > 0), { model: 'AuditLog', field: 'actorId', title: 'Actions (Activity Log)', count: activity.length, records: activity }],
      empty: sections.filter((s) => s.count === 0).map((s) => s.title),
    };
  });

  // ── Private conversations ──

  r.get<{ id: string }>('people/:id/conversations', async ({ params }) => {
    const parts = await prisma.conversationParticipant.findMany({
      where: { userId: params.id },
      select: {
        conversation: {
          select: {
            id: true, name: true, isGroup: true, updatedAt: true,
            participants: { select: { user: { select: { id: true, name: true, role: true } } } },
            _count: { select: { messages: true } },
          },
        },
      },
    });
    return parts.map((p) => p.conversation).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  });

  /** A whole conversation, including deleted and disappearing messages, calls, polls and files. */
  r.get<{ id: string }>('conversations/:id/messages', async ({ params, query }) => {
    const convo = await prisma.conversation.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, isGroup: true, createdAt: true, participants: { select: { user: { select: { id: true, name: true, role: true } } } } },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    const before = query.before ? new Date(String(query.before)) : undefined;
    const messages = await prisma.message.findMany({
      where: { conversationId: params.id, ...(before && { createdAt: { lt: before } }) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { ...select(model('Message')), sender: { select: { id: true, name: true } } },
    });
    return { conversation: convo, messages: messages.reverse(), hasMore: messages.length === 100 };
  });

  // ── Any table ──

  r.get('tables', async () => {
    // One query for every table: a count per table is ~90 queries, over D1's 50-per-request limit.
    const open = MODELS.filter((m) => !LOCKED.has(m.name));
    const count = await countTables(open);
    return { tables: open.map((m) => ({ name: m.name, title: humanize(m.name), count: count[m.name] })), schema: { models: MODELS.filter((m) => !LOCKED.has(m.name)).map((m) => ({ name: m.name, fields: columns(m) })), enums: ENUMS } };
  });

  r.get<{ model: string }>('records/:model', async ({ params, query }) => {
    const m = model(params.model);
    if (LOCKED.has(m.name)) throw new ForbiddenException('This table is read-only.');
    const where: Record<string, unknown> = {};
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
    if (q) {
      const text = columns(m).filter((f) => f.type === 'String' && f.kind === 'scalar' && !f.list);
      where.OR = [...text.map((f) => ({ [f.name]: { contains: q } }))];
    }
    if (typeof query.field === 'string' && hasField(m, query.field) && typeof query.value === 'string') where[query.field] = query.value;
    const skip = Math.max(0, Number(query.skip) || 0);
    const [records, total] = await Promise.all([
      delegate(m).findMany({ where, select: select(m), take: 50, skip, ...(hasField(m, 'createdAt') ? { orderBy: { createdAt: 'desc' } } : {}) }),
      delegate(m).count({ where }),
    ]);
    return { model: m.name, fields: columns(m), records, total };
  });

  r.patch<{ model: string; id: string }>('records/:model/:id', async ({ params, body, user }) => {
    const m = model(params.model);
    if (LOCKED.has(m.name)) throw new ForbiddenException('This table is read-only.');
    const before = await delegate(m).findUnique({ where: { id: params.id }, select: select(m) });
    if (!before) throw new NotFoundException('Record not found');
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((body?.data ?? {}) as Record<string, unknown>)) {
      const f = m.fields.find((x) => x.name === k);
      if (!f || f.kind === 'object' || f.id || f.type === 'Bytes' || f.updatedAt) continue;
      data[k] = coerce(f, v);
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to change');
    await guardUserEdit(m, params.id, data);
    const after = await delegate(m).update({ where: { id: params.id }, data, select: select(m) });
    const changed = Object.keys(data).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    const change = await prisma.ownerChange.create({
      data: {
        ownerId: user.id, action: 'UPDATE', model: m.name, recordId: params.id,
        summary: `Edited ${humanize(m.name).toLowerCase()} ${label(before)}: ${changed.join(', ') || 'no visible change'}`,
        before: json(pickKeys(before, changed)), after: json(pickKeys(after, changed)),
      },
    });
    if (m.name === 'User') forgetUser(params.id);
    return { record: after, changeId: change.id };
  });

  r.delete<{ model: string; id: string }>('records/:model/:id', async ({ params, user }) => {
    const m = model(params.model);
    if (LOCKED.has(m.name)) throw new ForbiddenException('This table is read-only.');
    if (m.name === 'User') throw new ForbiddenException('People are not deleted here (it would delete everything they made). Suspend the account instead: set status to SUSPENDED.');
    const before = await delegate(m).findUnique({ where: { id: params.id }, select: select(m) });
    if (!before) throw new NotFoundException('Record not found');
    await delegate(m).delete({ where: { id: params.id } });
    const change = await prisma.ownerChange.create({
      data: { ownerId: user.id, action: 'DELETE', model: m.name, recordId: params.id, summary: `Deleted ${humanize(m.name).toLowerCase()} ${label(before)}`, before: json(before) },
    });
    return { ok: true, changeId: change.id };
  });

  // ── Change history & undo ──

  r.get('changes', async ({ query }) => {
    const before = query.before ? new Date(String(query.before)) : undefined;
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    const items = await prisma.ownerChange.findMany({
      where: {
        ...(before && { createdAt: { lt: before } }),
        ...(q && { OR: [{ summary: { contains: q } }, { model: { contains: q } }, { recordId: q }] }),
        ...(typeof query.area === 'string' && AREA_MODELS[query.area] && { model: { in: AREA_MODELS[query.area] } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items, next: items.length === 50 ? items[items.length - 1].createdAt : null };
  });

  r.post<{ id: string }>('changes/:id/undo', async ({ params, user }) => {
    const change = await prisma.ownerChange.findUnique({ where: { id: params.id } });
    if (!change) throw new NotFoundException('Change not found');
    if (change.undoneAt) throw new BadRequestException('This change was already undone.');
    const m = model(change.model);
    const snapshot = revive(m, (change.before ?? {}) as Record<string, unknown>);
    if (change.action === 'UPDATE') {
      const exists = await delegate(m).findUnique({ where: { id: change.recordId }, select: { id: true } });
      if (!exists) throw new BadRequestException('The record no longer exists, so this edit can’t be undone.');
      await delegate(m).update({ where: { id: change.recordId }, data: snapshot });
      await clearJson(m, change.recordId, (change.before ?? {}) as Record<string, unknown>);
    } else if (change.action === 'DELETE') {
      const exists = await delegate(m).findUnique({ where: { id: change.recordId }, select: { id: true } });
      if (exists) throw new BadRequestException('A record with this id already exists.');
      try {
        await delegate(m).create({ data: snapshot });
      } catch (e) {
        throw new BadRequestException(`Could not restore it: ${(e as Error).message.split('\n').pop()}`);
      }
    } else if (change.action === 'BULK' && m.name === 'User') {
      // Several people's status at once (People → select → Ban / Let back in): each gets theirs back.
      const before = (change.before ?? {}) as Record<string, string>;
      const groups = new Map<string, string[]>();
      for (const [id, status] of Object.entries(before)) groups.set(status, [...(groups.get(status) ?? []), id]);
      for (const [status, ids] of groups) await prisma.user.updateMany({ where: { id: { in: ids } }, data: { status: status as 'ACTIVE' } });
      Object.keys(before).forEach(forgetUser);
    } else {
      throw new BadRequestException('This change can’t be undone.');
    }
    if (m.name === 'User') forgetUser(change.recordId);
    if (m.name === 'Message') {
      const msg = await prisma.message.findUnique({ where: { id: change.recordId }, select: { conversationId: true } });
      if (msg) publishChat(msg.conversationId);
    }
    await prisma.ownerChange.update({ where: { id: change.id }, data: { undoneAt: new Date() } });
    await prisma.ownerChange.create({ data: { ownerId: user.id, action: 'RESTORE', model: m.name, recordId: change.recordId, summary: `Undid: ${change.summary}` } });
    return { ok: true };
  });
}

/** The server switch, created on first use with a fresh owner pass. */
export async function serverControl() {
  const found = await prisma.serverControl.findUnique({ where: { id: 'main' } });
  if (found) return found;
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const bypass = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
  return prisma.serverControl.upsert({ where: { id: 'main' }, update: {}, create: { id: 'main', bypass } });
}
type Control = Awaited<ReturnType<typeof serverControl>>;
const publicControl = (c: Control) => ({ mode: c.mode, message: c.message, until: c.until, banner: c.banner, switches: c.switches, updatedAt: c.updatedAt });

/** Answers with the owner's pass as a cookie, so the Worker lets them through while paused. */
function withOwnerPass(bypass: string, body: unknown) {
  return Response.json(json(body), { headers: { 'Set-Cookie': `uv_owner=${bypass}; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax` } });
}

function humanize(name: string) {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^NGO/, 'NGO ').replace(/\s+/g, ' ').trim();
}
function label(rec: Record<string, unknown>) {
  const v = rec.name ?? rec.title ?? rec.subject ?? rec.email ?? rec.body ?? rec.id;
  const s = String(v ?? '');
  return `“${s.length > 40 ? s.slice(0, 40) + '…' : s}”`;
}
function pickKeys(o: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
}
/** Plain JSON for the change history (dates become ISO strings). */
function json(o: unknown) {
  return JSON.parse(JSON.stringify(o ?? null));
}
