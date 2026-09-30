import type { Router } from '../router';
import { diagnoseErrors } from '../errors';
import prisma from '@/lib/db';
import { BadRequestException, ForbiddenException, NotFoundException } from '../http';
import { forgetUser, isOwnerEmail } from '../auth';
import schema from '../owner-schema.json';
import { decideDeletion } from '../account-deletion';

// The owner console (hidden; see RouteOptions.owner): everything about every account, the
// sign-in and activity history, private conversations, and a record editor for any table in the
// database. Every edit or delete is stored in owner_changes with the record before and after, so
// it can be undone. For everyone else these routes answer 404.

type Field = { name: string; type: string; kind: 'scalar' | 'enum' | 'object'; list: boolean; optional: boolean; id: boolean; unique: boolean; hasDefault: boolean; updatedAt: boolean; relationFields?: string[] };
type Model = { name: string; delegate: string; table: string; fields: Field[] };
const MODELS = (schema.models as Model[]);
const ENUMS = schema.enums as Record<string, string[]>;
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
    out[f.name] = f.type === 'DateTime' && typeof v === 'string' ? new Date(v) : v;
  }
  return out;
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
    const [items, counts] = await Promise.all([
      prisma.errorReport.findMany({ where, orderBy: [{ lastSeen: 'desc' }], take: 200 }),
      prisma.errorReport.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return { items, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
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
    const [roles, statuses, online, signInsToday, newUsers, messagesToday, pendingApps, recentSignIns, recentActions] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.user.findMany({ where: { lastSeenAt: { gt: new Date(now - 5 * 60_000) } }, select: { id: true, name: true, role: true, lastSeenAt: true }, orderBy: { lastSeenAt: 'desc' }, take: 50 }),
      prisma.loginEvent.count({ where: { createdAt: { gt: day } } }),
      prisma.user.count({ where: { createdAt: { gt: new Date(now - 7 * 86_400_000) } } }),
      prisma.message.count({ where: { createdAt: { gt: day } } }),
      prisma.roleApplication.count({ where: { status: 'PENDING' } }),
      prisma.loginEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 15, include: { user: { select: { id: true, name: true, role: true, email: true } } } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
    ]);
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
    };
  });

  /** Everything happening: sign-ins, actions (Activity Log) and messages sent, newest first. */
  r.get('activity', async ({ query }) => {
    const before = query.before ? new Date(String(query.before)) : new Date(Date.now() + 1000);
    const userId = typeof query.userId === 'string' && query.userId ? query.userId : undefined;
    const take = 40;
    const [signIns, actions, messages] = await Promise.all([
      prisma.loginEvent.findMany({ where: { createdAt: { lt: before }, ...(userId && { userId }) }, orderBy: { createdAt: 'desc' }, take, include: { user: { select: { id: true, name: true, role: true } } } }),
      prisma.auditLog.findMany({ where: { createdAt: { lt: before }, ...(userId && { actorId: userId }) }, orderBy: { createdAt: 'desc' }, take }),
      prisma.message.findMany({
        where: { createdAt: { lt: before }, ...(userId && { senderId: userId }) },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, type: true, body: true, createdAt: true, conversationId: true, sender: { select: { id: true, name: true, role: true } }, conversation: { select: { name: true, isGroup: true } } },
      }),
    ]);
    const items = [
      ...signIns.map((e) => ({ kind: 'signin' as const, at: e.createdAt, user: e.user, data: e })),
      ...actions.map((e) => ({ kind: 'action' as const, at: e.createdAt, user: { id: e.actorId, name: e.actorName, role: e.actorRole }, data: e })),
      ...messages.map((e) => ({ kind: 'message' as const, at: e.createdAt, user: e.sender, data: e })),
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
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, avatar: true, createdAt: true, lastSeenAt: true, loginEvents: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, device: true, country: true } } },
    });
    return people.map(({ loginEvents, ...p }) => ({ ...p, lastSignIn: loginEvents[0] ?? null, owner: isOwnerEmail(p.email) }));
  });

  /** Everything linked to one person, from every table in the database. */
  r.get<{ id: string }>('people/:id', async ({ params }) => {
    const um = model('User');
    const user = await prisma.user.findUnique({ where: { id: params.id }, select: select(um) });
    if (!user) throw new NotFoundException('Person not found');
    const links = MODELS.flatMap((m) =>
      m.fields.filter((f) => f.kind === 'object' && f.type === 'User' && f.relationFields?.length).map((f) => ({ m, fk: f.relationFields![0], via: f.name })),
    ).filter((l) => !LOCKED.has(l.m.name));
    const sections = await Promise.all(
      links.map(async ({ m, fk, via }) => {
        const records = await delegate(m).findMany({ where: { [fk]: params.id }, select: select(m), take: 100, ...(hasField(m, 'createdAt') ? { orderBy: { createdAt: 'desc' } } : {}) });
        const count = records.length < 100 ? records.length : await delegate(m).count({ where: { [fk]: params.id } });
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
    const counts = await Promise.all(MODELS.filter((m) => !LOCKED.has(m.name)).map(async (m) => ({ name: m.name, title: humanize(m.name), count: await delegate(m).count() })));
    return { tables: counts, schema: { models: MODELS.filter((m) => !LOCKED.has(m.name)).map((m) => ({ name: m.name, fields: columns(m) })), enums: ENUMS } };
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
    const items = await prisma.ownerChange.findMany({ where: before ? { createdAt: { lt: before } } : {}, orderBy: { createdAt: 'desc' }, take: 50 });
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
    } else if (change.action === 'DELETE') {
      const exists = await delegate(m).findUnique({ where: { id: change.recordId }, select: { id: true } });
      if (exists) throw new BadRequestException('A record with this id already exists.');
      try {
        await delegate(m).create({ data: snapshot });
      } catch (e) {
        throw new BadRequestException(`Could not restore it: ${(e as Error).message.split('\n').pop()}`);
      }
    } else {
      throw new BadRequestException('This change can’t be undone.');
    }
    if (m.name === 'User') forgetUser(change.recordId);
    await prisma.ownerChange.update({ where: { id: change.id }, data: { undoneAt: new Date() } });
    await prisma.ownerChange.create({ data: { ownerId: user.id, action: 'RESTORE', model: m.name, recordId: change.recordId, summary: `Undid: ${change.summary}` } });
    return { ok: true };
  });
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
