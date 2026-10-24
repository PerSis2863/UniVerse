'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { Bell, Megaphone, MessageCircle, Phone, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { useOptimisticPath } from '@/lib/nav-pending';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// The Messages deck (M17): the four parts of Messages (Chats, Calls, Notifications and, for admins,
// Announcements) as one capsule with live counts. The highlight moves like liquid: a quick head and
// a slower tail chase each other to the new tab. On phones it steps aside while a chat is open.

const CALLS_SEEN = 'uv-calls-seen';
interface Tab { href: string; label: string; icon: LucideIcon; count: number }

export function CommsDeck() {
  // useSearchParams needs a Suspense boundary (pages are prerendered); the fallback shows the deck.
  return <Suspense fallback={<Deck chatOpen={false} />}><DeckWithQuery /></Suspense>;
}

function DeckWithQuery() {
  return <Deck chatOpen={!!useSearchParams().get('c')} />;
}

function Deck({ chatOpen }: { chatOpen: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  const pathname = useOptimisticPath(usePathname());
  const base = role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/student';
  const opt = { revalidateOnFocus: false, dedupingInterval: 15_000 };
  // The same requests the pages make, so these counts cost nothing extra.
  const { data: chats } = useSWR<{ conversations: { unread: number; muted?: boolean; archived?: boolean }[] }>(role ? '/api/chat/conversations' : null, authedJson, opt);
  const { data: calls } = useSWR<{ missed: boolean; at: string }[]>(role ? '/api/calls' : null, authedJson, opt);
  const { data: notes } = useSWR<{ read?: boolean }[]>(role ? '/api/notifications' : null, authedJson, opt);
  // Missed calls count until Calls is opened (each page has its own deck, so this is read afresh).
  const [seen] = useState(() => { try { return Number(localStorage.getItem(CALLS_SEEN)) || 0; } catch { return 0; } });
  const onCalls = pathname === '/calls';
  useEffect(() => {
    if (onCalls) try { localStorage.setItem(CALLS_SEEN, String(Date.now())); } catch { /* private mode */ }
  }, [onCalls]);

  const unread = (chats?.conversations ?? []).filter((c) => !c.muted && !c.archived).reduce((n, c) => n + c.unread, 0);
  const missed = onCalls ? 0 : (Array.isArray(calls) ? calls : []).filter((c) => c.missed && Date.parse(c.at) > seen).length;
  const unreadNotes = (Array.isArray(notes) ? notes : []).filter((n) => n.read === false).length;
  const tabs: Tab[] = [
    { href: `${base}/inbox`, label: 'Chats', icon: MessageCircle, count: unread },
    { href: '/calls', label: 'Calls', icon: Phone, count: missed },
    { href: '/notifications', label: 'Notifications', icon: Bell, count: unreadNotes },
    ...(role === 'ADMIN' ? [{ href: '/admin/announcements', label: 'Announcements', icon: Megaphone, count: 0 }] : []),
  ];

  return (
    <div className={cn(chatOpen && 'hidden md:block')}>
      <nav aria-label="Messages" data-steady className="px-4 sm:px-8 pt-4">
        <div className="comms-deck relative inline-flex max-w-full overflow-x-auto [scrollbar-width:none] items-center gap-1 p-1.5 rounded-[22px]">
          {tabs.map((t) => {
            const on = pathname === t.href;
            return (
              <Link key={t.href} href={t.href} data-vt="tab" aria-current={on ? 'page' : undefined}
                className={cn('relative isolate shrink-0 inline-flex items-center gap-2 h-11 ps-3.5 pe-4 rounded-2xl text-sm font-semibold transition-colors duration-200', on ? 'text-white' : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white')}>
                {on && <>
                  <motion.span layoutId="comms-tail" transition={{ type: 'spring', stiffness: 170, damping: 24 }} className="comms-tail absolute inset-0 -z-20 rounded-2xl" aria-hidden />
                  <motion.span layoutId="comms-head" transition={{ type: 'spring', stiffness: 560, damping: 40 }} className="comms-head absolute inset-0 -z-10 rounded-2xl" aria-hidden />
                </>}
                <t.icon className={cn('w-[18px] h-[18px] transition-transform duration-300', on && 'comms-icon-on')} aria-hidden />
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span key={t.count} aria-label={`${t.count} new`} className={cn('badge-bump min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center', on ? 'bg-white/25 text-white' : 'bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white shadow-[0_0_12px_-2px_rgb(217_70_239/0.8)]')}>
                    {t.count > 99 ? '99+' : t.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
