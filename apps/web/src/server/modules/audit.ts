import type { Prisma } from '@prisma/client';
import type { Router } from '../router';
import prisma from '@/lib/db';

// Activity & audit log (admins only). Entries are written by audit() in ../audit.ts.

/** A search that looks like an email also matches entries by people whose address contains it. */
async function withActorEmail(query: Record<string, unknown>): Promise<Prisma.AuditLogWhereInput> {
  const where = whereFrom(query);
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  if (q.includes('@') && where.OR) {
    const people = await prisma.user.findMany({ where: { email: { contains: q } }, select: { id: true }, take: 50 });
    if (people.length) where.OR = [...(where.OR as Prisma.AuditLogWhereInput[]), { actorId: { in: people.map((p) => p.id) } }];
  }
  return where;
}

function whereFrom(query: Record<string, any>): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (typeof query.action === 'string' && query.action) {
    // "user" matches every "user.*" action; "user.deleted" matches exactly.
    where.action = query.action.includes('.') ? query.action : { startsWith: `${query.action}.` };
  }
  if (typeof query.actorId === 'string' && query.actorId) where.actorId = query.actorId;
  if (typeof query.q === 'string' && query.q.trim()) {
    const q = query.q.trim().slice(0, 100);
    where.OR = [{ summary: { contains: q } }, { actorName: { contains: q } }];
  }
  const from = query.from ? new Date(String(query.from)) : null;
  const to = query.to ? new Date(String(query.to)) : null;
  if ((from && !Number.isNaN(+from)) || (to && !Number.isNaN(+to))) {
    where.createdAt = {
      ...(from && !Number.isNaN(+from) ? { gte: from } : {}),
      ...(to && !Number.isNaN(+to) ? { lte: to } : {}),
    };
  }
  return where;
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  // Quote everything; neutralise spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export default function auditModule(router: Router) {
  const r = router.controller('audit', { roles: ['ADMIN'] });

  // Newest first, 50 per page; pass the last entry's id as ?cursor= for the next page.
  r.get('', async ({ query }) => {
    const take = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const rows = await prisma.auditLog.findMany({
      where: await withActorEmail(query),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(typeof query.cursor === 'string' && query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const entries = rows.slice(0, take);
    // Who the actors are today (email, current role and status): one query for the whole page.
    const actorIds = [...new Set(entries.map((e) => e.actorId).filter((id): id is string => !!id))];
    // (D1 allows ~100 bound values per query, so ids go in chunks of 90.)
    const chunks: string[][] = [];
    for (let i = 0; i < actorIds.length; i += 90) chunks.push(actorIds.slice(i, i + 90));
    const actors = (await Promise.all(chunks.map((ids) => prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, role: true, status: true, lastSeenAt: true },
    })))).flat();
    return { entries, nextCursor: rows.length > take ? rows[take - 1].id : null, actors: Object.fromEntries(actors.map((a) => [a.id, a])) };
  });

  // Distinct action names for the filter menu.
  r.get('actions', async () => {
    const rows = await prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } });
    return rows.map((row) => ({ action: row.action, count: row._count._all }));
  });

  // CSV of the filtered entries (up to 10,000).
  r.get('export', async ({ query }) => {
    const rows = await prisma.auditLog.findMany({ where: await withActorEmail(query), orderBy: { createdAt: 'desc' }, take: 10_000 });
    const header = ['Time (UTC)', 'Actor', 'Actor role', 'Action', 'Summary', 'Target type', 'Target id', 'IP', 'Details'];
    const lines = rows.map((e) =>
      [e.createdAt.toISOString(), e.actorName, e.actorRole, e.action, e.summary, e.targetType, e.targetId, e.ip, e.metadata].map(csvCell).join(','),
    );
    const csv = '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="universe-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  });
}
