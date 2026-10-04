import { buildPushPayload } from '@block65/webcrypto-web-push';
import prisma from '@/lib/db';
import { planLimits } from '@/lib/plan-limits';

// Web Push (VAPID) with Web Crypto, so it runs on Cloudflare Workers (the old API used `web-push`,
// which needs Node's networking). Push is disabled until VAPID keys are configured.
function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { subject: `mailto:${process.env.VAPID_EMAIL || 'admin@universe.edu'}`, publicKey, privateKey };
}

export interface PushPayload { title: string; body: string; icon?: string; url?: string; /** Replaces an earlier notification with the same tag. */ tag?: string; /** Rings with Answer / Decline (src/worker/index.ts). */ call?: boolean }

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
   * allows 50 per request). Expired subscriptions are removed.
   */
  async sendToMany(userIds: string[], payload: PushPayload) {
    const keys = vapid();
    if (!keys || userIds.length === 0) return 0;
    const ids = [...new Set(userIds)].slice(0, 90);
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
    return subscriptions.length - failed;
  }

  async sendToAll(payload: { title: string; body: string; icon?: string; url?: string }) {
    if (!vapid()) return;
    const subs = await prisma.pushSubscription.findMany({ select: { userId: true } });
    await Promise.allSettled([...new Set(subs.map((s) => s.userId))].map((uid) => this.sendToUser(uid, payload)));
  }
}

export const pushService = new PushService();
