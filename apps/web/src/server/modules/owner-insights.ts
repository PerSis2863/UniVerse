import type { Router } from '../router';
import prisma from '@/lib/db';
import { BadRequestException } from '../http';
import { forgetUser, isOwnerEmail } from '../auth';
import { PLANS } from '@/lib/plans';
import { parseSwitches, parseWatchWords } from '@/lib/feature-switches';
import { selectColumns } from '../table-stats';
import { oneOf } from '../body';

// Owner console extras that read across the app:
//   attention  what needs the owner now (the Overview card and the counts on the console tabs)
//   search     one box for people, chats, messages, errors and changes
//   analytics  who uses UniVerse, when, and which pages and buttons
//   money      payments, invoices and organization subscriptions
// Every route stays well under D1's 50 queries per request.

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

export default function ownerInsightsModule(router: Router) {
  const r = router.controller('owner', { owner: true });

  r.get('attention', async () => {
    const now = Date.now();
    const day = iso(now - DAY);
    const c = await selectColumns([
      ['openErrors', `(SELECT COUNT(*) FROM error_reports WHERE status IN ('NEW','DIAGNOSED'))`],
      ['newErrors', `(SELECT COUNT(*) FROM error_reports WHERE firstSeen > '${day}')`],
      ['highErrors', `(SELECT COUNT(*) FROM error_reports WHERE status IN ('NEW','DIAGNOSED') AND severity = 'high')`],
      ['deletions', `(SELECT COUNT(*) FROM account_deletion_requests WHERE status = 'PENDING')`],
      ['applications', `(SELECT COUNT(*) FROM role_applications WHERE status = 'PENDING')`],
      ['waiting', `(SELECT COUNT(*) FROM users WHERE status = 'PENDING' AND onboardedAt IS NOT NULL)`],
      ['muted', `(SELECT COUNT(*) FROM users WHERE chatMutedUntil > '${iso(now)}')`],
      ['failedPayments', `(SELECT COUNT(*) FROM payments WHERE status = 'FAILED' AND createdAt > '${iso(now - 7 * DAY)}')`],
      ['pastDue', `(SELECT COUNT(*) FROM organizations WHERE subscriptionStatus IN ('past_due','unpaid'))`],
      ['online', `(SELECT COUNT(*) FROM users WHERE lastSeenAt > '${iso(now - 5 * 60_000)}')`],
    ]);
    const [ctl, guard] = await Promise.all([
      prisma.serverControl.findUnique({ where: { id: 'main' }, select: { mode: true, banner: true, switches: true, watchWords: true } }),
      prisma.usageGuard.findUnique({ where: { id: 'main' }, select: { paused: true, meters: true } }).catch(() => null),
    ]);
    // Watch-word messages in the last day (whole words are checked when they are sent; this is a count).
    const words = parseWatchWords(ctl?.watchWords);
    const flagged = words.length
      ? await prisma.message.count({ where: { createdAt: { gt: new Date(now - DAY) }, type: { not: 'SYSTEM' }, OR: words.slice(0, 90).map((w) => ({ body: { contains: w } })) } })
      : 0;
    const meters: { key: string; label?: string; used: number | null; limit: number }[] = guard?.meters ? JSON.parse(guard.meters) : [];
    const high = meters.filter((m) => m.used != null && m.limit > 0 && m.used / m.limit >= 0.7).map((m) => ({ key: m.key, label: m.label ?? m.key, percent: Math.round(((m.used ?? 0) / m.limit) * 100) }));
    const off = parseSwitches(ctl?.switches).filter((x) => x !== 'digest'); // the owner's own email isn't a feature people miss
    // What to look at, most urgent first. `tab` is the console tab, `href` a page elsewhere.
    const items = [
      guard?.paused && { id: 'paused', level: 'high', text: 'The spending guard has paused the site.', tab: 'server' },
      ctl && ctl.mode !== 'LIVE' && { id: 'mode', level: 'high', text: ctl.mode === 'MAINTENANCE' ? 'The site is paused for maintenance.' : 'The site is read-only.', tab: 'server' },
      ...high.map((m) => ({ id: `usage-${m.key}`, level: m.percent >= 90 ? 'high' : 'medium', text: `${m.label} is at ${m.percent}% of this month's allowance.`, tab: 'server' })),
      num(c.highErrors) > 0 && { id: 'high-errors', level: 'high', text: `${num(c.highErrors)} serious ${num(c.highErrors) === 1 ? 'problem' : 'problems'} to fix.`, tab: 'errors' },
      num(c.newErrors) > 0 && { id: 'new-errors', level: 'medium', text: `${num(c.newErrors)} new ${num(c.newErrors) === 1 ? 'problem' : 'problems'} in the last day.`, tab: 'errors' },
      num(c.deletions) > 0 && { id: 'deletions', level: 'medium', text: `${num(c.deletions)} ${num(c.deletions) === 1 ? 'person wants' : 'people want'} their account deleted.`, tab: 'deletions' },
      num(c.applications) > 0 && { id: 'applications', level: 'medium', text: `${num(c.applications)} teacher or staff ${num(c.applications) === 1 ? 'application is' : 'applications are'} waiting.`, href: '/admin/approvals' },
      num(c.waiting) > 0 && { id: 'waiting', level: 'low', text: `${num(c.waiting)} ${num(c.waiting) === 1 ? 'account is' : 'accounts are'} waiting for approval.`, tab: 'people', filter: 'PENDING' },
      flagged > 0 && { id: 'flagged', level: 'medium', text: `${flagged} ${flagged === 1 ? 'message' : 'messages'} with a watch word today.`, tab: 'chats' },
      num(c.failedPayments) > 0 && { id: 'payments', level: 'medium', text: `${num(c.failedPayments)} failed ${num(c.failedPayments) === 1 ? 'payment' : 'payments'} this week.`, tab: 'money' },
      num(c.pastDue) > 0 && { id: 'past-due', level: 'medium', text: `${num(c.pastDue)} ${num(c.pastDue) === 1 ? 'subscription is' : 'subscriptions are'} past due.`, tab: 'money' },
      off.length > 0 && { id: 'switches', level: 'low', text: `${off.length} ${off.length === 1 ? 'feature is' : 'features are'} switched off.`, tab: 'server' },
      ctl?.banner && { id: 'banner', level: 'low', text: 'A notice is showing on every page.', tab: 'server' },
      num(c.muted) > 0 && { id: 'muted', level: 'low', text: `${num(c.muted)} ${num(c.muted) === 1 ? 'person is' : 'people are'} muted in chat.`, tab: 'people' },
    ].filter(Boolean);
    return {
      items,
      // Small numbers on the console tabs.
      badges: { errors: num(c.openErrors), deletions: num(c.deletions), activity: num(c.online), chats: flagged, server: (ctl && ctl.mode !== 'LIVE') || guard?.paused ? 1 : 0 },
    };
  });

  r.get('search', async ({ query }) => {
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    if (q.length < 2) return { people: [], chats: [], messages: [], errors: [], changes: [] };
    const [people, chats, messages, errors, changes] = await Promise.all([
      prisma.user.findMany({ where: { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }, { id: q }] }, take: 6, orderBy: { lastSeenAt: 'desc' }, select: { id: true, name: true, email: true, role: true, status: true } }),
      prisma.conversation.findMany({ where: { OR: [{ name: { contains: q } }, { id: q }] }, take: 5, orderBy: { updatedAt: 'desc' }, select: { id: true, name: true, isGroup: true, updatedAt: true } }),
      prisma.message.findMany({ where: { body: { contains: q }, type: { not: 'SYSTEM' } }, take: 6, orderBy: { createdAt: 'desc' }, select: { id: true, body: true, createdAt: true, conversationId: true, sender: { select: { name: true } } } }),
      prisma.errorReport.findMany({ where: { OR: [{ message: { contains: q } }, { path: { contains: q } }] }, take: 5, orderBy: { lastSeen: 'desc' }, select: { id: true, message: true, path: true, status: true, lastSeen: true } }),
      prisma.ownerChange.findMany({ where: { summary: { contains: q } }, take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, summary: true, createdAt: true } }),
    ]);
    return { people: people.map((p) => ({ ...p, owner: isOwnerEmail(p.email) })), chats, messages, errors, changes };
  });

  r.get('analytics', async ({ query }) => {
    const days = [7, 30, 90].includes(Number(query.days)) ? Number(query.days) : 30;
    const now = Date.now();
    const since = iso(now - days * DAY);
    const q = <T,>(sql: string, ...args: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...args);
    const [active, joined, sent, pages, buttons, hours, busiest, totals] = await Promise.all([
      // People active per day: anyone who opened a page or the app that day.
      q<{ d: string; n: bigint }>(`SELECT substr(createdAt, 1, 10) AS d, COUNT(DISTINCT userId) AS n FROM (SELECT userId, createdAt FROM ui_events WHERE createdAt > ? UNION ALL SELECT userId, createdAt FROM login_events WHERE createdAt > ?) GROUP BY d`, since, since),
      q<{ d: string; n: bigint }>(`SELECT substr(createdAt, 1, 10) AS d, COUNT(*) AS n FROM users WHERE createdAt > ? GROUP BY d`, since),
      q<{ d: string; n: bigint }>(`SELECT substr(createdAt, 1, 10) AS d, COUNT(*) AS n FROM messages WHERE createdAt > ? AND type != 'SYSTEM' GROUP BY d`, since),
      q<{ path: string; n: bigint; people: bigint }>(`SELECT path, COUNT(*) AS n, COUNT(DISTINCT userId) AS people FROM ui_events WHERE kind = 'VIEW' AND createdAt > ? GROUP BY path ORDER BY n DESC LIMIT 12`, since),
      q<{ label: string; path: string; n: bigint }>(`SELECT label, path, COUNT(*) AS n FROM ui_events WHERE kind = 'CLICK' AND label IS NOT NULL AND createdAt > ? GROUP BY label, path ORDER BY n DESC LIMIT 12`, since),
      // Hour of day in UTC; the page moves it to the owner's time zone.
      q<{ h: string; n: bigint }>(`SELECT substr(createdAt, 12, 2) AS h, COUNT(*) AS n FROM ui_events WHERE createdAt > ? GROUP BY h`, since),
      q<{ id: string; name: string; role: string; n: bigint }>(`SELECT u.id AS id, u.name AS name, u.role AS role, COUNT(*) AS n FROM ui_events e JOIN users u ON u.id = e.userId WHERE e.createdAt > ? GROUP BY u.id ORDER BY n DESC LIMIT 8`, since),
      selectColumns([
        ['people', `(SELECT COUNT(*) FROM users)`],
        ['day', `(SELECT COUNT(*) FROM users WHERE lastSeenAt > '${iso(now - DAY)}')`],
        ['week', `(SELECT COUNT(*) FROM users WHERE lastSeenAt > '${iso(now - 7 * DAY)}')`],
        ['month', `(SELECT COUNT(*) FROM users WHERE lastSeenAt > '${iso(now - 30 * DAY)}')`],
        ['never', `(SELECT COUNT(*) FROM users WHERE lastSeenAt IS NULL)`],
        ['unfinished', `(SELECT COUNT(*) FROM users WHERE onboardedAt IS NULL)`],
        ['views', `(SELECT COUNT(*) FROM ui_events WHERE kind = 'VIEW' AND createdAt > '${since}')`],
        ['clicks', `(SELECT COUNT(*) FROM ui_events WHERE kind = 'CLICK' AND createdAt > '${since}')`],
        ['signIns', `(SELECT COUNT(*) FROM login_events WHERE createdAt > '${since}')`],
        ['roles', `(SELECT json_group_object(role, n) FROM (SELECT role, COUNT(*) AS n FROM users WHERE lastSeenAt > '${since}' GROUP BY role))`],
      ]),
    ]);
    const list = Array.from({ length: days }, (_, i) => iso(now - (days - 1 - i) * DAY).slice(0, 10));
    const by = (rows: { d: string; n: bigint }[]) => new Map(rows.map((x) => [x.d, num(x.n)]));
    const [a, j, s] = [by(active), by(joined), by(sent)];
    return {
      days,
      perDay: list.map((d) => ({ day: d, active: a.get(d) ?? 0, joined: j.get(d) ?? 0, messages: s.get(d) ?? 0 })),
      totals: {
        people: num(totals.people), activeDay: num(totals.day), activeWeek: num(totals.week), activeMonth: num(totals.month),
        neverActive: num(totals.never), unfinished: num(totals.unfinished), views: num(totals.views), clicks: num(totals.clicks), signIns: num(totals.signIns),
      },
      activeByRole: typeof totals.roles === 'string' ? JSON.parse(totals.roles) as Record<string, number> : {},
      pages: pages.map((p) => ({ path: p.path, views: num(p.n), people: num(p.people) })),
      buttons: buttons.map((b) => ({ label: b.label, path: b.path, clicks: num(b.n) })),
      hours: Array.from({ length: 24 }, (_, h) => num(hours.find((x) => Number(x.h) === h)?.n)),
      busiest: busiest.map((b) => ({ id: b.id, name: b.name, role: b.role, events: num(b.n) })),
    };
  });

  r.get('money', async () => {
    const now = Date.now();
    const month = new Date(now);
    const thisMonth = iso(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    const lastMonth = iso(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));
    const since = iso(now - 30 * DAY);
    const q = <T,>(sql: string, ...args: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...args);
    const [byStatus, byType, perDay, months, recent, invoices, orgs, invoiceList] = await Promise.all([
      q<{ status: string; currency: string; n: bigint; total: number }>(`SELECT status, currency, COUNT(*) AS n, SUM(amount) AS total FROM payments GROUP BY status, currency`),
      q<{ type: string; currency: string; total: number }>(`SELECT type, currency, SUM(amount) AS total FROM payments WHERE status = 'COMPLETED' GROUP BY type, currency`),
      q<{ d: string; currency: string; total: number }>(`SELECT substr(createdAt, 1, 10) AS d, currency, SUM(amount) AS total FROM payments WHERE status = 'COMPLETED' AND createdAt > ? GROUP BY d, currency`, since),
      q<{ m: string; currency: string; total: number }>(`SELECT CASE WHEN createdAt >= ? THEN 'this' ELSE 'last' END AS m, currency, SUM(amount) AS total FROM payments WHERE status = 'COMPLETED' AND createdAt >= ? GROUP BY m, currency`, thisMonth, lastMonth),
      prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 90, select: { id: true, amount: true, currency: true, type: true, description: true, status: true, createdAt: true, user: { select: { id: true, name: true, email: true } } } }),
      q<{ status: string; currency: string; n: bigint; total: number; overdue: bigint; overdueTotal: number }>(
        `SELECT status, currency, COUNT(*) AS n, SUM(amount) AS total, SUM(status = 'PENDING' AND dueDate < ?) AS overdue, SUM(CASE WHEN status = 'PENDING' AND dueDate < ? THEN amount ELSE 0 END) AS overdueTotal FROM invoices GROUP BY status, currency`,
        iso(now), iso(now),
      ),
      prisma.organization.findMany({ where: { OR: [{ plan: { not: 'STARTER' } }, { subscriptionStatus: { not: null } }] }, orderBy: { name: 'asc' }, take: 100, select: { id: true, name: true, plan: true, subscriptionStatus: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } }),
      prisma.invoice.findMany({ orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, number: true, amount: true, currency: true, status: true, dueDate: true, description: true, createdAt: true, user: { select: { id: true, name: true } } } }),
    ]);
    // Monthly subscription income, estimated from each paying organization's plan at the monthly price (in cents).
    const paying = orgs.filter((o) => ['active', 'trialing', 'past_due'].includes(o.subscriptionStatus ?? '') && o.plan !== 'STARTER');
    const mrr = paying.reduce((s, o) => s + (PLANS[o.plan as keyof typeof PLANS]?.monthlyPrice.month ?? 0), 0) / 100;
    const days = Array.from({ length: 30 }, (_, i) => iso(now - (29 - i) * DAY).slice(0, 10));
    const main = byStatus.find((x) => x.status === 'COMPLETED')?.currency ?? byStatus[0]?.currency ?? 'USD';
    return {
      currency: main,
      byStatus: byStatus.map((x) => ({ status: x.status, currency: x.currency, count: num(x.n), total: Number(x.total ?? 0) })),
      byType: byType.map((x) => ({ type: x.type, currency: x.currency, total: Number(x.total ?? 0) })).sort((a, b) => b.total - a.total),
      perDay: days.map((d) => ({ day: d, total: perDay.filter((x) => x.d === d && x.currency === main).reduce((s, x) => s + Number(x.total ?? 0), 0) })),
      thisMonth: months.filter((x) => x.m === 'this' && x.currency === main).reduce((s, x) => s + Number(x.total ?? 0), 0),
      lastMonth: months.filter((x) => x.m === 'last' && x.currency === main).reduce((s, x) => s + Number(x.total ?? 0), 0),
      recent,
      invoiceList,
      invoices: invoices.map((x) => ({ status: x.status, currency: x.currency, count: num(x.n), total: Number(x.total ?? 0), overdue: num(x.overdue), overdueTotal: Number(x.overdueTotal ?? 0) })),
      subscriptions: { mrr, paying: paying.length, orgs: orgs.map((o) => ({ ...o, price: (PLANS[o.plan as keyof typeof PLANS]?.monthlyPrice.month ?? 0) / 100, planName: PLANS[o.plan as keyof typeof PLANS]?.name ?? o.plan })) },
    };
  });

  // Several people at once from the People list: ban, let back in, or send a notification.
  r.post('people/bulk', async ({ body, user }) => {
    const ids = Array.isArray(body?.ids) ? [...new Set((body.ids as unknown[]).filter((x): x is string => typeof x === 'string'))].slice(0, 90) : [];
    const action = body?.action;
    if (!ids.length || !oneOf(['ban', 'unban', 'notify'] as const, action)) throw new BadRequestException('Choose people and what to do.');
    const people = (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, status: true } }))
      .filter((p) => !isOwnerEmail(p.email) && p.id !== user.id);
    if (!people.length) throw new BadRequestException('Nobody to change (the owner account is skipped).');
    const names = people.slice(0, 3).map((p) => p.name).join(', ') + (people.length > 3 ? ` and ${people.length - 3} more` : '');
    if (action === 'notify') {
      const title = String(body?.title ?? '').trim().slice(0, 200);
      const text = String(body?.body ?? '').trim().slice(0, 1000);
      if (!title || !text) throw new BadRequestException('Add a title and a message.');
      // One statement for everyone (D1 allows 100 values per query).
      await prisma.$executeRawUnsafe(
        `INSERT INTO notifications (id, userId, title, body, type, read, createdAt) SELECT lower(hex(randomblob(12))), id, ?, ?, 'announcement', 0, ? FROM users WHERE id IN (${people.map(() => '?').join(',')})`,
        title, text, new Date().toISOString().replace('Z', '+00:00'), ...people.map((p) => p.id),
      );
      await prisma.ownerChange.create({ data: { ownerId: user.id, action: 'NOTIFY', model: 'Notification', recordId: 'bulk', summary: `Notified ${names}: “${title.slice(0, 60)}”` } });
      return { done: people.length };
    }
    const status = action === 'ban' ? 'SUSPENDED' : 'ACTIVE';
    await prisma.user.updateMany({ where: { id: { in: people.map((p) => p.id) } }, data: { status } });
    people.forEach((p) => forgetUser(p.id));
    // One change that remembers everyone's status before, so Undo puts each one back.
    const change = await prisma.ownerChange.create({
      data: {
        ownerId: user.id, action: 'BULK', model: 'User', recordId: 'bulk',
        summary: `${action === 'ban' ? 'Banned' : 'Let back in'} ${names}`,
        before: Object.fromEntries(people.map((p) => [p.id, p.status])), after: { status },
      },
    });
    return { done: people.length, changeId: change.id, ids: people.map((p) => p.id) };
  });
}
