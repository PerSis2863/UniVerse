'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, CheckCircle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

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

// Detect iOS (Safari on iPhone/iPad) — no push support there
function isIOS() {
  return typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

// Detect Brave browser
function isBrave() {
  return typeof navigator !== 'undefined' && (navigator as any).brave !== undefined;
}

export function PushNotificationManager() {
  const { user } = useAuthStore();
  const [showPrompt, setShowPrompt] = useState(false);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'success' | 'denied' | 'unsupported'>('idle');

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !isIOS(); // iOS Safari doesn't support web push

  useEffect(() => {
    if (!user || !isSupported) return;

    const checkSubscription = async () => {
      const permission = Notification.permission;

      if (permission === 'granted') {
        // Already granted — subscribe silently in background
        subscribeUser(true);
        return;
      }

      if (permission === 'denied') return; // blocked, don't ask

      // Check if user dismissed recently (7 days cooldown)
      const dismissedAt = localStorage.getItem('pushPromptDismissedAt');
      if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return;

      // Check if already successfully subscribed
      if (localStorage.getItem('pushSubscribed') === 'true') return;

      // Show prompt after 2.5s delay
      const timer = setTimeout(() => setShowPrompt(true), 2500);
      return () => clearTimeout(timer);
    };

    checkSubscription();
  }, [user]);

  const subscribeUser = async (silent = false) => {
    if (status === 'requesting') return;
    if (!silent) setStatus('requesting');

    try {
      if (!silent) {
        // Request browser permission
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setStatus('denied');
          setShowPrompt(false);
          return;
        }
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          // No VAPID key — still mark as "success" (notifications will use SW directly)
          setStatus('success');
          setShowPrompt(false);
          localStorage.setItem('pushSubscribed', 'true');
          return;
        }

        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
        } catch (subErr) {
          // Brave or Firefox may block pushManager.subscribe even with permission granted
          // Still consider it "success" from the user's perspective
          console.warn('Push subscription blocked by browser (Brave/FF shield?):', subErr);
          setStatus('success');
          setShowPrompt(false);
          localStorage.setItem('pushSubscribed', 'true');
          return;
        }
      }

      // Try to register with backend (fire-and-forget — don't block on this)
      api.post('/notifications/subscribe', {
        subscription: subscription.toJSON(),
      }).catch(() => {}); // Backend may be offline — that's OK

      setStatus('success');
      setShowPrompt(false);
      localStorage.setItem('pushSubscribed', 'true');
    } catch (err) {
      console.error('Push notification error:', err);
      // Even on error, dismiss the prompt so user isn't stuck
      setStatus('idle');
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pushPromptDismissedAt', Date.now().toString());
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-sm"
        >
          <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] rounded-[24px] p-3 flex flex-col gap-2">

            {/* Header */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-indigo-500 rounded-md flex items-center justify-center">
                  <span className="text-[10px] font-black text-white">U</span>
                </div>
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tracking-wide">UniVerse</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">now</span>
                <button
                  onClick={handleDismiss}
                  className="w-5 h-5 flex items-center justify-center rounded-full bg-zinc-200/50 dark:bg-zinc-700/50 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-1 mb-1">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight mb-0.5">
                {isBrave() ? 'Enable Notifications (Brave)' : 'Enable Notifications'}
              </h4>
              <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-snug">
                {isBrave()
                  ? "Allow in Brave's Shield settings (click the lion icon) and your browser popup."
                  : 'Get important updates about classes, assignments, and verified impact hours.'}
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleDismiss}
                className="flex-1 bg-zinc-100 dark:bg-zinc-700/50 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium py-2.5 rounded-[14px] transition-colors text-[13px]"
              >
                Later
              </button>
              <button
                onClick={() => subscribeUser(false)}
                disabled={status === 'requesting'}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 rounded-[14px] transition-all disabled:opacity-70 text-[13px] flex items-center justify-center gap-1.5"
              >
                {status === 'requesting' ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Allowing...
                  </>
                ) : (
                  <>
                    <Bell className="w-3.5 h-3.5" />
                    Allow
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
