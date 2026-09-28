import { getCloudflareContext } from '@opennextjs/cloudflare';
import prisma from '@/lib/db';
import { publish } from './realtime';

// In-app notifications, plus an email copy for people who have "Email notifications" on
// (Settings → Notifications). Email is sent through Resend and is skipped when RESEND_API_KEY
// isn't set, so everything still works without it.

const FROM = () => process.env.RESEND_FROM || 'UniVerse <onboarding@resend.dev>';
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
<tr><td style="font-size:13px;font-weight:700;color:#6366f1;letter-spacing:.04em">UNIVERSE</td></tr>
<tr><td style="padding-top:16px;font-size:20px;font-weight:700;color:#18181b">${escapeHtml(title)}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.5;color:#3f3f46;white-space:pre-wrap">${escapeHtml(body)}</td></tr>
<tr><td style="padding-top:24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:10px">Open UniVerse</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#a1a1aa">You get these emails because email notifications are on. You can turn them off in UniVerse under Settings → Notifications.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${title}\n\n${body}\n\nOpen UniVerse: ${url}\n\nTurn these emails off in Settings → Notifications.`;
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

/** Runs work after the response is sent (falls back to running it inline outside Workers). */
export function later(work: () => Promise<unknown>) {
  const p = work().catch((e) => console.error('Background task failed:', e));
  try {
    getCloudflareContext().ctx.waitUntil(p);
  } catch {
    /* not on Workers: the promise just runs */
  }
}
