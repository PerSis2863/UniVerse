import Link from '@/components/ui/Link';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { ApiWarmup } from '@/components/ApiWarmup';
import { MaintenanceGate } from '@/components/MaintenanceGate';
import { LightTrail } from '@/components/LightTrail';
import { PassportCard } from '@/components/landing/PassportCard';
import { Accent, Tag } from '@/components/landing/bits';

// Sign in and sign up, in the landing page's look (src/app/page.tsx): the dark page with its river
// of light, the same headline and flow card on the left, the form in a glass card on the right.

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // Dark-only; the "dark" class makes dark: variants (logo text etc.) apply here in light mode too.
    <div className="dark relative min-h-[100dvh] flex overflow-x-clip" style={{ backgroundColor: '#06141b', color: '#ffffff' }}>
      <ApiWarmup />
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0">
        <LightTrail tone="dark" strength={0.85} className="opacity-60 lg:opacity-90" />
        <div className="mkt-drift-a absolute top-[-20%] start-[-25%] w-[max(60vw,600px)] h-[max(60vw,600px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(37,55,69,0.18), transparent)' }} />
        <div className="mkt-drift-b absolute bottom-[-25%] end-[-30%] w-[max(60vw,600px)] h-[max(60vw,600px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(236,72,153,0.14), transparent)' }} />
      </div>

      {/* ── Left: what UniVerse does (wide screens) ── */}
      <div className="hidden lg:flex relative z-10 w-[52%] flex-col p-12">
        <Link href="/" className="inline-flex self-start">
          <UniverseLogo size="lg" animated={true} withGlow={true} showText={true} />
        </Link>
        <div className="hero-in my-auto py-10">
          <Tag>UniVerse Trace / free to start</Tag>
          <h2 className="mt-6 text-5xl xl:text-6xl font-bold tracking-[-0.035em] leading-[1.04] text-white">
            Every product gets a <Accent>passport.</Accent>
          </h2>
          <p className="mt-5 text-zinc-300 text-base leading-relaxed max-w-md">
            Genuine checks for buyers, points for shops, and a live map of where every product sells and every shipment is.
          </p>
          <div className="mt-9 max-w-sm"><PassportCard /></div>
          <p className="mt-6 font-mono text-xs text-zinc-400">10,000 passports free / 13 languages / no card</p>
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
