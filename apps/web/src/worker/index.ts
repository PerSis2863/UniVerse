/// <reference lib="webworker" />
// Added to the service worker by next-pwa (customWorkerSrc in next.config.ts): shows Web Push
// notifications (src/server/services/push.service.ts) and opens the right page when one is tapped.
// A call rings with Answer / Decline; others can carry their own buttons (Reply, Join…, Stage 5 · Q9),
// each opening its own address; a tap anywhere else opens the notification's link.
export {};
declare const self: ServiceWorkerGlobalScope;

interface PushData { title?: string; body?: string; url?: string; icon?: string; badge?: string; tag?: string; call?: boolean; actions?: { action: string; title: string; url: string }[] }

/** Only addresses inside UniVerse, so a button can never open somewhere else. */
const inApp = (u: unknown) => { try { const x = new URL(String(u), self.location.origin); return x.origin === self.location.origin ? x.pathname + x.search + x.hash : null; } catch { return null; } };

self.addEventListener('push', (event) => {
  let data: PushData = {};
  try { data = event.data?.json() ?? {}; } catch { data = { title: 'UniVerse', body: event.data?.text() }; }
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[]; actions?: { action: string; title: string }[] } = {
    body: data.body ?? '',
    icon: data.icon ?? '/icon-192x192.png',
    badge: data.badge ?? '/icon-192x192.png',
    tag: data.tag,
    renotify: !!data.tag,
  };
  const buttons = (data.call ? [] : data.actions ?? []).slice(0, 2).flatMap((a) => { const url = inApp(a.url); return url && a.action && a.title ? [{ action: String(a.action).slice(0, 20), title: String(a.title).slice(0, 24), url }] : []; });
  options.data = { url: data.url ?? '/', actions: Object.fromEntries(buttons.map((b) => [b.action, b.url])) };
  options.requireInteraction = !!data.call;
  options.vibrate = data.call ? [400, 200, 400, 200, 400] : [120];
  options.actions = data.call ? [{ action: 'answer', title: 'Answer' }, { action: 'decline', title: 'Decline' }] : buttons.map(({ action, title }) => ({ action, title }));
  event.waitUntil(lockedChat(data.url).then((locked) => {
    // A chat locked on this device (Stage 4 · 1.10): nothing of it shows on the lock screen.
    if (locked) { options.body = 'New message'; return self.registration.showNotification('UniVerse', options); }
    return self.registration.showNotification(data.title ?? 'UniVerse', options);
  }).then(iconCount));
});

/** The count on the home-screen icon while the app is closed (M42): the notifications waiting in the
 *  tray. When the app opens, the bell's real unread count replaces it (Topbar). */
async function iconCount() {
  if (!('setAppBadge' in self.navigator)) return;
  const waiting = await self.registration.getNotifications().catch(() => []);
  await self.navigator.setAppBadge(waiting.length).catch(() => {});
}

/** Whether a push's link opens a chat locked on this device (src/lib/chat-lock.ts keeps the list here). */
async function lockedChat(url: string | undefined): Promise<boolean> {
  const id = url ? new URL(url, self.location.origin).searchParams.get('c') : null;
  if (!id) return false;
  try {
    const res = await (await caches.open('universe-private')).match('/__chat-lock');
    const chats = res ? ((await res.json()) as { chats?: string[] }).chats ?? [] : [];
    return chats.includes(id);
  } catch { return false; }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(iconCount());
  if (event.action === 'decline') return; // the call simply stops ringing here
  const d = event.notification.data as { url?: string; actions?: Record<string, string> } | null;
  const url = new URL((event.action && d?.actions?.[event.action]) || d?.url || '/', self.location.origin).href;
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
