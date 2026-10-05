'use client';

import { api } from './api';
import { captureError } from './error-monitor';

// Signing this device up for push notifications (src/server/services/push.service.ts), shared by
// the prompt, Settings and the background check. A wrong build value (on 5 Oct 2026 the key was an
// email address) used to be treated as "done" and never retried; now it's reported to the owner
// console. A device signed up with an older key is signed up again with the current one. The
// server only hears about it when the subscription is new or changed, not on every page load.

export type PushResult = 'ok' | 'no-key' | 'blocked' | 'failed';

const SENT_KEY = 'uv-push-endpoint';
let reported = false;

/** The VAPID public key built into the app, or null when it's missing or isn't a VAPID key. */
export function vapidKey(): string | null {
  const k = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();
  return /^B[A-Za-z0-9_-]{80,90}$/.test(k) ? k : null;
}

function toBytes(base64: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);

function report(why: string) {
  if (reported) return;
  reported = true;
  captureError(new Error(`Push sign-up failed: ${why}`), 'manual');
}

/** Subscribes (or re-subscribes) this device. Call only once notification permission is granted. */
export async function subscribePush(registration: ServiceWorkerRegistration): Promise<PushResult> {
  const key = vapidKey();
  if (!key) {
    report('NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing or not a VAPID public key (check the Cloudflare build variable)');
    return 'no-key';
  }
  const want = toBytes(key);
  try {
    let sub = await registration.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, want)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    sub ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
    let sent: string | null = null;
    try { sent = localStorage.getItem(SENT_KEY); } catch { /* storage blocked */ }
    if (sent !== sub.endpoint) {
      await api.post('/notifications/subscribe', { subscription: sub.toJSON() });
      try { localStorage.setItem(SENT_KEY, sub.endpoint); } catch { /* storage blocked */ }
    }
    return 'ok';
  } catch (e) {
    const name = (e as Error)?.name;
    // Brave's shields and some privacy settings refuse push even with permission: not our bug.
    if (name === 'NotAllowedError' || name === 'AbortError') return 'blocked';
    report((e as Error)?.message || String(e));
    return 'failed';
  }
}
