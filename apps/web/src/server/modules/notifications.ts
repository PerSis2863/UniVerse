import type { Router } from '../router';
import { pushService } from '../services/push.service';

export default function notificationsModule(router: Router) {
  const r = router.controller('notifications');

  r.post('subscribe', async ({ user, body }) => {
    await pushService.subscribe(user.id, body.subscription);
    return { success: true, message: 'Subscribed to push notifications' };
  });
  r.post('unsubscribe', async ({ body }) => {
    await pushService.unsubscribe(body.endpoint);
    return { success: true, message: 'Unsubscribed from push notifications' };
  });
  r.get('vapid-public-key', { public: true }, () => ({ publicKey: process.env.VAPID_PUBLIC_KEY || '' }));
}
