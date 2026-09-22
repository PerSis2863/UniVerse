'use client';

import { useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Bell, BellOff, CheckCircle, Loader2 } from 'lucide-react';

export function NotificationPermissionPrompt() {
  const { isSupported, permission, isSubscribed, subscribe, unsubscribe } = usePushNotifications();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isSupported) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <BellOff className="w-4 h-4 text-zinc-500" />
        <p className="text-sm text-zinc-500">Push notifications not supported in this browser.</p>
      </div>
    );
  }

  const handleToggle = async () => {
    setLoading(true);
    setError('');
    try {
      if (isSubscribed) {
        await unsubscribe();
      } else {
        const success = await subscribe();
        if (!success && permission === 'denied') {
          setError('Notifications blocked. Please enable them in your browser settings.');
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${isSubscribed ? 'bg-emerald-500/10' : 'bg-indigo-500/10'}`}>
          {isSubscribed ? (
            <Bell className="w-5 h-5 text-emerald-400" />
          ) : (
            <Bell className="w-5 h-5 text-indigo-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            {isSubscribed ? 'Notifications Enabled' : 'Enable Push Notifications'}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
            {isSubscribed
              ? 'You\'ll receive alerts for new grades, messages, and announcements.'
              : 'Get instant alerts for new grades, messages from teachers, and important announcements — even when the app is closed.'}
          </p>
          {error && (
            <p className="text-xs text-red-400 mt-2">{error}</p>
          )}
        </div>
        <button
          onClick={handleToggle}
          disabled={loading || permission === 'denied'}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            isSubscribed
              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
              : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/20'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isSubscribed ? (
            <>
              <BellOff className="w-3.5 h-3.5" />
              Turn Off
            </>
          ) : (
            <>
              <Bell className="w-3.5 h-3.5" />
              Enable
            </>
          )}
        </button>
      </div>
      {isSubscribed && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5" />
            Subscribed to: grades, messages, announcements
          </div>
        </div>
      )}
    </div>
  );
}
