'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, Link2, LogOut, MoreHorizontal, Search } from 'lucide-react';
import useSWR from 'swr';
import Link from '@/components/ui/Link';
import { Popover, menuKeys } from '@/components/ui/Menu';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { useAuthStore } from '@/store/auth';
import { useLanguageStore } from '@/store/language';
import { useShownApps } from '@/lib/shown-apps';
import { useOptimisticPath } from '@/lib/nav-pending';
import { useArrange } from '@/store/arrange';
import { MENU_PINS } from '@/lib/arrange';
import { appHome } from '@/lib/apps';
import { cn } from '@/lib/utils';
import { openCommandPalette } from '@/lib/palette';
import { authedJson } from '@/lib/authed-fetch';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ArrangeButton } from '@/components/ArrangeMode';
import { LanguageMenu } from './LanguageMenu';
import { AppSwitcher, isOn, navFor, signOut, useCurrentApp, type NavItem } from './Sidebar';

// M219 (the owner, 16 Nov: "make that part horizontal at the top of the website", the side menu, "but not
// in the app"): on a computer in a browser the side menu is this bar across the top; the installed app and
// phones keep theirs. The same entries as the side menu (`navFor`); a group opens as a list under it, and
// what doesn't fit goes under More (measured on a hidden copy of the row, so nothing jumps). Then ("remove the
// universe impact name and keep the logo … no unnessary gaps"): the logo alone, and the page bar's tools (search,
// theme, language, notifications) are here, so a page without its own actions has no second row. It stays at the
// top while the page scrolls, in the same 4 rem the page bar took (things that stick under it still line up).

const ITEM = 'relative shrink-0 inline-flex items-center gap-1.5 h-9 min-w-0 px-2.5 rounded-lg text-[13.5px] font-medium whitespace-nowrap text-[var(--sidebar-item-color)] dark:text-[var(--sidebar-item-color)] hover:text-[var(--sidebar-item-hover-color)] hover:bg-[var(--sidebar-item-hover-bg)] dark:hover:bg-[var(--sidebar-item-hover-bg)] transition-colors';
const ON = 'bg-[var(--sidebar-item-active-bg)] dark:bg-[var(--sidebar-item-active-bg)] text-[var(--sidebar-item-active-color)] dark:text-[var(--sidebar-item-active-color)] font-semibold shadow-[0_0_0_1px_var(--hairline),0_1px_2px_rgb(0_0_0/0.06)]';
const ROW = 'block w-full rounded-lg px-3 py-2 text-start text-[13.5px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] focus:bg-zinc-100 dark:focus:bg-white/[0.06] outline-none';
const GAP = 4;

const groupOn = (here: string, item: NavItem) => !!item.subItems?.some((s) => isOn(here, s.href, s.also) || here.startsWith(s.href + '/'));

/** A group's pages (or More's), as links in the list under its button. */
function Links({ items, here, close, t, plain }: { items: NavItem[]; here: string; close: () => void; t: (k: string) => string; plain?: boolean }) {
  return (
    <div role="menu" onKeyDown={menuKeys} className="p-1 max-w-80">
      {items.map((item) => item.subItems ? (
        <div key={item.label} role="group" aria-label={t(item.label)}>
          <p className="px-3 pt-2 pb-1 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">{t(item.label)}</p>
          {item.subItems.map((s) => (
            <Link key={s.href} role="menuitem" href={s.href} onClick={close} aria-current={isOn(here, s.href, s.also) ? 'page' : undefined} className={cn(ROW, 'ps-5', isOn(here, s.href, s.also) && 'font-semibold text-tint-text')}>{t(s.label)}</Link>
          ))}
        </div>
      ) : (
        <Link key={item.href} role="menuitem" href={item.href!} onClick={close} aria-current={isOn(here, item.href, item.also) ? 'page' : undefined} className={cn(ROW, 'flex items-center gap-2.5', isOn(here, item.href, item.also) && 'font-semibold text-tint-text')}>
          {!plain && <item.icon className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />}<span translate={item.icon === Link2 ? 'no' : undefined}>{t(item.label)}</span>
        </Link>
      ))}
    </div>
  );
}

export function TopNav() {
  const { user, logout } = useAuthStore();
  const here = useOptimisticPath(usePathname());
  const router = useRouter();
  const shown = useShownApps();
  const app = useCurrentApp(here, shown);
  const pins = useArrange((s) => s.pins[MENU_PINS]);
  const { t } = useLanguageStore();
  const row = useRef<HTMLDivElement>(null);
  const sizer = useRef<HTMLDivElement>(null);
  // How many entries fit in the row (null: not measured yet, all shown and clipped).
  const [fit, setFit] = useState<number | null>(null);
  // The unread count from the list the page bar loads (no request of its own); its panel opens from there.
  const { data: notes } = useSWR<{ read: boolean }[]>(user ? '/api/notifications' : null, authedJson, { revalidateOnMount: false, revalidateOnFocus: false, revalidateIfStale: false });
  const unread = Array.isArray(notes) ? notes.filter((n) => !n.read).length : 0;

  const entries: NavItem[] = user ? [...navFor(app, user, shown), ...(pins ?? []).map((p): NavItem => ({ href: p.href, label: p.label, icon: Link2 }))] : [];
  const sig = entries.map((e) => t(e.label)).join('|');

  // Measured again when the room changes (the window, the fonts arriving) or the entries do (another app,
  // another language). The hidden copy keeps every entry's width, and More's at its end.
  useLayoutEffect(() => {
    const box = row.current, copy = sizer.current;
    if (!box || !copy) return;
    const measure = () => {
      const w = [...copy.children].map((c) => (c as HTMLElement).offsetWidth);
      const more = w.pop() ?? 0, room = box.clientWidth;
      if (w.reduce((a, b) => a + b + GAP, 0) <= room + GAP) return setFit(w.length);
      let used = more, k = 0;
      while (k < w.length && used + w[k] + GAP <= room) used += w[k++] + GAP;
      setFit(k);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(copy);
    return () => ro.disconnect();
  }, [sig]);

  if (!user) return null;
  const shownNow = fit === null ? entries : entries.slice(0, fit);
  const rest = fit === null ? [] : entries.slice(fit);
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const chip = (item: NavItem) => (
    <>
      <item.icon className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
      <span className="truncate" translate={item.icon === Link2 ? 'no' : undefined}>{t(item.label)}</span>
      {item.subItems && <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" strokeWidth={2.5} aria-hidden />}
    </>
  );

  return (
    <header data-no-arrange className="top-nav sticky top-1.5 z-30 mx-2.5 mt-1.5 mb-1.5 h-[52px] flex items-center gap-2 ps-2 pe-1.5 rounded-[18px] border border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] shadow-[0_1px_2px_rgb(0_0_0/0.04),0_14px_34px_-20px_rgb(0_0_0/0.28)]">
      <Link href={app ? appHome(app, user.role) : '/hub'} aria-label="Home" title="UniVerse Impact" className="shrink-0 grid place-items-center w-9 h-9 rounded-lg hover:bg-[var(--sidebar-item-hover-bg)]">
        <UniverseLogo size="sm" animated={false} withGlow={false} showText={false} />
      </Link>
      <AppSwitcher compact app={app} role={user.role} shown={shown} />
      <span aria-hidden className="shrink-0 w-px h-6 bg-[var(--sidebar-border)]" />

      <nav aria-label="Navigation" className="flex-1 min-w-0">
        <div ref={row} className="relative flex items-center gap-1 overflow-hidden py-1">
          {/* The hidden copy the row is measured on (every entry, then More). */}
          <div ref={sizer} aria-hidden inert className="invisible pointer-events-none absolute start-0 top-0 flex w-max gap-1">
            {entries.map((item, i) => <span key={i} className={ITEM}>{chip(item)}</span>)}
            <span className={ITEM}><MoreHorizontal className="w-4 h-4" aria-hidden />More<ChevronDown className="w-3.5 h-3.5" aria-hidden /></span>
          </div>
          {shownNow.map((item, i) => item.subItems ? (
            <span key={i} className="shrink-0" data-tour-hrefs={item.subItems.map((s) => s.href.split('?')[0]).join(' ')}>
              <Popover label={t(item.label)} title={t(item.label)} className={cn(ITEM, groupOn(here, item) && ON)} button={chip(item)}>
                {(close) => <Links plain items={item.subItems!.map((s) => ({ ...s, icon: item.icon }))} here={here} close={close} t={t} />}
              </Popover>
            </span>
          ) : (
            <Link key={i} href={item.href!} data-vt="fade" data-tour-href={item.href!.split('?')[0]} aria-current={isOn(here, item.href, item.also) ? 'page' : undefined}
              className={cn(ITEM, isOn(here, item.href, item.also) && ON)}>
              {chip(item)}
            </Link>
          ))}
          {rest.length > 0 && (
            <span className="shrink-0" data-tour="more">
              <Popover label="More" title="More" className={cn(ITEM, rest.some((r) => isOn(here, r.href, r.also) || groupOn(here, r)) && ON)}
                button={<><MoreHorizontal className="w-4 h-4" aria-hidden />More<ChevronDown className="w-3.5 h-3.5 opacity-60" strokeWidth={2.5} aria-hidden /></>}>
                {(close) => <Links items={rest} here={here} close={close} t={t} />}
              </Popover>
            </span>
          )}
        </div>
      </nav>

      {/* The tools every page had in its own bar. */}
      <div className="shrink-0 flex items-center gap-1">
        <ArrangeButton />
        <button type="button" data-tour="search" onClick={openCommandPalette} aria-label="Search" title="Search (Ctrl K)" className="w-9 h-9 grid place-items-center rounded-full text-[var(--sidebar-item-color)] hover:bg-[var(--sidebar-item-hover-bg)]">
          <Search className="w-[18px] h-[18px]" strokeWidth={2.1} />
        </button>
        <ThemeToggle />
        <LanguageMenu />
        <button type="button" data-tour="notifications" onClick={() => window.dispatchEvent(new CustomEvent('universe:open-notifications'))}
          aria-label={unread ? `Notifications, ${unread > 99 ? '99+' : unread} unread` : 'Notifications'} className="relative w-9 h-9 grid place-items-center rounded-full text-[var(--sidebar-item-color)] hover:bg-[var(--sidebar-item-hover-bg)]">
          <Bell className="w-[18px] h-[18px]" strokeWidth={2.1} />
          {unread > 0 && <span aria-hidden className="absolute top-0 end-0 min-w-[17px] h-[17px] px-1 rounded-full badge-count text-[10px] text-white font-bold leading-[17px] text-center">{unread > 99 ? '99+' : unread}</span>}
        </button>
        {/* The name says the initials it shows (axe: a button's name holds its visible text). */}
        <Popover label={`Your account, ${initials}`} title={user.name} className="ms-1 shrink-0 h-10 w-10 rounded-full p-0.5 hover:bg-[var(--sidebar-item-hover-bg)] dark:hover:bg-[var(--sidebar-item-hover-bg)]"
          button={<span className="w-9 h-9 rounded-full bg-gradient-to-b from-[#a5abb8] to-[#848993] flex items-center justify-center text-[13px] font-semibold text-white">{initials}</span>}>
          {(close) => (
            <div className="p-1 w-64">
              <div className="px-3 pt-2 pb-2">
                <p className="text-[14px] font-semibold text-zinc-900 dark:text-white truncate" translate="no">{user.name}</p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{user.email}</p>
              </div>
              <button type="button" onClick={() => { close(); void signOut(logout, router); }} className={cn(ROW, 'flex items-center gap-2.5 text-red-700 dark:text-[var(--ios-red)]')}>
                <LogOut className="w-4 h-4" aria-hidden />{t('nav.logout')}
              </button>
              <div className="mt-1 px-3 pt-2 pb-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-zinc-500 dark:text-zinc-400" style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)' }}>
                <Link href="/terms" target="_blank" className="hover:text-tint-text">Terms</Link>
                <Link href="/privacy" target="_blank" className="hover:text-tint-text">Privacy</Link>
                <Link href="/policies" target="_blank" className="hover:text-tint-text">Policies</Link>
                <Link href="/contact" target="_blank" className="hover:text-tint-text">Contact</Link>
              </div>
            </div>
          )}
        </Popover>
      </div>
    </header>
  );
}
