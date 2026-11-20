'use client';

import { usePathname } from 'next/navigation';
import { Building2, Globe, Globe2, KeyRound, Megaphone, Radar, ScanLine, Sparkles, Truck, Wallet } from 'lucide-react';
import { TabRow, type RowTab } from '@/components/ui/TabRow';
import { useAuthStore } from '@/store/auth';

// The tab row across the UniVerse Trace pages: the brand's console, its two live maps, the Radar and
// Insights, campaigns, everyone's wallet and vault, and (for the platform owner) every brand.

const TABS = [
  { href: '/trace', label: 'Console', icon: ScanLine },
  { href: '/trace/map', label: 'Market map', icon: Globe2 },
  { href: '/trace/tracking', label: 'Tracking', icon: Truck },
  { href: '/trace/globe', label: 'Live globe', icon: Globe },
  { href: '/trace/radar', label: 'Radar', icon: Radar },
  { href: '/trace/insights', label: 'Insights', icon: Sparkles },
  { href: '/trace/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/trace/wallet', label: 'Wallet', icon: Wallet },
  { href: '/trace/vault', label: 'Vault', icon: KeyRound },
];

/** Trace's sections (M370: the same list fills the top bar on a computer); the platform owner also sees every brand. */
export function traceSections(path: string, owner: boolean): RowTab[] {
  const tabs = owner ? [...TABS, { href: '/trace/brands', label: 'All brands', icon: Building2 }] : TABS;
  return tabs.map((t) => ({ ...t, on: t.href === '/trace' ? path === '/trace' : path.startsWith(t.href) }));
}

export function TraceTabs() {
  const path = usePathname();
  const owner = useAuthStore((s) => s.user?.owner === true);
  return <TabRow label="Trace" glide="trace-tab" tabs={traceSections(path, owner)} />;
}
