import prisma from '@/lib/db';
import { emailDue, parseEmailSchedule } from '@/lib/feature-switches';
import { ownerEmails } from './auth';
import { APP_URL, escapeHtml, sendEmail } from './email';
import { selectColumns } from './table-stats';

// The owner's morning summary email: the last 24 hours on UniVerse in numbers, and what needs a
// look. Sent by its own daily cron (cloudflare/worker.ts) so it has its own query allowance.
// How often it comes (daily, weekly on Mondays, monthly on the 1st, or off) is set in the console →
// Server → Your emails; a weekly or monthly one covers the whole period.

const DAY = 86_400_000;

export async function emailOwnerDigest(now = Date.now()): Promise<string> {
  const ctl = await prisma.serverControl.findUnique({ where: { id: 'main' }, select: { switches: true, mode: true } }).catch(() => null);
  const every = parseEmailSchedule(ctl?.switches).digest;
  const { due, days } = emailDue(every, new Date(now));
  if (!due) return every === 'off' ? 'off' : `not today (${every})`;
  const span = every === 'daily' ? 'yesterday' : every === 'weekly' ? 'this week' : 'last month';
  const day = new Date(now - days * DAY).toISOString();
  const week = new Date(now - 7 * DAY).toISOString();
  const c = await selectColumns([
    ['people', `(SELECT COUNT(*) FROM users)`],
    ['joined', `(SELECT COUNT(*) FROM users WHERE createdAt > '${day}')`],
    ['active', `(SELECT COUNT(*) FROM users WHERE lastSeenAt > '${day}')`],
    ['activeWeek', `(SELECT COUNT(*) FROM users WHERE lastSeenAt > '${week}')`],
    ['messages', `(SELECT COUNT(*) FROM messages WHERE createdAt > '${day}' AND type != 'SYSTEM')`],
    ['views', `(SELECT COUNT(*) FROM ui_events WHERE createdAt > '${day}' AND kind = 'VIEW')`],
    ['newErrors', `(SELECT COUNT(*) FROM error_reports WHERE firstSeen > '${day}')`],
    ['openErrors', `(SELECT COUNT(*) FROM error_reports WHERE status IN ('NEW','DIAGNOSED'))`],
    ['paid', `(SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'COMPLETED' AND createdAt > '${day}')`],
    ['failed', `(SELECT COUNT(*) FROM payments WHERE status = 'FAILED' AND createdAt > '${day}')`],
    ['deletions', `(SELECT COUNT(*) FROM account_deletion_requests WHERE status = 'PENDING')`],
    ['applications', `(SELECT COUNT(*) FROM role_applications WHERE status = 'PENDING')`],
  ]);
  const guard = await prisma.usageGuard.findUnique({ where: { id: 'main' }, select: { meters: true } }).catch(() => null);
  const meters: { label: string; used: number | null; limit: number }[] = guard?.meters ? JSON.parse(guard.meters) : [];
  const top = meters.filter((m) => m.used != null && m.limit > 0).sort((a, b) => (b.used ?? 0) / b.limit - (a.used ?? 0) / a.limit)[0];
  const n = (k: string) => Number(c[k] ?? 0);
  const rows: [string, string][] = [
    ['People active', every === 'daily' ? `${n('active')} today · ${n('activeWeek')} this week · ${n('people')} in total` : `${n('active')} ${span} · ${n('people')} in total`],
    ['New accounts', String(n('joined'))],
    ['Messages sent', String(n('messages'))],
    ['Pages opened', String(n('views'))],
    ['Money received', `$${n('paid').toFixed(2)}${n('failed') ? ` · ${n('failed')} failed` : ''}`],
    ['Problems', `${n('newErrors')} new · ${n('openErrors')} open`],
    ...(top ? [['Highest Cloudflare use', `${top.label}: ${Math.round(((top.used ?? 0) / top.limit) * 100)}% of the month`] as [string, string]] : []),
  ];
  const todo = [
    ctl && ctl.mode !== 'LIVE' && `The site is ${ctl.mode === 'MAINTENANCE' ? 'in maintenance' : 'read-only'}.`,
    n('deletions') && `${n('deletions')} account deletion request(s) waiting.`,
    n('applications') && `${n('applications')} teacher or staff application(s) waiting.`,
    n('newErrors') && `${n('newErrors')} new problem(s) to look at.`,
    n('failed') && `${n('failed')} payment(s) failed.`,
  ].filter(Boolean) as string[];
  const link = `${APP_URL()}/console`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#18181b">
<h2 style="margin:0 0 4px">UniVerse ${span}</h2><p style="margin:0 0 16px;color:#71717a">The last ${days === 1 ? '24 hours' : `${days} days`}, from your live database.</p>
<table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#71717a">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right;font-weight:600">${escapeHtml(v)}</td></tr>`).join('')}</table>
${todo.length ? `<h3 style="margin:20px 0 6px">Needs a look</h3><ul style="padding-left:18px;margin:0">${todo.map((t) => `<li style="margin-bottom:4px">${escapeHtml(t)}</li>`).join('')}</ul>` : '<p style="margin-top:20px">Nothing needs you right now.</p>'}
<p style="margin-top:20px"><a href="${link}">Open the owner console →</a></p>
<p style="color:#a1a1aa;font-size:12px">Get it daily, weekly, monthly or not at all: owner console → Server → Your emails.</p></div>`;
  const text = `UniVerse ${span}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${todo.length ? `Needs a look:\n${todo.map((t) => `- ${t}`).join('\n')}` : 'Nothing needs you right now.'}\n\n${link}`;
  const owners = ownerEmails();
  const sent = await Promise.all(owners.map((to) => sendEmail(to, `UniVerse: ${n('active')} active, ${n('joined')} new${todo.length ? `, ${todo.length} to look at` : ''}`, html, text)));
  return `sent ${sent.filter(Boolean).length}/${owners.length}`;
}
