'use client';

import { useState, useEffect } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, CheckCircle, X } from 'lucide-react';
import { subscribePush } from '@/lib/push-subscribe';
import { useAuthStore } from '@/store/auth';
import { LogoMark } from '@/components/ui/LogoMark';

// Detect iOS (Safari on iPhone/iPad) — no push support there
function isIOS() {
  return typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

// Detect Brave browser
function isBrave() {
  return typeof navigator !== 'undefined' && 'brave' in navigator;
}

/** Signs this device up for push without asking (permission is already granted). */
async function subscribeQuietly(): Promise<boolean> {
  try {
    const result = await subscribePush(await navigator.serviceWorker.ready);
    if (result !== 'ok') return false;
    localStorage.setItem('pushSubscribed', 'true');
    return true;
  } catch (err) {
    console.error('Push notification error:', err);
    return false;
  }
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
    // Already granted: sign this device up again quietly (keeps the subscription fresh).
    if (Notification.permission === 'granted') {
      void subscribeQuietly().then((ok) => { if (ok) setStatus('success'); });
      return;
    }
    if (Notification.permission === 'denied') return; // blocked, don't ask

    // Dismissed recently (7 days cooldown), or already signed up?
    const dismissedAt = localStorage.getItem('pushPromptDismissedAt');
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return;
    if (localStorage.getItem('pushSubscribed') === 'true') return;

    // Ask after a short delay.
    const timer = setTimeout(() => setShowPrompt(true), 2500);
    return () => clearTimeout(timer);
  }, [user, isSupported]);

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

      const registration = await navigator.serviceWorker.ready;
      const result = await subscribePush(registration);
      // Only a real sign-up counts as done; anything else is tried again next visit.
      if (result !== 'ok') {
        setStatus(result === 'blocked' && !silent ? 'denied' : 'idle');
        setShowPrompt(false);
        return;
      }

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
          className="fixed top-[calc(0.5rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[140] w-[95%] max-w-sm"
        >
          <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] rounded-[24px] p-3 flex flex-col gap-2">

            {/* Header */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-indigo-500 rounded-md flex items-center justify-center">
                  <LogoMark className="w-3.5 h-3.5" />
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
                  : 'Hear calls and messages even with UniVerse closed, plus class and assignment updates.'}
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
                className="btn-primary flex-1"
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
