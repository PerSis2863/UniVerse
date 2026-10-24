import type { Router } from '../router';
import type { User } from '@prisma/client';
import prisma from '@/lib/db';
import { BadRequestException, ForbiddenException, NotFoundException } from '../http';
import { isOwnerEmail } from '../auth';
import { PLANS } from '@/lib/plans';
import { FEATURE_SWITCHES, parseOrgSwitches, parseRollouts, schoolOff } from '@/lib/feature-switches';
import { issueSessionToken, sessionTokensEnabled, VIEW_AS_SRC, VIEW_AS_TTL_SEC } from '../session-token';
import { audit } from '../audit';
import { oneOf, str } from '../body';
import { reviewFlag } from '../safety';
import { moderateListing } from '../campus-board';
import { logMod } from '../community-moderation';
import { serverControl } from './owner';
import { schoolHealth } from '@/lib/owner-console';
import type { SessionUser } from '@/lib/server-auth';
import { clearSample, sampleStatus, sampleSteps } from '../sample-world';

// Stage 5 · Q19 Owner console: every school at a glance (plan, seats, use, health), growth from
// payments and Stripe's subscription changes, safety reports from all schools in one queue, and a
// read-only "view as" for support. All sums are SQL aggregates (one query each, no row loops).

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));
const q = <T,>(sql: string, ...args: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...args);
const PAYING = ['active', 'trialing', 'past_due'];
const LABEL = new Map(FEATURE_SWITCHES.map((f) => [f.id, f.label]));
const asSession = (u: User): SessionUser => ({ id: u.id, name: u.name, email: u.email, role: u.role, owner: true, organizationId: u.organizationId ?? null });
/** "YYYY-MM" months, oldest first, ending with the current one. */
const lastMonths = (n: number, now = new Date()) =>
  Array.from({ length: n }, (_, i) => iso(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1)).slice(0, 7));
const monthIndex = (col: string) => `(CAST(substr(${col}, 1, 4) AS INTEGER) * 12 + CAST(substr(${col}, 6, 2) AS INTEGER))`;

/** Open safety items per school: chat flags, community reports and reported posts still showing. */
const OPEN_BY_SCHOOL = `SELECT org, SUM(n) AS n FROM (
  SELECT u.organizationId AS org, COUNT(*) AS n FROM safety_flags f JOIN users u ON u.id = f.senderId WHERE f.status = 'OPEN' GROUP BY u.organizationId
  UNION ALL SELECT u.organizationId, COUNT(*) FROM community_reports c JOIN users u ON u.id = c.senderId WHERE c.status = 'OPEN' GROUP BY u.organizationId
  UNION ALL SELECT u.organizationId, COUNT(*) FROM campus_listings l JOIN users u ON u.id = l.userId WHERE l.reports > 0 AND l.status = 'ACTIVE' GROUP BY u.organizationId
) GROUP BY org`;

export default function ownerConsoleModule(router: Router) {
  const r = router.controller('owner', { owner: true });

  /** Every school (up to 200, `q` searches names): plan, seats, members, who was active this week, open reports, features off. */
  r.get('schools', async ({ query }) => {
    const search = str(query.q)?.slice(0, 80);
    const now = Date.now();
    const [orgs, people, open, ctl] = await Promise.all([
      prisma.organization.findMany({
        where: search ? { name: { contains: search } } : undefined, orderBy: { name: 'asc' }, take: 200,
        select: { id: true, name: true, plan: true, subscriptionStatus: true, seats: true, trialEndsAt: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, createdAt: true },
      }),
      q<{ org: string; members: bigint; active: bigint }>(`SELECT organizationId AS org, COUNT(*) AS members, SUM(lastSeenAt >= ?) AS active FROM users WHERE organizationId IS NOT NULL GROUP BY organizationId`, iso(now - 7 * DAY)),
      q<{ org: string | null; n: bigint }>(OPEN_BY_SCHOOL),
      serverControl(),
    ]);
    const byOrg = new Map(people.map((p) => [p.org, p]));
    const openBy = new Map(open.map((o) => [o.org, num(o.n)]));
    const switches = parseOrgSwitches(ctl.switches), rollouts = parseRollouts(ctl.switches);
    const schools = orgs.map((o) => {
      const p = byOrg.get(o.id);
      const row = {
        ...o, planName: PLANS[o.plan as keyof typeof PLANS]?.name ?? o.plan,
        members: num(p?.members), active: num(p?.active), open: openBy.get(o.id) ?? 0,
        off: schoolOff(switches, rollouts, o.id).map((id) => LABEL.get(id) ?? id),
      };
      return { ...row, ...schoolHealth(row, now) };
    });
    return { schools, totals: { schools: schools.length, members: schools.reduce((s, x) => s + x.members, 0), risk: schools.filter((s) => s.health === 'risk').length, watch: schools.filter((s) => s.health === 'watch').length } };
  });

  /** One school's admins and its most recently active people (for "View as"). */
  r.get<{ id: string }>('schools/:id', async ({ params }) => {
    const org = await prisma.organization.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
    if (!org) throw new NotFoundException('School not found');
    const select = { id: true, name: true, email: true, role: true, lastSeenAt: true } as const;
    const [admins, recent] = await Promise.all([
      prisma.user.findMany({ where: { organizationId: org.id, role: 'ADMIN' }, select, take: 10 }),
      prisma.user.findMany({ where: { organizationId: org.id, role: { not: 'ADMIN' } }, orderBy: { lastSeenAt: 'desc' }, select, take: 20 }),
    ]);
    const hide = (list: typeof admins) => list.filter((u) => !isOwnerEmail(u.email));
    return { ...org, admins: hide(admins), recent: hide(recent) };
  });

  /** Revenue per month (12 months), MRR, new and cancelled subscriptions (churn) and sign-up cohorts' retention. */
  r.get('growth', async () => {
    const now = new Date();
    const months = lastMonths(12, now);
    const from = `${months[0]}-01`;
    const cohortFrom = `${months[6]}-01`;
    const [revenue, subs, orgs, cohorts, back] = await Promise.all([
      q<{ m: string; currency: string; total: number }>(`SELECT substr(createdAt, 1, 7) AS m, currency, SUM(amount) AS total FROM payments WHERE status = 'COMPLETED' AND createdAt >= ? GROUP BY m, currency`, from),
      q<{ m: string; started: bigint; ended: bigint }>(
        `SELECT substr(createdAt, 1, 7) AS m,
           SUM(toStatus IN ('active', 'trialing') AND (fromStatus IS NULL OR fromStatus NOT IN ('active', 'trialing', 'past_due'))) AS started,
           SUM(toStatus NOT IN ('active', 'trialing', 'past_due') AND fromStatus IN ('active', 'trialing', 'past_due')) AS ended
         FROM subscription_events WHERE createdAt >= ? GROUP BY m`, from,
      ),
      prisma.organization.findMany({ where: { subscriptionStatus: { in: PAYING }, plan: { not: 'STARTER' } }, select: { plan: true }, take: 1000 }),
      q<{ c: string; n: bigint }>(`SELECT substr(createdAt, 1, 7) AS c, COUNT(*) AS n FROM users WHERE createdAt >= ? AND role != 'GUARDIAN' GROUP BY c`, cohortFrom),
      // Came back k months after joining: anyone with a sign-in or app-open that month.
      q<{ c: string; k: number; n: bigint }>(
        `SELECT substr(u.createdAt, 1, 7) AS c, ${monthIndex('e.createdAt')} - ${monthIndex('u.createdAt')} AS k, COUNT(DISTINCT e.userId) AS n
         FROM login_events e JOIN users u ON u.id = e.userId
         WHERE u.createdAt >= ? AND e.createdAt >= ? AND u.role != 'GUARDIAN' GROUP BY c, k`, cohortFrom, cohortFrom,
      ),
    ]);
    const currency = revenue.reduce<Record<string, number>>((s, x) => ({ ...s, [x.currency]: (s[x.currency] ?? 0) + Number(x.total ?? 0) }), {});
    const main = Object.entries(currency).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
    const mrr = orgs.reduce((s, o) => s + (PLANS[o.plan as keyof typeof PLANS]?.monthlyPrice.month ?? 0), 0) / 100;
    // Paying schools at each month's start, worked back from today's count.
    let paying = orgs.length;
    const churn = months.map((m) => ({ month: m, started: 0, ended: 0, payingAtStart: 0, rate: null as number | null }));
    for (let i = churn.length - 1; i >= 0; i--) {
      const s = subs.find((x) => x.m === churn[i].month);
      churn[i].started = num(s?.started);
      churn[i].ended = num(s?.ended);
      churn[i].payingAtStart = Math.max(0, paying - churn[i].started + churn[i].ended);
      churn[i].rate = churn[i].payingAtStart ? Math.round((churn[i].ended / churn[i].payingAtStart) * 1000) / 10 : null;
      paying = churn[i].payingAtStart;
    }
    const cohortMonths = months.slice(6);
    return {
      currency: main,
      revenue: months.map((m) => ({ month: m, total: revenue.filter((x) => x.m === m && x.currency === main).reduce((s, x) => s + Number(x.total ?? 0), 0) })),
      mrr, paying: orgs.length, churn,
      cohorts: cohortMonths.map((c, i) => {
        const size = num(cohorts.find((x) => x.c === c)?.n);
        return {
          month: c, size,
          // Share (%) still coming back 0, 1, 2… months later, up to this month.
          kept: Array.from({ length: cohortMonths.length - i }, (_, k) => (size ? Math.round((num(back.find((x) => x.c === c && Number(x.k) === k)?.n) / size) * 100) : 0)),
        };
      }),
    };
  });

  /** Safety reports from every school: open chat flags, community reports and reported campus posts, with counts per school. */
  r.get('moderation', async () => {
    const [flags, reports, listings, open, names] = await Promise.all([
      prisma.safetyFlag.findMany({
        where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 40,
        select: { id: true, kind: true, severity: true, excerpt: true, repeats: true, createdAt: true, sender: { select: { id: true, name: true, organizationId: true } } },
      }),
      prisma.communityReport.findMany({
        where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 40,
        select: { id: true, excerpt: true, reason: true, createdAt: true, senderId: true, community: { select: { name: true } } },
      }),
      prisma.campusListing.findMany({
        where: { reports: { gt: 0 }, status: { not: 'DONE' } }, orderBy: [{ status: 'asc' }, { reports: 'desc' }], take: 40,
        select: { id: true, title: true, kind: true, status: true, reports: true, createdAt: true, user: { select: { id: true, name: true, organizationId: true } } },
      }),
      q<{ org: string | null; n: bigint }>(OPEN_BY_SCHOOL),
      prisma.organization.findMany({ select: { id: true, name: true }, take: 1000 }),
    ]);
    const senders = await prisma.user.findMany({ where: { id: { in: [...new Set(reports.map((x) => x.senderId))] } }, select: { id: true, name: true, organizationId: true } });
    const school = new Map(names.map((o) => [o.id, o.name]));
    const who = (u: { id: string; name: string; organizationId: string | null } | undefined) => ({ id: u?.id ?? null, name: u?.name ?? 'Someone', school: (u?.organizationId && school.get(u.organizationId)) || null });
    const sender = new Map(senders.map((u) => [u.id, u]));
    return {
      bySchool: open.map((o) => ({ id: o.org, name: (o.org && school.get(o.org)) || 'No school', open: num(o.n) })).sort((a, b) => b.open - a.open),
      items: [
        ...flags.map((f) => ({ kind: 'flag' as const, id: f.id, title: f.kind, severity: f.severity, text: f.excerpt, repeats: f.repeats, at: f.createdAt, person: who(f.sender) })),
        ...reports.map((c) => ({ kind: 'report' as const, id: c.id, title: c.community?.name ?? 'Community', severity: null, text: c.excerpt, reason: c.reason, at: c.createdAt, person: who(sender.get(c.senderId)) })),
        ...listings.map((l) => ({ kind: 'listing' as const, id: l.id, title: l.title, severity: null, text: `${l.reports} report${l.reports === 1 ? '' : 's'} · ${l.status === 'HIDDEN' ? 'hidden' : 'still showing'}`, hidden: l.status === 'HIDDEN', at: l.createdAt, person: who(l.user) })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at)),
    };
  });

  /** Handle one item: a chat flag (reviewed / dismiss), a community report (dismiss), a campus post (hide / restore). */
  r.post<{ kind: string; id: string }>('moderation/:kind/:id', async ({ params, body, user, req }) => {
    const action = body.action;
    let summary: string;
    if (params.kind === 'flag' && oneOf(['reviewed', 'dismiss'] as const, action)) {
      await reviewFlag(asSession(user), params.id, { action, note: body.note });
      summary = action === 'dismiss' ? 'Dismissed a chat safety flag' : 'Marked a chat safety flag reviewed';
    } else if (params.kind === 'report' && action === 'dismiss') {
      const report = await prisma.communityReport.findUnique({ where: { id: params.id }, select: { communityId: true, messageId: true, senderId: true, excerpt: true } });
      if (!report) throw new NotFoundException('This report isn’t there any more.');
      await prisma.communityReport.updateMany({ where: { messageId: report.messageId, status: 'OPEN' }, data: { status: 'DISMISSED', resolvedById: user.id, resolvedAt: new Date(), outcome: 'dismissed' } });
      await logMod(report.communityId, user.id, 'dismiss_report', report.senderId, report.excerpt.slice(0, 120));
      summary = 'Dismissed a community report';
    } else if (params.kind === 'listing' && oneOf(['hide', 'restore'] as const, action)) {
      await moderateListing(asSession(user), { id: params.id, action });
      summary = action === 'hide' ? 'Hid a reported campus post' : 'Restored a reported campus post';
    } else throw new BadRequestException('Unknown action.');
    audit(user, { action: 'owner.moderation', summary, targetType: params.kind, targetId: params.id }, req);
    return { ok: true };
  });

  /**
   * "View as" for support: a 30-minute, read-only session as this person, opened in its own tab
   * (src/app/view-as/page.tsx). Every change and their private messages are refused for it
   * (src/server/session-token.ts viewAsRefused). Written to the audit log their school's admins see.
   */
  r.post<{ id: string }>('view-as/:id', async ({ params, user, req }) => {
    if (!sessionTokensEnabled()) throw new BadRequestException('“View as” needs the SESSION_SECRET setting (see Server → Settings).');
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, name: true, email: true, role: true, status: true } });
    if (!target) throw new NotFoundException('Person not found');
    if (target.id === user.id || isOwnerEmail(target.email)) throw new ForbiddenException('The owner account can’t be viewed as.');
    if (target.status === 'SUSPENDED') throw new BadRequestException('This account is suspended, so it can’t open the app.');
    audit(user, { action: 'support.view_as', summary: `Owner viewed the app as ${target.name} (read-only, 30 minutes)`, targetType: 'user', targetId: target.id }, req);
    return { token: issueSessionToken(target.id, VIEW_AS_SRC, VIEW_AS_TTL_SEC), name: target.name, minutes: VIEW_AS_TTL_SEC / 60 };
  });

  /** Sample data (src/server/sample-world.ts): how much is in, fill one step at a time, remove it all. */
  r.get('sample-world', () => sampleStatus());
  r.post<{ n: string }>('sample-world/step/:n', async ({ params, user, req }) => {
    const steps = sampleSteps(), n = Number(params.n);
    const step = Number.isInteger(n) ? steps[n] : undefined;
    if (!step) throw new BadRequestException('Unknown step.');
    const rows = await step.run();
    if (n === steps.length - 1) audit(user, { action: 'owner.sample_filled', summary: 'Owner filled the app with sample data' }, req);
    return { step: n, of: steps.length, label: step.label, rows };
  });
  r.post('sample-world/clear', async ({ user, req }) => {
    const res = await clearSample();
    audit(user, { action: 'owner.sample_removed', summary: `Owner removed the sample data (${res.removed} sample people)` }, req);
    return res;
  });
}
