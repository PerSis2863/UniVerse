import Link from 'next/link';
import { UniverseLogo } from '@/components/ui/UniverseLogo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* ── Left Panel — always dark ─────────────────── */}
      <div
        className="hidden lg:flex w-[52%] relative overflow-hidden flex-col"
        style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0f1525 50%, #0d1424 100%)' }}
      >
        {/* Ambient blobs */}
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-indigo-700/20 blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-20 w-[360px] h-[360px] rounded-full bg-cyan-600/15 blur-[120px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-900/20 blur-[140px] pointer-events-none" />

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

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              {[
                { n: '120+', l: 'Partner Universities' },
                { n: '85+',  l: 'Collaborating NGOs' },
                { n: '450k+', l: 'Volunteer Hours' },
                { n: '180+', l: 'Joint Social Ventures' },
              ].map(s => (
                <div
                  key={s.l}
                  className="rounded-2xl p-4 border border-white/[0.07] hover:border-indigo-500/40 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
                >
                  <div className="text-2xl font-black bg-gradient-to-r from-indigo-300 via-white to-amber-300 bg-clip-text text-transparent leading-none mb-1">
                    {s.n}
                  </div>
                  <div className="text-zinc-500 text-xs font-medium">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-zinc-600 text-xs flex items-center justify-between">
            <span>© 2026 UniVerse Impact Network</span>
            <span>UN Sustainable Development Partner</span>
          </div>
        </div>
      </div>

      {/*
        ── Right Panel ───────────────────────────────────
        We force the `light` class here so Clerk always
        renders with light-mode styles regardless of the
        system / app dark mode preference.
      */}
      <div className="light flex-1 flex items-center justify-center p-6 lg:p-12"
        style={{ background: '#ffffff', color: '#09090b' }}>
        {/* Mobile logo */}
        <div className="absolute top-6 left-6 flex lg:hidden">
          <UniverseLogo size="md" showText={true} animated={true} />
        </div>
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
