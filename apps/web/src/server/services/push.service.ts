import { buildPushPayload } from '@block65/webcrypto-web-push';
import prisma from '@/lib/db';
import { count } from '../health-counts';
import { planLimits } from '@/lib/plan-limits';
import { quietNow } from '../quiet-hours';
import { pushRecipients } from '../notify-settings';

// Web Push (VAPID) with Web Crypto, so it runs on Cloudflare Workers (the old API used `web-push`,
// which needs Node's networking). Push is disabled until VAPID keys are configured.
function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { subject: `mailto:${process.env.VAPID_EMAIL || 'admin@universe.edu'}`, publicKey, privateKey };
}

export interface PushPayload {
  title: string; body: string; icon?: string; url?: string;
  /** Replaces an earlier notification with the same tag; also says what kind it is (src/lib/notify-prefs.ts). */
  tag?: string;
  /** Rings with Answer / Decline (src/worker/index.ts). */
  call?: boolean;
  /** Stage 5 · Q9: its kind when the tag doesn't say, and the course (people who muted it get it in their summary). */
  kind?: string;
  courseId?: string | null;
  /** Buttons on the notification (Reply, Join…), each opening its own address (src/worker/index.ts). */
  actions?: { action: string; title: string; url: string }[];
}

export const pushEnabled = () => vapid() !== null;

export class PushService {
  async subscribe(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      // A shared computer: the device now belongs to whoever signed in last.
      update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      create: { userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    });
  }

  async unsubscribe(endpoint: string, userId: string) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  }

  async sendToUser(userId: string, payload: PushPayload) {
    await this.sendToMany([userId], payload);
  }

  /**
   * One notification to each of these people's devices: one query for all their subscriptions,
   * then one request per device, at most planLimits().pushes (each is a subrequest; Workers Free
   * allows 50 per request). Expired subscriptions are removed. People in their quiet hours get
   * nothing (Stage 4 · 4.10): it's still in the app when they look.
   */
  async sendToMany(userIds: string[], payload: PushPayload) {
    const keys = vapid();
    if (!keys || userIds.length === 0) return 0;
    const all = [...new Set(userIds)].slice(0, 90);
    const quiet = await quietNow(all).catch(() => new Set<string>());
    // Their settings (Stage 5 · Q9): kinds they want in the daily summary or not at all, muted courses.
    const ids = await pushRecipients(all.filter((id) => !quiet.has(id)), payload).catch(() => all.filter((id) => !quiet.has(id)));
    if (!ids.length) return 0;
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: planLimits().pushes });
    if (!subscriptions.length) return 0;
    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon-192x192.png',
      badge: '/icon-192x192.png',
      url: payload.url || '/',
      tag: payload.tag,
      call: payload.call === true,
      actions: payload.actions?.slice(0, 2),
    });
    const expired: string[] = [];
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const request = await buildPushPayload(
          // A call is only worth ringing for a minute; anything else can wait a day.
          { data, options: { ttl: payload.call ? 60 : 60 * 60 * 24, urgency: payload.call ? 'high' : 'normal' } },
          { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          keys,
        );
        const res = await fetch(sub.endpoint, request);
        if (res.status === 404 || res.status === 410) expired.push(sub.endpoint);
        if (!res.ok) throw new Error(`Push failed with ${res.status}`);
      }),
    );
    if (expired.length) await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: expired } } });
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > expired.length) console.warn(`${failed}/${subscriptions.length} push notifications failed`);
    await count({ 'push.ok': subscriptions.length - failed, 'push.failed': failed - expired.length, 'push.expired': expired.length });
    return subscriptions.length - failed;
  }

  /**
   * A different notification for each of these devices (the daily brief's counts differ per person),
   * all at once: one request per device, so callers keep within planLimits().pushes.
   */
  async sendEach(items: { subscription: { userId?: string; endpoint: string; p256dh: string; auth: string }; payload: PushPayload }[]) {
    const keys = vapid();
    if (!keys || !items.length) return 0;
    // Quiet hours (Stage 4 · 4.10): skipped like any other push.
    const people = [...new Set(items.map((i) => i.subscription.userId).filter((u): u is string => !!u))];
    const quiet = await quietNow(people).catch(() => new Set<string>());
    // Their settings (Stage 5 · Q9), when every item is the same kind of push (the morning brief and
    // the daily summary have their own switches and always pass).
    const first = items[0]?.payload;
    const allowed = first && items.every((i) => i.payload.tag === first.tag) ? new Set(await pushRecipients(people, first).catch(() => people)) : new Set(people);
    items = items.filter((i) => !i.subscription.userId || (!quiet.has(i.subscription.userId) && allowed.has(i.subscription.userId)));
    const expired: string[] = [];
    const results = await Promise.allSettled(
      items.map(async ({ subscription: sub, payload }) => {
        const data = JSON.stringify({ title: payload.title, body: payload.body, icon: payload.icon || '/icon-192x192.png', badge: '/icon-192x192.png', url: payload.url || '/', tag: payload.tag, call: false });
        // Worth showing for a few hours (a morning brief at night isn't).
        const request = await buildPushPayload({ data, options: { ttl: 6 * 3600, urgency: 'normal' } }, { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } }, keys);
        const res = await fetch(sub.endpoint, request);
        if (res.status === 404 || res.status === 410) expired.push(sub.endpoint);
        if (!res.ok) throw new Error(`Push failed with ${res.status}`);
      }),
    );
    if (expired.length) await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: expired } } });
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    await count({ 'push.ok': ok, 'push.failed': results.length - ok - expired.length, 'push.expired': expired.length });
    return ok;
  }

  async sendToAll(payload: { title: string; body: string; icon?: string; url?: string }) {
    if (!vapid()) return;
    const subs = await prisma.pushSubscription.findMany({ select: { userId: true } });
    await Promise.allSettled([...new Set(subs.map((s) => s.userId))].map((uid) => this.sendToUser(uid, payload)));
  }
}

export const pushService = new PushService();
