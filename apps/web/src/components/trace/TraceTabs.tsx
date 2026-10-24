'use client';

import { usePathname } from 'next/navigation';
import { m as motion } from 'framer-motion';
import { Building2, Globe2, KeyRound, Megaphone, Radar, ScanLine, Sparkles, Truck, Wallet } from 'lucide-react';
import Link from '@/components/ui/Link';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// The tab row across the UniVerse Trace pages: the brand's console, its two live maps, the Radar and
// Insights, campaigns, everyone's wallet and vault, and (for the platform owner) every brand.

const TABS = [
  { href: '/trace', label: 'Console', icon: ScanLine },
  { href: '/trace/map', label: 'Market map', icon: Globe2 },
  { href: '/trace/tracking', label: 'Tracking', icon: Truck },
  { href: '/trace/radar', label: 'Radar', icon: Radar },
  { href: '/trace/insights', label: 'Insights', icon: Sparkles },
  { href: '/trace/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/trace/wallet', label: 'Wallet', icon: Wallet },
  { href: '/trace/vault', label: 'Vault', icon: KeyRound },
];

export function TraceTabs() {
  const path = usePathname();
  const owner = useAuthStore((s) => s.user?.owner === true);
  const tabs = owner ? [...TABS, { href: '/trace/brands', label: 'All brands', icon: Building2 }] : TABS;
  return (
    <nav aria-label="Trace" className="-mx-1 overflow-x-auto scrollbar-none">
      <ul className="flex gap-1 px-1 min-w-max">
        {tabs.map((t) => {
          const on = t.href === '/trace' ? path === '/trace' : path.startsWith(t.href);
          return (
            <li key={t.href} className="relative">
              <Link href={t.href} aria-current={on ? 'page' : undefined} className={cn('relative z-10 flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors', on ? 'text-white' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white')}>
                <t.icon className="w-4 h-4" aria-hidden />{t.label}
              </Link>
              {on && <motion.span layoutId="trace-tab" className="absolute inset-0 rounded-full bg-indigo-600 shadow-[0_0_0_1px_rgba(236,72,153,0.35),0_8px_24px_-8px_rgba(236,72,153,0.55)]" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
