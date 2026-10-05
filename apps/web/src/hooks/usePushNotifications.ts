'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { subscribePush } from '@/lib/push-subscribe';

interface UsePushNotifications {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotifications {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
      // Check existing subscription
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== 'granted') return false;

    const ok = (await subscribePush(await navigator.serviceWorker.ready)) === 'ok';
    setIsSubscribed(ok);
    return ok;
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await api.post('/notifications/unsubscribe', { endpoint: sub.endpoint });
      setIsSubscribed(false);
    }
  }, []);

  return { isSupported, permission, isSubscribed, subscribe, unsubscribe };
}
