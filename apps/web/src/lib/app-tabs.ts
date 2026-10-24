import { Globe2, MessageSquare, ScanLine, Wallet } from 'lucide-react';
import { inboxFor } from './business';

// The phone's tab bar (the same business app for every role, src/lib/business.ts), and which pages
// count as top-level screens (no back button: the tab bar's own pages, and the pages it highlights).
// Shared by the shell, the back button and the swipe-back gesture.

export type TabItem = { href: string; label: string; icon: typeof ScanLine; match?: string[] };

export function tabsForRole(role: string): { base: string; items: TabItem[] } {
  const inbox = inboxFor(role);
  return {
    base: '/trace',
    items: [
      { href: '/trace', label: 'Console', icon: ScanLine, match: ['/trace/campaigns', '/trace/brands'] },
      { href: '/trace/map', label: 'Map', icon: Globe2, match: ['/trace/tracking'] },
      { href: '/trace/wallet', label: 'Wallet', icon: Wallet },
      { href: inbox, label: 'Messages', icon: MessageSquare, match: [inbox, '/calls', '/notifications'] },
    ],
  };
}


/** A top-level screen: one of the tab bar's pages (or a page it highlights as its own). */
export function isTabRoot(path: string, role: string): boolean {
  const { base, items } = tabsForRole(role);
  return path === base || items.some((i) => i.href === path || !!i.match?.includes(path));
}
