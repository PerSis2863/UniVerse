'use client';

import Link from '@/components/ui/Link';
import type { AppId } from '@/lib/apps';
import { setChosenApp, useChosenApp } from '@/lib/chosen-app';
import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { cn } from '@/lib/utils';
import { ThemeSwitch } from './ThemeSwitch';

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
      {/* M117: drops in with CSS (`.nav-in`) from the first paint; with framer's `initial` the server
          sent it at opacity 0 until the page's script had loaded (seconds on a slow phone). */}
      <nav
        className={cn('nav-in',
          // One width (the hero's) in both states: only the fill, hairline and shadow fade in, so
          // nothing is laid out again while it changes (§8: transform and opacity, named properties).
          'mx-auto mt-3 max-w-6xl flex items-center justify-between gap-4 rounded-full px-4 sm:px-5 h-14 border transition-[background-color,border-color,box-shadow] duration-300',
          scrolled
            ? 'bg-[var(--surface)] border-white/[0.08] shadow-2xl shadow-black/40'
            : 'bg-transparent border-transparent',
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
          <ThemeSwitch />
          <Link href={`/login?app=${app}`} className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href={`/register?app=${app}`}
            className="group shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[var(--cta-ink)] text-sm font-bold bg-[var(--cta)] hover:bg-[var(--cta-hover)] shadow-[0_6px_24px_-12px_rgba(0,0,0,0.6)] transition-colors"
          >
            Get started <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <button onClick={() => setOpen((o) => !o)} className="md:hidden w-10 h-10 inline-flex items-center justify-center rounded-full text-white hover:bg-white/10" aria-label="Menu">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="md:hidden mx-3 mt-2 rounded-3xl bg-[var(--surface)] border border-white/[0.08] p-3 shadow-2xl"
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
