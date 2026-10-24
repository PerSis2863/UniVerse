'use client';
import Link from '@/components/ui/Link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { Building2, ChevronDown, Globe2, LogOut, Megaphone, MessageSquare, PenTool, ScanLine, Settings, ShieldCheck, Truck, Wallet, type LucideIcon } from 'lucide-react';
import { inboxFor, settingsFor } from '@/lib/business';
import { cn } from '@/lib/utils';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { LanguageMenu } from './LanguageMenu';
import { AnimatePresence, m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { useLanguageStore } from '@/store/language';
import { useOptimisticPath } from '@/lib/nav-pending';

export type NavItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  subItems?: { href: string; label: string; also?: string[] }[];
  action?: string;
  /** Other pages that count as this entry (tabs of the same section). */
  also?: string[];
};

/** Whether `pathname` is the page of this entry (its href without a query, or one of `also`). */
const isOn = (pathname: string, href: string | undefined, also?: string[]) => !!href && (pathname === href.split('?')[0] || !!also?.includes(pathname));

/**
 * Pages that are tabs of another menu entry, or only reached from search (Ctrl+K / the search
 * button): listed in search by name. `quick` ones also show before anything is typed.
 */
export const searchOnlyPages: Record<string, { href: string; label: string; keywords?: string; quick?: boolean }[]> = Object.fromEntries(
  ['STUDENT', 'TEACHER', 'ADMIN'].map((role) => [role, [
    { href: '/trace/campaigns', label: 'New campaign', keywords: 'campaign bonus points city pay per scan verified sale promotion', quick: true },
    { href: '/trace/tracking', label: 'Track a shipment', keywords: 'shipment truck delivery where is live position driver eta', quick: true },
    { href: '/trace/wallet', label: 'Cash out points', keywords: 'wallet points money cash out pay bank upi paypal', quick: true },
    { href: '/calls', label: 'Calls', keywords: 'call log phone video voice history missed' },
    { href: '/notifications', label: 'Notifications', keywords: 'alerts bell snooze mute push daily summary digest mark read' },
    { href: '/studio?tool=convert', label: 'Convert files', keywords: 'word to pdf docx pdf to jpg png excel csv convert change format' },
    { href: '/studio?tool=compress', label: 'Compress files', keywords: 'compress reduce shrink smaller file size pdf photo image video zip' },
  ]]),
);

/** The business app's menu (src/lib/business.ts): the same for every role, Messages and Settings at each role's own address. */
const businessNav = (role: string): NavItem[] => [
  { href: '/trace', label: 'Console', icon: ScanLine, also: ['/trace/print'] },
  { href: '/trace/map', label: 'Market map', icon: Globe2 },
  { href: '/trace/tracking', label: 'Tracking', icon: Truck },
  { href: '/trace/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/trace/wallet', label: 'Wallet', icon: Wallet },
  { href: inboxFor(role), label: 'nav.messages', icon: MessageSquare, also: ['/calls', '/notifications', ...(role === 'ADMIN' ? ['/admin/announcements'] : [])] },
  { href: '/collab', label: 'Collaborate', icon: PenTool, also: ['/boards', '/code', '/tasks', '/docs', '/sheets', '/slides', '/spaces', '/studio', '/files'] },
  { href: settingsFor(role), label: 'nav.settings', icon: Settings },
];

export const navByRole: Record<string, NavItem[]> = { STUDENT: businessNav('STUDENT'), TEACHER: businessNav('TEACHER'), ADMIN: businessNav('ADMIN') };

function NavItemComponent({ 
  item, 
  pathname, 
  onClose,
  isOpen,
  onToggle,
  glide,
}: { 
  item: NavItem; 
  pathname: string; 
  onClose?: () => void;
  isOpen: boolean;
  onToggle: () => void;
  /** The highlight slides to the new entry (on screen); otherwise it just moves. */
  glide: boolean;
}) {
  const { t } = useLanguageStore();
  const hasActiveChild = item.subItems?.some(sub => isOn(pathname, sub.href, sub.also) || pathname.startsWith(sub.href + '/'));
  const active = pathname === item.href || (item.href && item.href !== '/' && pathname.startsWith(item.href)) || hasActiveChild;

  if (item.subItems) {
    return (
      <div className="space-y-1">
        <button
          onClick={onToggle}
          aria-expanded={isOpen}
          data-tour-hrefs={item.subItems.map((s) => s.href.split('?')[0]).join(' ')}
          className={cn('sidebar-item w-full justify-between', active && !isOpen && 'active')}
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-[18px] h-[18px] flex-shrink-0 text-tint-text" strokeWidth={2} />
            <span>{t(item.label)}</span>
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-400 transition-transform duration-300', !isOpen && '-rotate-90')} strokeWidth={2.5} />
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="sub"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring.smooth}
              className="overflow-hidden"
            >
              <div className="ps-[1.875rem] space-y-0.5 pt-0.5">
                {item.subItems.map(sub => {
                  const on = isOn(pathname, sub.href, sub.also);
                  return (
                    <Link key={sub.href} href={sub.href} data-vt="fade" data-tour-href={sub.href.split('?')[0]} onClick={onClose} aria-current={on ? 'page' : undefined}
                      className={cn('sidebar-item pill-host relative block text-[15px] py-1.5', on && 'active')}>
                      {on && <motion.span layoutId={glide ? 'sidebar-pill' : undefined} transition={spring.snappy} className="sidebar-pill" />}
                      <span className="relative block truncate">{t(sub.label)}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (item.action) {
    return (
      <button className="sidebar-item w-full justify-start">
        <item.icon className="w-[18px] h-[18px] flex-shrink-0 text-tint-text" strokeWidth={2} />
        <span>{t(item.label)}</span>
      </button>
    );
  }

  if (item.href) {
    const on = isOn(pathname, item.href, item.also);
    return (
      <Link href={item.href} data-vt="fade" data-tour-href={item.href.split('?')[0]} onClick={onClose} aria-current={on ? 'page' : undefined}
        className={cn('sidebar-item pill-host relative block', on && 'active')}>
        {on && <motion.span layoutId={glide ? 'sidebar-pill' : undefined} transition={spring.snappy} className="sidebar-pill" />}
        <div className="relative flex items-center gap-3">
          <item.icon className="w-[18px] h-[18px] flex-shrink-0 text-tint-text" strokeWidth={2} />
          <span>{t(item.label)}</span>
        </div>
      </Link>
    );
  }

  return null;
}


const WIDE = '(min-width: 1024px)';
const subscribeWide = (onChange: () => void) => {
  const q = window.matchMedia(WIDE);
  q.addEventListener('change', onChange);
  return () => q.removeEventListener('change', onChange);
};

export function Sidebar({ isOpen = false, onClose }: { isOpen?: boolean, onClose?: () => void }) {
  const { user, logout } = useAuthStore();
  // The tapped entry lights up at once, not when its page has downloaded.
  const pathname = useOptimisticPath(usePathname());
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { t } = useLanguageStore();
  // On a phone the closed menu is off screen: sliding its highlight there on every page change made
  // framer-motion measure the page on each frame of the tab switch.
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);

  // Escape closes the mobile navigation sheet. The page behind doesn't scroll while it's open
  // because the backdrop and the sheet's fixed parts take no finger scrolling (touch-none) and its
  // list doesn't pass scrolling on (overscroll-contain). Not a class or style on <body>: changing
  // the body's touch-action restyles every element on the page (about 0.2 s on a slow phone).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!user) return null;

  // The owner console link exists only for the owner (the console itself answers "not found" to anyone else).
  const own = navByRole[user.role] ?? businessNav(user.role);
  const nav: NavItem[] = user.owner ? [{ href: '/console', label: 'Owner console', icon: ShieldCheck }, ...own.slice(0, 5), { href: '/trace/brands', label: 'All brands', icon: Building2 }, ...own.slice(5)] : own;
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    try {
      const { auth } = await import('@/lib/firebase');
      await auth.signOut();
    } catch (error) {
      console.warn('Firebase signOut failed:', error);
    }
    logout();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile backdrop (fades in/out; sits above the mobile header and tab bar) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[95] bg-black/50 lg:hidden transition-opacity duration-300 touch-none",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      <aside
        aria-label="Navigation"
        className={cn(
          "dark fixed start-0 top-0 bottom-0 w-[min(84vw,320px)] lg:w-64 glass-sidebar border-e border-[var(--sidebar-border)] flex flex-col z-[100] lg:z-50 sheet-safe-top lg:pt-0 rounded-e-[28px] lg:rounded-none",
          "transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform lg:translate-x-0",
          isOpen ? "translate-x-0 shadow-2xl lg:shadow-none" : "-translate-x-full rtl:translate-x-full"
        )}
      >
        {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-16 touch-none lg:touch-manipulation">
        <UniverseLogo size="md" animated={false} withGlow={false} />
        <div className="min-w-0">
          <div className="font-bold text-[17px] leading-tight tracking-tight text-zinc-900 dark:text-white">UniVerse</div>
          <div className="text-[12px] text-zinc-500 dark:text-zinc-400 font-medium">{user.owner ? 'Owner' : user.role === 'ADMIN' ? 'Admin' : 'UniVerse Trace'}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-3 pb-4 space-y-0.5 custom-scrollbar">
        {nav.map((item, i) => (
          <NavItemComponent 
            key={i} 
            item={item} 
            pathname={pathname} 
            onClose={onClose}
            isOpen={openIndex === i || (item.subItems?.some(sub => isOn(pathname, sub.href, sub.also) || pathname.startsWith(sub.href + '/')) && openIndex === null) ? true : false}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            glide={isOpen || wide}
          />
        ))}
      </nav>

      {/* User */}
      <div className="px-3 pt-3 sheet-safe-bottom lg:pb-4 touch-none lg:touch-manipulation" style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)' }}>
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-gradient-to-b from-[#a5abb8] to-[#848993] flex items-center justify-center text-[13px] font-semibold text-white flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-zinc-900 dark:text-white truncate">{user.name}</div>
            <div className="text-[12px] text-zinc-500 truncate">{user.email}</div>
          </div>
        </div>
        {/* Phones have no top bar with the language button. */}
        <LanguageMenu row className="lg:hidden mt-1" />
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-[15px] text-red-700 dark:text-[var(--ios-red)] hover:bg-[var(--fill)] transition-colors">
          <LogOut className="w-[18px] h-[18px]" />
          <span>{t('nav.logout')}</span>
        </button>
        <div className="px-3 pt-2 pb-1 flex gap-3 text-[12px] text-zinc-400 dark:text-zinc-500">
          <Link href="/terms" target="_blank" className="hover:text-tint-text">Terms</Link>
          <Link href="/privacy" target="_blank" className="hover:text-tint-text">Privacy</Link>
          <Link href="/policies" target="_blank" className="hover:text-tint-text">Policies</Link>
          <Link href="/contact" target="_blank" className="hover:text-tint-text">Contact</Link>
        </div>
      </div>
    </aside>
    </>
  );
}
