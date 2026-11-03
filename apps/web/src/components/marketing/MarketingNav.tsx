'use client';

import Link from '@/components/ui/Link';
import type { AppId } from '@/lib/apps';
import { setChosenApp, useChosenApp } from '@/lib/chosen-app';
import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { cn } from '@/lib/utils';

const LINKS: { href: string; label: string; app?: AppId }[] = [
  { href: '/#apps', label: 'Apps' },
  { href: '/?app=campus', label: 'UniVersity', app: 'campus' as const },
  { href: '/?app=trace', label: 'Trace', app: 'trace' as const },
  { href: '/#faq', label: 'FAQ' },
];

export function MarketingNav() {
  const app = useChosenApp();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="fixed top-0 inset-x-0 z-50 pt-[env(safe-area-inset-top)]">
      <motion.nav
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'mx-auto mt-3 flex items-center justify-between gap-4 rounded-full px-4 sm:px-5 h-14 transition-all duration-500',
          scrolled
            ? 'max-w-5xl bg-[#0d1233]/75 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40'
            : 'max-w-7xl bg-transparent border border-transparent',
        )}
        style={{ width: 'calc(100% - 24px)' }}
      >
        <Link href="/" aria-label="UniVerse Impact" className="flex items-center gap-2.5 shrink-0">
          <UniverseLogo size="sm" animated withGlow />
          <span className="hidden min-[360px]:inline font-black tracking-tight text-white text-lg">UniVerse<span className="hidden min-[400px]:inline font-medium text-zinc-400"> Impact</span></span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => l.app && setChosenApp(l.app)} className="relative px-3.5 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-white/[0.05]">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/login?app=${app}`} className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href={`/register?app=${app}`}
            className="group shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-[#171f44] text-sm font-bold bg-pink-500 hover:bg-pink-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_24px_-8px_rgba(254,129,209,0.85)] hover:brightness-110 transition"
          >
            Get started <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <button onClick={() => setOpen((o) => !o)} className="md:hidden w-10 h-10 inline-flex items-center justify-center rounded-full text-white hover:bg-white/10" aria-label="Menu">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="md:hidden mx-3 mt-2 rounded-3xl bg-[#0d1233]/95 backdrop-blur-xl border border-white/[0.08] p-3 shadow-2xl"
          >
            {[...LINKS, { href: '/login', label: 'Sign in' }].map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block px-4 py-3 rounded-2xl text-zinc-200 font-medium hover:bg-white/[0.06]">
                {l.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
