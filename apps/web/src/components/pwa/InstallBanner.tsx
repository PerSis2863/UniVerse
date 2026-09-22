'use client';

import { useState, useEffect } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, Share, X, Smartphone } from 'lucide-react';

export function InstallBanner() {
  const { canInstall, isInstalled, isIOS, install } = usePWAInstall();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const wasDismissed = localStorage.getItem('pwa-banner-dismissed') === 'true';
    const wasInstalled = localStorage.getItem('pwa-installed') === 'true';
    if (wasDismissed || wasInstalled || isInstalled) return;

    // Show after 30 seconds if eligible
    const timer = setTimeout(() => {
      if (canInstall || isIOS) setShow(true);
    }, 30000);

    return () => clearTimeout(timer);
  }, [canInstall, isIOS, isInstalled]);

  // Also show immediately if user explicitly triggers (canInstall flips)
  useEffect(() => {
    const wasDismissed = localStorage.getItem('pwa-banner-dismissed') === 'true';
    if (!wasDismissed && !isInstalled && (canInstall || isIOS)) {
      const timer = setTimeout(() => setShow(true), 30000);
      return () => clearTimeout(timer);
    }
  }, [canInstall, isIOS, isInstalled]);

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    localStorage.setItem('pwa-banner-dismissed', 'true');
  };

  const handleInstall = async () => {
    if (isIOS) return; // iOS shows instructions instead
    setInstalling(true);
    const accepted = await install();
    setInstalling(false);
    if (accepted) setShow(false);
  };

  if (!show || dismissed || isInstalled) return null;

  return (
    <div
      className="fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-96 z-50 animate-in slide-in-from-bottom-4 duration-500"
      role="dialog"
      aria-label="Install UniVerse app"
    >
      <div className="relative bg-[#13131a] border border-indigo-500/30 rounded-2xl p-4 shadow-2xl shadow-indigo-500/10 overflow-hidden">
        {/* Gradient accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 pointer-events-none" />
        
        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
          aria-label="Dismiss install banner"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          {/* Icon */}
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <span className="text-white font-black text-xl">U</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Install UniVerse</p>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              {isIOS
                ? 'Add to your Home Screen for the full app experience.'
                : 'Install for fast access, offline support & push notifications.'}
            </p>

            {isIOS ? (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-indigo-400 font-medium">
                <Share className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Tap Share, then "Add to Home Screen"</span>
              </div>
            ) : (
              <button
                onClick={handleInstall}
                disabled={installing}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-indigo-500/30 hover:shadow-indigo-500/50"
              >
                {installing ? (
                  <>
                    <Smartphone className="w-3.5 h-3.5 animate-pulse" />
                    Installing…
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Install App
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
