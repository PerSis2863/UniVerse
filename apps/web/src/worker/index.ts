/// <reference lib="webworker" />
// Added to the service worker by next-pwa (customWorkerSrc in next.config.ts): shows Web Push
// notifications (src/server/services/push.service.ts) and opens the right page when one is tapped.
// A call rings with Answer / Decline; anything else opens its link.
export {};
declare const self: ServiceWorkerGlobalScope;

interface PushData { title?: string; body?: string; url?: string; icon?: string; badge?: string; tag?: string; call?: boolean }

self.addEventListener('push', (event) => {
  let data: PushData = {};
  try { data = event.data?.json() ?? {}; } catch { data = { title: 'UniVerse', body: event.data?.text() }; }
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[]; actions?: { action: string; title: string }[] } = {
    body: data.body ?? '',
    icon: data.icon ?? '/icon-192x192.png',
    badge: data.badge ?? '/icon-192x192.png',
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url ?? '/' },
    requireInteraction: !!data.call,
    vibrate: data.call ? [400, 200, 400, 200, 400] : [120],
    actions: data.call ? [{ action: 'answer', title: 'Answer' }, { action: 'decline', title: 'Decline' }] : [],
  };
  event.waitUntil(self.registration.showNotification(data.title ?? 'UniVerse', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'decline') return; // the call simply stops ringing here
  const url = new URL((event.notification.data as { url?: string } | null)?.url ?? '/', self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse an open UniVerse tab when there is one.
    for (const tab of tabs) {
      if (new URL(tab.url).origin === self.location.origin && 'focus' in tab) {
        await (tab as WindowClient).focus();
        await (tab as WindowClient).navigate(url).catch(() => self.clients.openWindow(url));
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
