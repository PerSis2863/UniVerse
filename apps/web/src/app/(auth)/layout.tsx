import Link from 'next/link';
import { UniverseLogo } from '@/components/ui/UniverseLogo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b] flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-[#09090b] to-cyan-950/30" />
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[100px]" />
        <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] rounded-full bg-cyan-500/10 blur-[100px]" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link href="/" className="inline-flex">
            <UniverseLogo size="lg" animated={true} withGlow={true} showText={true} />
          </Link>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Global University & NGO Impact Ecosystem
            </div>
            <h2 className="text-4xl font-black mb-4 leading-tight">
              Connect.<br />
              Collaborate.<br />
              <span className="bg-gradient-to-r from-indigo-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">Make Impact.</span>
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 text-base leading-relaxed max-w-md">
              UniVerse empowers students, world-class universities, and leading NGOs to collaborate on real-world projects, research initiatives, and social impact summits.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4 max-w-md">
              {[
                { n: '120+', l: 'Partner Universities' },
                { n: '85+', l: 'Collaborating NGOs' },
                { n: '450k+', l: 'Volunteer & Impact Hours' },
                { n: '180+', l: 'Joint Social Ventures' },
              ].map(s => (
                <div key={s.l} className="glass rounded-xl p-4 border border-white/[0.08] hover:border-indigo-500/30 transition-colors">
                  <div className="text-2xl font-black bg-gradient-to-r from-indigo-300 via-white to-amber-300 bg-clip-text text-transparent">{s.n}</div>
                  <div className="text-zinc-600 dark:text-zinc-400 text-xs font-medium">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-zinc-500 dark:text-zinc-500 text-xs flex items-center justify-between">
            <span>© 2026 UniVerse Impact Network</span>
            <span>UN Sustainable Development Partner</span>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="flex lg:hidden mb-8">
            <UniverseLogo size="md" showText={true} animated={true} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
