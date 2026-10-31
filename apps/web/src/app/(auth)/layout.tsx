import Link from '@/components/ui/Link';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { ApiWarmup } from '@/components/ApiWarmup';
import { MaintenanceGate } from '@/components/MaintenanceGate';
import { LightTrail } from '@/components/LightTrail';
import { AuthShowcase } from '@/components/landing/AuthShowcase';

// Sign in and sign up, in the landing page's look (src/app/page.tsx): the dark page with its river
// of light, the same headline and flow card on the left, the form in a glass card on the right.

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // Dark-only; the "dark" class makes dark: variants (logo text etc.) apply here in light mode too.
    <div data-cursor-light className="dark relative min-h-[100dvh] flex overflow-x-clip" style={{ backgroundColor: '#171f44', color: '#ffffff' }}>
      <ApiWarmup />
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0">
        <LightTrail tone="dark" strength={0.85} className="opacity-60 lg:opacity-90" />
        <div className="mkt-drift-a absolute top-[-20%] start-[-25%] w-[max(60vw,600px)] h-[max(60vw,600px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(140,155,255,0.14), transparent)' }} />
        <div className="mkt-drift-b absolute bottom-[-25%] end-[-30%] w-[max(60vw,600px)] h-[max(60vw,600px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(116,255,237,0.12), transparent)' }} />
      </div>

      {/* ── Left: what UniVerse does (wide screens) ── */}
      <div className="hidden lg:flex relative z-10 w-[52%] flex-col p-12">
        <Link href="/" className="inline-flex self-start">
          <UniverseLogo size="lg" animated={true} withGlow={true} showText={true} />
        </Link>
        <div className="hero-in my-auto py-10">
          <AuthShowcase />
        </div>
        <div className="font-mono text-xs text-zinc-500 flex items-center justify-between gap-4">
          <span>© 2026 UniVerse Impact Network</span>
          <span>Made with <span className="text-fuchsia-400">♥</span> by Aditya Bhatt</span>
        </div>
      </div>

      {/* ── Right: the form ── */}
      <div className="relative z-10 flex-1 flex flex-col p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:p-12">
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
