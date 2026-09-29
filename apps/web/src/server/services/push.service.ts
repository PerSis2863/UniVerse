import { buildPushPayload } from '@block65/webcrypto-web-push';
import prisma from '@/lib/db';

// Web Push (VAPID) with Web Crypto, so it runs on Cloudflare Workers (the old API used `web-push`,
// which needs Node's networking). Push is disabled until VAPID keys are configured.
function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { subject: `mailto:${process.env.VAPID_EMAIL || 'admin@universe.edu'}`, publicKey, privateKey };
}

export class PushService {
  async subscribe(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      create: { userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    });
  }

  async unsubscribe(endpoint: string, userId: string) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  }

  async sendToUser(userId: string, payload: { title: string; body: string; icon?: string; url?: string }) {
    const keys = vapid();
    if (!keys) return;
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon-192x192.png',
      badge: '/icon-192x192.png',
      url: payload.url || '/',
    });
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const request = await buildPushPayload(
          { data, options: { ttl: 60 * 60 * 24 } },
          { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          keys,
        );
        const res = await fetch(sub.endpoint, request);
        // 404/410 = the subscription expired; clean it up.
        if (res.status === 404 || res.status === 410) await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        if (!res.ok) throw new Error(`Push failed with ${res.status}`);
      }),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) console.warn(`${failed}/${subscriptions.length} push notifications failed for user ${userId}`);
  }

  async sendToAll(payload: { title: string; body: string; icon?: string; url?: string }) {
    if (!vapid()) return;
    const subs = await prisma.pushSubscription.findMany({ select: { userId: true } });
    await Promise.allSettled([...new Set(subs.map((s) => s.userId))].map((uid) => this.sendToUser(uid, payload)));
  }
}

export const pushService = new PushService();
