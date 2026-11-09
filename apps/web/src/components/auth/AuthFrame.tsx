'use client';

import Link from '@/components/ui/Link';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { ApiWarmup } from '@/components/ApiWarmup';
import { MaintenanceGate } from '@/components/MaintenanceGate';
import { AppBackdrop } from '@/components/AppBackdrop';
import { useChosenApp } from '@/lib/chosen-app';
import { AuthShowcase } from '@/components/landing/AuthShowcase';

// Sign in and sign up, in the landing page's look (src/app/page.tsx): the dark page with the chosen
// app's own scene behind it (M129), the same headline and flow card on the left, the form in a card
// on the right.
// On a laptop screen the whole thing fits without scrolling: the left side never sets the page's
// height (its picture shrinks, `.auth-scene`) and `short:` tightens the spacing.
// M96: one client component for the whole frame. The layout used to reference each part (the
// background, links, the logo…) itself, and since the root layout references some of the same parts,
// every page on the site loaded this layout's file (with the sign-in picture and the landing's flow card).

export function AuthFrame({ children }: { children: React.ReactNode }) {
  const app = useChosenApp();
  return (
    // Dark-only; the "dark" class makes dark: variants (logo text etc.) apply here in light mode too.
    <div data-cursor-light className="dark relative min-h-[100dvh] flex overflow-x-clip" style={{ backgroundColor: '#0b0b0c', color: '#ffffff' }}>
      <ApiWarmup />
      <div aria-hidden className="horizon fixed inset-0 pointer-events-none z-0">
        <AppBackdrop own app={app} tone="dark" strength={0.85} />
      </div>

      {/* ── Left: what UniVerse does (wide screens) ── */}
      <div className="hidden lg:flex relative z-10 w-[52%] flex-col p-12 short:py-8 sticky top-0 h-[100dvh] self-start overflow-hidden">
        <Link href="/" className="inline-flex self-start">
          <UniverseLogo size="lg" animated={true} withGlow={true} showText={true} />
        </Link>
        <div className="hero-in my-auto py-10 short:py-4">
          <AuthShowcase />
        </div>
        <div className="text-xs text-zinc-500 flex items-center justify-between gap-4">
          <span>© 2026 UniVerse Impact Network</span>
          <span>Made with <span className="text-fuchsia-400">♥</span> by Aditya Bhatt</span>
        </div>
      </div>

      {/* ── Right: the form ── (min-w-0: without it the app tabs' full width set this column's
          width, and on phones the form ran off the screen's edge, cut off by overflow-x-clip) */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:p-12 short:lg:py-8">
        <div className="flex lg:hidden pt-2 pb-8">
          <UniverseLogo size="md" showText={true} animated={false} withGlow={false} />
        </div>
        {/* The form glides up into place as the page opens (.hero-in, CSS: from the first paint). */}
        <div style={{ animationDelay: '120ms' }} className="hero-in w-full max-w-md mx-auto flex-1 flex flex-col justify-center pb-8 lg:pb-0">
          <MaintenanceGate>{children}</MaintenanceGate>
        </div>
      </div>
    </div>
  );
}
