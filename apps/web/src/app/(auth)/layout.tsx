import Link from 'next/link';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { ApiWarmup } from '@/components/ApiWarmup';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // The auth screens are designed dark-only; the "dark" class makes dark: variants (logo text etc.) apply here in light mode too.
    <div
      className="dark min-h-[100dvh] flex"
      style={{
        background:
          'radial-gradient(90% 55% at 0% 0%, rgba(79,70,229,0.30), transparent 70%), radial-gradient(90% 55% at 100% 100%, rgba(192,38,211,0.22), transparent 70%), #0a0d13',
      }}
    >
      <ApiWarmup />
      {/* ── Left Panel — always dark ─────────────────── */}
      <div
        className="hidden lg:flex w-[52%] relative overflow-hidden flex-col"
        style={{ background: 'linear-gradient(135deg, rgba(16,18,58,0.85) 0%, rgba(20,16,56,0.8) 50%, rgba(15,12,41,0.85) 100%)' }}
      >
        {/* Ambient blobs */}
        <div className="absolute -top-60 -left-60 w-[760px] h-[760px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(closest-side, rgba(99,102,241,0.3), transparent)' }} />
        <div className="absolute -bottom-60 -right-40 w-[620px] h-[620px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(closest-side, rgba(217,70,239,0.2), transparent)' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <Link href="/" className="inline-flex">
            <UniverseLogo size="lg" animated={true} withGlow={true} showText={true} />
          </Link>

          {/* Middle copy */}
          <div className="mt-auto mb-auto pt-16 pb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Global University &amp; NGO Impact Ecosystem
            </div>

            <h2 className="text-5xl font-black mb-5 leading-[1.1] text-white">
              Connect.<br />
              Collaborate.<br />
              <span className="bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-amber-400 bg-clip-text text-transparent">
                Make Impact.
              </span>
            </h2>

            <p className="text-zinc-400 text-base leading-relaxed max-w-sm mb-10">
              UniVerse empowers students, world-class universities, and leading NGOs to collaborate on real-world projects, research initiatives, and social impact summits.
            </p>

            {/* Platform capabilities */}
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              {[
                { t: 'Blockchain-verified', l: 'Credentials anchored on Polygon' },
                { t: 'AI-powered', l: 'Study help & project matching' },
                { t: 'Real-time', l: 'Live chat & notifications' },
                { t: 'Install anywhere', l: 'iOS, Android & desktop' },
              ].map(s => (
                <div
                  key={s.t}
                  className="rounded-2xl p-4 border border-white/[0.07] hover:border-indigo-500/40 transition-colors bg-white/[0.04]"
                >
                  <div className="text-sm font-black bg-gradient-to-r from-indigo-300 via-white to-fuchsia-300 bg-clip-text text-transparent leading-tight mb-1">
                    {s.t}
                  </div>
                  <div className="text-zinc-500 text-xs font-medium">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-zinc-600 text-xs flex items-center justify-between">
            <span>© 2026 UniVerse Impact Network</span>
            <span className="flex items-center gap-1">Made with <span className="text-red-500">❤️</span> by Aditya Bhatt</span>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:p-12" style={{ color: '#ffffff' }}>
        {/* Mobile logo */}
        <div className="flex lg:hidden pt-2 pb-8">
          <UniverseLogo size="md" showText={true} animated={false} withGlow={false} />
        </div>
        <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-center pb-8 lg:pb-0">
          {children}
        </div>
      </div>
    </div>
  );
}
