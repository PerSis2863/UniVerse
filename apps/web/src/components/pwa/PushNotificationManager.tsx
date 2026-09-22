'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useAuth } from '@clerk/nextjs';

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

export function PushNotificationManager() {
  const { user } = useAuthStore();
  const { getToken } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    // Check if push is supported
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    const checkSubscription = async () => {
      const permission = Notification.permission;
      
      if (permission === 'default') {
        // If dismissed recently (within 7 days), don't show
        const dismissedAt = localStorage.getItem('pushPromptDismissedAt');
        if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
          return;
        }

        // Delay showing the prompt to not overwhelm the user immediately after login
        const timer = setTimeout(() => setShowPrompt(true), 2500);
        return () => clearTimeout(timer);
      } else if (permission === 'granted') {
        // Ensure they are subscribed silently
        await subscribeUser(true);
      }
    };

    checkSubscription();
  }, [user]);

  const subscribeUser = async (silent = false) => {
    if (isSubscribing) return;
    setIsSubscribing(true);

    try {
      if (!silent) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setShowPrompt(false);
          setIsSubscribing(false);
          return;
        }
      }

      const registration = await navigator.serviceWorker.ready;
      
      // Get existing subscription or create a new one
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          console.error('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY');
          setIsSubscribing(false);
          return;
        }

        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
        
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
      }

      // Send to backend
      const token = await getToken();
      await api.post('/notifications/subscribe', {
        subscription: subscription.toJSON(),
      }, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      
      setShowPrompt(false);
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
    } finally {
      setIsSubscribing(false);
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
          className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-sm pointer-events-none"
        >
          {/* iOS Native-like Notification Banner */}
          <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] rounded-[24px] p-3 pointer-events-auto flex flex-col gap-2">
            
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

            <div className="px-1 mb-1">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight mb-0.5">
                Enable Notifications
              </h4>
              <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-snug">
                Get important updates about classes, assignments, and verified impact hours.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleDismiss}
                className="flex-1 bg-zinc-100 dark:bg-zinc-700/50 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium py-2.5 rounded-[14px] transition-colors text-[13px]"
              >
                Later
              </button>
              <button
                onClick={() => subscribeUser(false)}
                disabled={isSubscribing}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 rounded-[14px] transition-colors disabled:opacity-50 text-[13px]"
              >
                {isSubscribing ? 'Allowing...' : 'Options'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
