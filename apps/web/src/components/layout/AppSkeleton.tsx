'use client';

import { LaunchSplash } from './LaunchSplash';
import { LogoMark } from '@/components/ui/LogoMark';
import { usePathname } from 'next/navigation';
import { PageSkeleton, skeletonFor } from './PageSkeleton';

/**
 * Shown while the session is being restored, so the dashboard never flashes a blank screen. Shaped
 * like the real shell on each screen size (on phones: the top bar, a large title, cards and the
 * floating tab bar), so nothing jumps or pops in when the app appears.
 */
export function AppSkeleton() {
  const pathname = usePathname();
  return (
    <div className="flex min-h-[100dvh]" aria-busy="true" aria-label="Loading">
      <LaunchSplash />
      {/* Desktop: sidebar */}
      <aside className="hidden lg:flex topnav:hidden fixed inset-y-0 start-0 w-64 flex-col gap-3 border-e border-zinc-200 dark:border-white/[0.06] bg-white/70 dark:bg-[#151517]/70 p-4">
        <p className="h-10 flex items-center gap-2 mb-4 px-1 font-black text-lg text-zinc-900 dark:text-white"><LogoMark className="w-8 h-8" />UniVerse</p>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-9 rounded-xl" />
        ))}
      </aside>

      {/* M219: a computer's browser: the bar across the top (TopNav). */}
      <div className="hidden topnav:flex fixed top-1.5 inset-x-2.5 h-[52px] items-center gap-3 px-3 rounded-[18px] border border-zinc-200 dark:border-white/[0.06] bg-white/70 dark:bg-[#151517]/70">
        <LogoMark className="w-8 h-8" />
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className="skeleton h-8 w-24 rounded-lg" />)}
      </div>

      {/* Phones: the top bar */}
      <div className="mobile-header lg:hidden fixed top-0 inset-x-0 z-[35] flex items-center gap-2">
        <LogoMark className="w-8 h-8" />
        <span className="font-bold text-[17px] tracking-tight text-zinc-900 dark:text-white">UniVerse</span>
      </div>

      {/* The same placeholder the page itself shows while it loads (shaped like this page), so
          opening the app goes from one to the other with nothing in between. */}
      <div className="mobile-main flex-1 side-main lg:ms-[calc(var(--side-w)+var(--side-gap))] topnav:ms-0 topnav:pt-16 min-w-0 flex flex-col">
        <PageSkeleton variant={skeletonFor(pathname)} />
      </div>

      {/* Phones: the floating tab bar */}
      <div aria-hidden className="ios-tabbar ios-glass lg:hidden z-[35] p-1 grid grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="flex flex-col items-center justify-center gap-1.5">
            <span className="skeleton w-6 h-6 rounded-lg" />
            <span className="skeleton w-9 h-2 rounded" />
          </span>
        ))}
      </div>
    </div>
  );
}
