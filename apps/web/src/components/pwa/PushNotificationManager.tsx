'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
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

export function PushNotificationManager() {
  const { user } = useAuthStore();
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
      await api.post('/notifications/subscribe', {
        subscription: subscription.toJSON(),
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
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm"
        >
          {/* iOS Style Notification Banner */}
          <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] rounded-[2rem] overflow-hidden p-5 relative text-center">
            
            <button 
              onClick={handleDismiss}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-14 h-14 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 text-indigo-400">
              <Bell className="w-7 h-7 fill-indigo-400/50" />
            </div>
            
            <h3 className="text-white font-semibold text-lg mb-1">
              Enable Notifications
            </h3>
            
            <p className="text-zinc-400 text-sm mb-5 px-2 leading-relaxed">
              Get important updates about classes, assignments, and verified impact hours.
            </p>

            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => subscribeUser(false)}
                disabled={isSubscribing}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-50 text-[15px]"
              >
                {isSubscribing ? 'Allowing...' : 'Allow'}
              </button>
              
              <button
                onClick={handleDismiss}
                className="w-full bg-white/5 hover:bg-white/10 text-zinc-300 font-medium py-3.5 rounded-xl transition-colors text-[15px]"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
