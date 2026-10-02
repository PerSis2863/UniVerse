import prisma from '@/lib/db';
import { COMPANY } from '@/lib/company';
import { geminiJson } from './gemini';
import { serverSettings } from './server-settings';
import { cloudflareAccount } from './cloudflare-account';
import { selectColumns } from './table-stats';

// The owner console's "Health check": looks over errors, sign-ins, accounts, settings and
// Cloudflare for security and reliability problems, then asks AI to rank them and explain each
// fix in plain words. Every check below also works without AI (the list is then unranked).
// Reads only; one batch of counts plus two small lists, so it fits D1's per-request limits.

export type Severity = 'high' | 'medium' | 'low';
export interface Finding { severity: Severity; area: 'Security' | 'Errors' | 'Settings' | 'Email' | 'Accounts' | 'Site'; title: string; detail: string; fix: string }
export interface HealthReport { checkedAt: string; score: number; summary: string; ai: boolean; findings: Finding[]; passed: string[]; numbers: Record<string, number> }

const DAY = 86_400_000;
let cache: { at: number; value: HealthReport } | null = null;

export async function healthCheck(fresh = false): Promise<HealthReport> {
  if (cache && Date.now() - cache.at < (fresh ? 60_000 : 10 * 60_000)) return cache.value;
  const now = Date.now();
  const day = new Date(now - DAY).toISOString();
  const week = new Date(now - 7 * DAY).toISOString();

  const [c, topErrors, control, cf] = await Promise.all([
    selectColumns([
      ['openErrors', `(SELECT COUNT(*) FROM error_reports WHERE status IN ('NEW','DIAGNOSED'))`],
      ['newErrors', `(SELECT COUNT(*) FROM error_reports WHERE firstSeen > '${day}')`],
      ['highErrors', `(SELECT COUNT(*) FROM error_reports WHERE status IN ('NEW','DIAGNOSED') AND severity = 'high')`],
      ['serverErrors', `(SELECT COUNT(*) FROM error_reports WHERE source = 'SERVER' AND lastSeen > '${day}' AND status IN ('NEW','DIAGNOSED'))`],
      ['errorHits', `(SELECT COALESCE(SUM(count), 0) FROM error_reports WHERE lastSeen > '${day}' AND status IN ('NEW','DIAGNOSED'))`],
      ['signIns', `(SELECT COUNT(*) FROM login_events WHERE createdAt > '${day}' AND kind = 'SIGN_IN')`],
      ['signUps', `(SELECT COUNT(*) FROM login_events WHERE createdAt > '${day}' AND kind = 'SIGN_UP')`],
      ['signUpBursts', `(SELECT COUNT(*) FROM (SELECT ip FROM login_events WHERE kind = 'SIGN_UP' AND createdAt > '${day}' AND ip IS NOT NULL GROUP BY ip HAVING COUNT(*) >= 5))`],
      ['countryHoppers', `(SELECT COUNT(*) FROM (SELECT userId FROM login_events WHERE createdAt > '${day}' AND country IS NOT NULL GROUP BY userId HAVING COUNT(DISTINCT country) >= 3))`],
      ['manyDevices', `(SELECT COUNT(*) FROM (SELECT userId FROM login_events WHERE createdAt > '${day}' AND device IS NOT NULL GROUP BY userId HAVING COUNT(DISTINCT device) >= 5))`],
      ['admins', `(SELECT COUNT(*) FROM users WHERE role = 'ADMIN')`],
      ['newAdmins', `(SELECT COUNT(*) FROM role_applications WHERE requestedRole = 'ADMIN' AND status = 'APPROVED' AND reviewedAt > '${week}')`],
      ['suspended', `(SELECT COUNT(*) FROM users WHERE status = 'SUSPENDED')`],
      ['pendingApps', `(SELECT COUNT(*) FROM role_applications WHERE status = 'PENDING')`],
      ['oldPendingApps', `(SELECT COUNT(*) FROM role_applications WHERE status = 'PENDING' AND submittedAt < '${new Date(now - 3 * DAY).toISOString()}')`],
      ['safetyOpen', `(SELECT COUNT(*) FROM safety_alerts WHERE isResolved = 0)`],
      ['safetyHigh', `(SELECT COUNT(*) FROM safety_alerts WHERE isResolved = 0 AND severity IN ('HIGH','CRITICAL'))`],
      ['deletions', `(SELECT COUNT(*) FROM account_deletion_requests WHERE status = 'PENDING')`],
      ['failedPayments', `(SELECT COUNT(*) FROM payments WHERE status = 'FAILED' AND createdAt > '${week}')`],
      ['ownerChanges', `(SELECT COUNT(*) FROM owner_changes WHERE createdAt > '${day}')`],
    ]).catch(() => ({} as Record<string, unknown>)),
    prisma.errorReport.findMany({
      where: { status: { in: ['NEW', 'DIAGNOSED'] } },
      orderBy: [{ lastSeen: 'desc' }],
      take: 8,
      select: { source: true, kind: true, message: true, path: true, count: true, users: true, severity: true },
    }).catch(() => []),
    prisma.serverControl.findUnique({ where: { id: 'main' }, select: { mode: true } }).catch(() => null),
    Promise.race([cloudflareAccount().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 8000))]),
  ]);
  const n = (k: string) => Number((c as Record<string, unknown>)[k] ?? 0);
  const numbers = Object.fromEntries(Object.keys(c).map((k) => [k, n(k)]));

  const findings: Finding[] = [];
  const passed: string[] = [];
  if (!Object.keys(c).length) findings.push({ severity: 'medium', area: 'Site', title: "Couldn't read the database counts", detail: 'The numbers part of this check failed, so sign-in and account checks were skipped.', fix: 'Run the check again; if it keeps failing, ask Claude to look at the Health check.' });
  const check = (bad: boolean, f: Finding, ok: string) => (bad ? findings.push(f) : passed.push(ok));

  // Errors
  check(n('highErrors') > 0, { severity: 'high', area: 'Errors', title: `${n('highErrors')} serious problem(s) still open`, detail: 'AI marked these errors as high severity and they are not resolved yet.', fix: 'Open the Errors tab, read the diagnosis on each, and mark it Resolved once fixed.' }, 'No serious errors open');
  check(n('serverErrors') > 0, { severity: n('serverErrors') > 5 ? 'high' : 'medium', area: 'Errors', title: `${n('serverErrors')} server error(s) in the last 24 hours`, detail: 'Errors on the server can stop pages or payments working for everyone.', fix: 'Check the Errors tab, filter by Server, and send the top one to Claude to fix.' }, 'No new server errors today');
  check(n('newErrors') > 10, { severity: 'medium', area: 'Errors', title: `${n('newErrors')} new kinds of error today`, detail: 'Many new error types at once usually follow an update.', fix: 'If an update just went live, check the Errors tab; use "Put back live" on the Server tab if the site is broken.' }, 'Few new error types today');

  // Sign-ins and accounts
  check(n('signUpBursts') > 0, { severity: 'high', area: 'Security', title: 'Many sign-ups from one internet address', detail: `${n('signUpBursts')} address(es) created 5 or more accounts in a day. This is often spam or fake accounts.`, fix: 'Open People, sort by newest, and suspend or delete the fake accounts.' }, 'No bulk sign-ups from one address');
  check(n('countryHoppers') > 0, { severity: 'medium', area: 'Security', title: 'Accounts signing in from 3+ countries in a day', detail: `${n('countryHoppers')} account(s). This can mean a shared or stolen password.`, fix: 'Check those people in People → sign-ins, and suspend if it looks wrong.' }, 'No accounts jumping between countries');
  check(n('manyDevices') > 0, { severity: 'low', area: 'Security', title: 'Accounts used on 5+ devices in a day', detail: `${n('manyDevices')} account(s). Could be account sharing.`, fix: 'Look at their sign-ins in People; ask them to change their password if needed.' }, 'No accounts on unusually many devices');
  check(n('newAdmins') > 0, { severity: 'medium', area: 'Accounts', title: `${n('newAdmins')} new organisation (admin) account(s) this week`, detail: 'Organisation accounts get admin access to the platform.', fix: 'Confirm each one is a real organisation in Approvals history.' }, 'No new admin accounts this week');
  check(n('safetyHigh') > 0, { severity: 'high', area: 'Accounts', title: `${n('safetyHigh')} urgent safety report(s) open`, detail: 'Students reported something serious that is not resolved.', fix: 'Read and act on them in the admin portal → Student life → Safety.' }, 'No urgent safety reports');
  check(n('oldPendingApps') > 0, { severity: 'low', area: 'Accounts', title: `${n('oldPendingApps')} application(s) waiting over 3 days`, detail: 'People are waiting for approval.', fix: 'Review them in the admin portal → Approvals.' }, 'No applications waiting long');
  check(n('deletions') > 0, { severity: 'medium', area: 'Accounts', title: `${n('deletions')} account deletion request(s) waiting`, detail: 'Privacy law expects these to be handled within a month.', fix: 'Handle them in the Deletions tab.' }, 'No deletion requests waiting');
  check(n('failedPayments') > 3, { severity: 'medium', area: 'Site', title: `${n('failedPayments')} failed payments this week`, detail: 'Several failures can mean a Stripe setting problem.', fix: 'Check the Money tab and the Stripe line in Server → Server settings.' }, 'Payments are going through');

  // Settings (secret names only, never values)
  for (const s of serverSettings()) {
    if (s.needed && !s.set) findings.push({ severity: 'high', area: 'Settings', title: `${s.name} is missing`, detail: s.what, fix: `Add it in Cloudflare → universe-web → Settings → Variables and Secrets, as type Secret.` });
    else if (s.problem) findings.push({ severity: 'high', area: 'Settings', title: `${s.name} has a problem`, detail: s.problem, fix: 'Fix the value in Cloudflare → universe-web → Settings → Variables and Secrets.' });
  }
  if (!findings.some((f) => f.area === 'Settings')) passed.push('All needed secrets are set');
  if (control && control.mode !== 'LIVE') findings.push({ severity: 'low', area: 'Site', title: `The site is ${control.mode === 'MAINTENANCE' ? 'in maintenance' : 'read-only'}`, detail: 'People cannot fully use UniVerse right now.', fix: 'Switch back to Live on the Server tab when you are done.' });

  // Cloudflare: attacks, domain and email
  const cfv = cf as { setup?: boolean; attacks?: { ok: boolean; data?: { limited: boolean; total: number } }; domain?: { ok: boolean; data?: { checks: { name: string; ok: boolean | null; note: string }[] } } } | null;
  if (cfv?.setup) {
    const total = cfv.attacks?.data?.total ?? 0;
    if (total > 500) findings.push({ severity: 'medium', area: 'Security', title: `Cloudflare blocked ${total} threats today`, detail: 'Higher than usual; someone may be probing the site.', fix: 'Nothing to do unless the site slows down; Cloudflare is blocking them.' });
    else passed.push('Cloudflare threat level normal');
    for (const ch of cfv.domain?.data?.checks ?? []) {
      if (ch.ok === false) findings.push({ severity: ch.name.includes('certificate') ? 'high' : 'medium', area: ch.name === 'Email forwarding' ? 'Email' : 'Site', title: `${ch.name} needs attention`, detail: ch.note, fix: 'See Server → Cloudflare → Domain health.' });
      else if (ch.ok) passed.push(`${ch.name} OK`);
    }
    // The addresses shown on the Contact page must reach someone.
    const fwd = cfv.domain?.data?.checks.find((x) => x.name === 'Email forwarding');
    if (fwd?.ok) {
      const catchAll = /(^|; )all →/.test(fwd.note);
      const host = `@${COMPANY.website}`;
      const missing = Object.values(COMPANY.email).filter((a) => a.endsWith(host) && !catchAll && !fwd.note.includes(a));
      if (missing.length) findings.push({ severity: 'medium', area: 'Email', title: `${missing.length} contact address(es) don't forward anywhere`, detail: `${missing.join(', ')} are shown on the website but mail to them is lost.`, fix: 'Cloudflare → your domain → Email → Email Routing → Routing rules: add each address (or turn on Catch-all) and send it to your inbox.' });
      else passed.push('Contact email addresses forward');
    }
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const ruleScore = Math.max(0, 100 - findings.reduce((s, f) => s + (f.severity === 'high' ? 15 : f.severity === 'medium' ? 7 : 2), 0));

  // AI: ranks, merges and explains. Only counts, error messages and paths are sent (no personal data).
  const ai = await geminiJson<{ score: number; summary: string; findings: Finding[] }>(
    'You are the security and reliability reviewer for UniVerse, a university platform on Cloudflare Workers with a D1 database, run by a non-technical owner. Given findings from automatic checks, recent open errors and usage numbers, return: score (0-100, 100 = all healthy), a 2-3 sentence plain-English summary of the most important things, and findings: the given findings rewritten in very simple words, merged where duplicated, ranked by real risk, plus at most 3 extra findings you can clearly infer from the errors (for example a broken page, a bug pattern, or a security smell in an error message). Never invent problems that the data does not show. Keep each fix to concrete steps the owner can take, or "Ask Claude to fix: ..." for code bugs.',
    JSON.stringify({ findings, passed, numbers, openErrors: topErrors.map((e) => ({ ...e, message: e.message.slice(0, 300) })) }),
    {
      type: 'object',
      properties: {
        score: { type: 'integer' },
        summary: { type: 'string' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              severity: { type: 'string', enum: ['high', 'medium', 'low'] },
              area: { type: 'string', enum: ['Security', 'Errors', 'Settings', 'Email', 'Accounts', 'Site'] },
              title: { type: 'string' },
              detail: { type: 'string' },
              fix: { type: 'string' },
            },
            required: ['severity', 'area', 'title', 'detail', 'fix'],
          },
        },
      },
      required: ['score', 'summary', 'findings'],
    },
    2500,
  );

  const value: HealthReport = ai && Array.isArray(ai.findings)
    ? { checkedAt: new Date().toISOString(), score: Math.max(0, Math.min(100, Math.round(ai.score))), summary: ai.summary, ai: true, findings: ai.findings.sort((a, b) => order[a.severity] - order[b.severity]), passed, numbers }
    : {
      checkedAt: new Date().toISOString(),
      score: ruleScore,
      summary: findings.length ? `${findings.length} thing(s) need a look. AI ranking isn't available right now, so these come from the automatic checks.` : 'Everything the automatic checks look at is healthy.',
      ai: false,
      findings,
      passed,
      numbers,
    };
  cache = { at: Date.now(), value };
  return value;
}
