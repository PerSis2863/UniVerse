import type { Router } from '../router';
import { pushService } from '../services/push.service';
import { BadRequestException } from '../http';

export default function notificationsModule(router: Router) {
  const r = router.controller('notifications');

  r.post('subscribe', async ({ user, body }) => {
    const sub = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null | undefined;
    if (typeof sub?.endpoint !== 'string' || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys.auth !== 'string') throw new BadRequestException('A push subscription is required.');
    await pushService.subscribe(user.id, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    return { success: true, message: 'Subscribed to push notifications' };
  });
  r.post('unsubscribe', async ({ body, user }) => {
    if (typeof body?.endpoint === 'string') await pushService.unsubscribe(body.endpoint, user.id);
    return { success: true, message: 'Unsubscribed from push notifications' };
  });
  r.get('vapid-public-key', { public: true }, () => ({ publicKey: process.env.VAPID_PUBLIC_KEY || '' }));
}
