'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, BookOpen, GraduationCap, Calendar } from 'lucide-react';

const CACHED_FEATURES = [
  { icon: BookOpen, label: 'Previously visited pages', available: true },
  { icon: GraduationCap, label: 'Grades (cached)', available: true },
  { icon: Calendar, label: 'Calendar (cached)', available: true },
];

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);
  const [dots, setDots] = useState('');

  // Animated ellipsis
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Auto-reload when back online
  useEffect(() => {
    const handleOnline = () => window.location.reload();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    setTimeout(() => window.location.reload(), 1000);
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-6 py-12">
      {/* Animated WiFi icon */}
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-full bg-orange-500/10 animate-ping" />
        <div className="relative w-24 h-24 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
          <WifiOff className="w-10 h-10 text-orange-400" />
        </div>
      </div>

      <h1 className="text-2xl font-black text-white mb-2 text-center">You're Offline</h1>
      <p className="text-zinc-400 text-sm text-center max-w-sm mb-2">
        No internet connection detected. UniVerse is waiting to reconnect{dots}
      </p>
      <p className="text-zinc-600 text-xs text-center mb-8">
        The app will automatically reload when you're back online.
      </p>

      {/* What works offline */}
      <div className="w-full max-w-sm mb-8">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Available Offline
        </p>
        <div className="space-y-2">
          {CACHED_FEATURES.map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
            >
              <f.icon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-sm text-zinc-300">{f.label}</span>
              <span className="ml-auto text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Available
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Retry button */}
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-60 shadow-lg shadow-indigo-500/20"
      >
        <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
        {retrying ? 'Retrying…' : 'Try Again'}
      </button>

      {/* UniVerse branding */}
      <div className="mt-12 flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center">
          <span className="text-white font-black text-xs">U</span>
        </div>
        <span className="text-zinc-500 text-sm font-semibold">UniVerse</span>
      </div>
    </div>
  );
}
