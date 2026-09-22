'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const isIOS = () => typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

export function NotificationPermissionPrompt() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'denied' | 'blocked'>('idle');
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    const supported = !isIOS() && 'serviceWorker' in navigator && 'Notification' in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
      if (Notification.permission === 'granted' && localStorage.getItem('pushSubscribed') === 'true') {
        setStatus('success');
      } else if (Notification.permission === 'denied') {
        setStatus('blocked');
      }
    }
  }, []);

  const handleEnable = async () => {
    if (status === 'loading') return;
    setStatus('loading');

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'blocked' : 'idle');
        return;
      }

      localStorage.setItem('pushSubscribed', 'true');
      setStatus('success');

      // Try to subscribe to push asynchronously in the background so it doesn't block the UI
      // If service worker isn't ready (e.g. in dev mode or blocked), this won't hang the UI.
      (async () => {
        try {
          const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 3000))
          ]) as ServiceWorkerRegistration;
          
          let subscription = await registration.pushManager.getSubscription();

          if (!subscription) {
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (vapidKey) {
              subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey),
              });
            }
          }

          if (subscription) {
            api.post('/notifications/subscribe', { subscription: subscription.toJSON() }).catch(() => {});
          }
        } catch (e) {
          console.warn('Push subscription failed or SW not available:', e);
        }
      })();

    } catch {
      setStatus('idle');
    }
  };

  if (!isSupported) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <BellOff className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        <p className="text-sm text-zinc-500">
          {isIOS()
            ? 'Add UniVerse to your Home Screen to enable notifications on iOS.'
            : 'Push notifications not supported in this browser.'}
        </p>
      </div>
    );
  }

  if (status === 'blocked' || permission === 'denied') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/5 border border-red-500/20">
        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
        <div>
          <p className="text-sm text-red-400 font-medium">Notifications blocked</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Open your browser settings → Site Settings → Notifications → Allow for this site.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <div>
          <p className="text-sm text-emerald-400 font-medium">Notifications enabled ✓</p>
          <p className="text-xs text-zinc-500 mt-0.5">You'll receive alerts for grades, messages & announcements.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        <div className="p-2.5 rounded-xl flex-shrink-0 bg-indigo-500/10">
          <Bell className="w-5 h-5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Enable Push Notifications</p>
          <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
            Get instant alerts for grades, messages from teachers, and important announcements.
          </p>
        </div>
        <button
          onClick={handleEnable}
          disabled={status === 'loading'}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/20 disabled:opacity-70 transition-all"
        >
          {status === 'loading' ? (
            <>
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Enabling...
            </>
          ) : (
            <>
              <Bell className="w-3.5 h-3.5" />
              Enable
            </>
          )}
        </button>
      </div>
    </div>
  );
}
