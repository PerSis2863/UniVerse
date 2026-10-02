import { getCloudflareContext } from '@opennextjs/cloudflare';
import prisma from '@/lib/db';
import { publish } from './realtime';

// In-app notifications, plus an email copy for people who have "Email notifications" on
// (Settings → Notifications). Email is sent through Resend and is skipped when RESEND_API_KEY
// isn't set, so everything still works without it.

/** The sender: whatever address RESEND_FROM names, always shown as "UniVerse Impact". */
export const FROM = () => {
  const raw = (process.env.RESEND_FROM || 'onboarding@resend.dev').trim();
  const address = raw.match(/<([^>]+)>/)?.[1] ?? raw;
  return `UniVerse Impact <${address}>`;
};
export const APP_URL = () => (process.env.PUBLIC_APP_URL || 'https://universeimpact.com').replace(/\/$/, '');

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to: [to], subject, html, text }),
  }).catch((e) => {
    console.error('Email failed:', e);
    return null;
  });
  if (res && !res.ok) console.error('Email failed:', res.status, await res.text().catch(() => ''));
  return !!res?.ok;
}

function layout(title: string, body: string, link?: string) {
  const url = link ? `${APP_URL()}${link.startsWith('/') ? link : `/${link}`}` : APP_URL();
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;padding:32px">
<tr><td><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:10px"><img src="${APP_URL()}/icon-192x192.png" width="36" height="36" alt="UniVerse Impact" style="display:block;border-radius:10px"></td><td style="font-size:17px;font-weight:700;color:#18181b">UniVerse <span style="color:#6366f1">Impact</span></td></tr></table></td></tr>
<tr><td style="padding-top:16px;font-size:20px;font-weight:700;color:#18181b">${escapeHtml(title)}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.5;color:#3f3f46;white-space:pre-wrap">${escapeHtml(body)}</td></tr>
<tr><td style="padding-top:24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:10px">Open UniVerse Impact</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#a1a1aa">You get these emails because email notifications are on. You can turn them off in UniVerse under Settings → Notifications.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `UniVerse Impact\n\n${title}\n\n${body}\n\nOpen UniVerse Impact: ${url}\n\nTurn these emails off in Settings → Notifications.`;
  return { html, text };
}

export interface NotifyInput {
  title: string;
  body: string;
  link?: string;
  type?: string; // info, grade, credential, chat, reminder …
  email?: boolean; // default true: also email people who have email notifications on
}

/** Creates an in-app notification and, if the user wants them, emails a copy. Never throws. */
export async function notify(userId: string, n: NotifyInput): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailNotifications: true, status: true } });
    if (!user) return;
    await prisma.notification.create({ data: { userId, title: n.title.slice(0, 200), body: n.body.slice(0, 1000), type: n.type ?? 'info', link: n.link ?? null } });
    publish([userId], { type: 'notification' });
    if (n.email !== false && user.emailNotifications && user.status !== 'SUSPENDED' && user.email) {
      const { html, text } = layout(n.title, n.body, n.link);
      await sendEmail(user.email, n.title, html, text);
    }
  } catch (e) {
    console.error('notify failed:', e);
  }
}

/**
 * The same notification for many people at once, in a few queries: D1 on Workers Free allows 50
 * queries per request and calling notify() for each person needs two or more. Emails go out
 * through Resend's batch endpoint, 100 per call. Never throws; returns how many got it.
 */
export async function notifyMany(userIds: string[], n: NotifyInput): Promise<number> {
  const ids = [...new Set(userIds)];
  let sent = 0;
  try {
    const now = new Date().toISOString().replace('Z', '+00:00');
    const title = n.title.slice(0, 200), body = n.body.slice(0, 1000);
    const people: { id: string; email: string; emailNotifications: boolean; lastSeenAt: Date | null }[] = [];
    // D1 takes up to 100 values per query: 90 people per statement.
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const marks = part.map(() => '?').join(',');
      sent += await prisma.$executeRawUnsafe(
        `INSERT INTO notifications (id, userId, title, body, type, read, link, createdAt) SELECT lower(hex(randomblob(12))), id, ?, ?, ?, 0, ?, ? FROM users WHERE status != 'SUSPENDED' AND id IN (${marks})`,
        title, body, n.type ?? 'info', n.link ?? null, now, ...part,
      );
      people.push(...(await prisma.user.findMany({ where: { id: { in: part }, status: { not: 'SUSPENDED' } }, select: { id: true, email: true, emailNotifications: true, lastSeenAt: true } })));
    }
    // Ring the bell now for people using UniVerse at the moment (the rest see it next time).
    publish(people.filter((p) => p.lastSeenAt && p.lastSeenAt.getTime() > Date.now() - 5 * 60_000).slice(0, 40).map((p) => p.id), { type: 'notification' });
    const key = process.env.RESEND_API_KEY;
    const to = n.email === false || !key ? [] : people.filter((p) => p.emailNotifications && p.email);
    const { html, text } = layout(n.title, n.body, n.link);
    for (let i = 0; i < to.length; i += 100) {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(to.slice(i, i + 100).map((p) => ({ from: FROM(), to: [p.email], subject: n.title, html, text }))),
      }).catch((e) => (console.error('Batch email failed:', e), null));
      if (res && !res.ok) console.error('Batch email failed:', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.error('notifyMany failed:', e);
  }
  return sent;
}

/** Runs work after the response is sent (falls back to running it inline outside Workers). */
export function later(work: () => Promise<unknown>) {
  const p = work().catch((e) => console.error('Background task failed:', e));
  try {
    getCloudflareContext().ctx.waitUntil(p);
  } catch {
    /* not on Workers: the promise just runs */
  }
}
