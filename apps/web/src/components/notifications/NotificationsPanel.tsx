'use client';

import { useEffect, useRef, useState } from 'react';
import { m as motion } from 'framer-motion';
import { AlertTriangle, Bell, CalendarDays, Check, ChevronRight, GraduationCap, Megaphone, MessageCircle, Phone, ShieldAlert, X, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Segmented } from '@/components/ui/Segmented';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { AppIcon } from '@/components/apps/AppIcon';
import { EmailNotificationsSwitch } from './EmailNotificationsSwitch';
import { APPS, appFor } from '@/lib/apps';
import { spring } from '@/lib/motion';
import { useNow } from '@/lib/use-now';
import { morph } from '@/lib/view-transition';
import { cn } from '@/lib/utils';
import { byDay, stacks, when } from '@/lib/notification-stacks';

// M222 (the owner, 16 Nov: "the notification panel doesn't look good… redesign it like apple style and make it ultra
// smooth"): iOS's Notification Centre in the project's look. Solid surfaces (no glass, §8): the grouped grey of iOS
// with white cards in light mode, near-black with #1c1c1e cards in dark (the old panel was navy). Each notification
// has an icon like an app's (what kind it is, or the app it leads to), its title and time on one line, two lines
// of text, and a dot while unread; they're grouped by day. Motion: the sheet slides in on a spring and out faster,
// the rows rise in one after another as it opens, a filter slides the rows that stay (morph), a finger swipes a row
// to mark it read. All of it transform and opacity, on the compositor.

export type PanelNote = { id: string; type: string; title: string; body: string; link: string | null; createdAt: string; unread: boolean };
type Show = 'All' | 'Unread' | 'Important';

/** iOS's own colours (not the app's accent: a kind keeps its colour in every app). */
const KIND: Record<string, { icon: LucideIcon; from: string; to: string }> = {
  message: { icon: MessageCircle, from: '#5ac8fa', to: '#0a84ff' },
  chat: { icon: MessageCircle, from: '#5ac8fa', to: '#0a84ff' },
  call: { icon: Phone, from: '#6be27d', to: '#28c450' },
  grade: { icon: GraduationCap, from: '#7d7aff', to: '#5856d6' },
  event: { icon: CalendarDays, from: '#ff6961', to: '#ff3b30' },
  announcement: { icon: Megaphone, from: '#ffb340', to: '#ff9500' },
  success: { icon: Check, from: '#6be27d', to: '#28c450' },
  warning: { icon: AlertTriangle, from: '#ffd426', to: '#ff9f0a' },
  error: { icon: ShieldAlert, from: '#ff6961', to: '#ff3b30' },
};
const important = (n: PanelNote) => n.type === 'warning' || n.type === 'error';

function NoteIcon({ n }: { n: PanelNote }) {
  const kind = KIND[n.type];
  // An app's own kind (relief, trace…) or the app its link opens: that app's icon.
  const app = kind ? null : APPS.find((a) => a.id === n.type) ?? (n.link?.startsWith('/') ? appFor(n.link.split('?')[0]) : null);
  if (app) return <AppIcon id={app.id} size={38} />;
  const { icon: Icon, from, to } = kind ?? { icon: Bell, from: '#a1a1a6', to: '#7c7c80' };
  return (
    <span aria-hidden className="w-[38px] h-[38px] rounded-[11px] grid place-items-center shrink-0 text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.35)]" style={{ background: `linear-gradient(180deg, ${from}, ${to})` }}>
      <Icon className="w-[19px] h-[19px]" strokeWidth={2.3} />
    </span>
  );
}

const CARD = 'w-full text-start flex items-start gap-3 p-3 rounded-[18px] bg-white dark:bg-[#1c1c1e] shadow-[0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-none transition-[transform,background-color] duration-150 ease-out hover:bg-[#fafafa] dark:hover:bg-[#232326] active:scale-[0.98]';

/** Where the sheet comes from: the end edge (right, or left in right-to-left languages). */
const offEdge = () => (document.documentElement.dir === 'rtl' ? 'translateX(-104%)' : 'translateX(104%)');

export function NotificationsPanel({ notes, unread, onClose, onOpen, onRead }: {
  notes: PanelNote[]; unread: number; onClose: () => void;
  onOpen: (n: PanelNote) => void; onRead: (ids?: string[]) => void;
}) {
  const [show, setShow] = useState<Show>('All');
  // The first rows draw with the sheet and the rest once it has slid in (all 30 at once cost a slow phone a
  // quarter of a second on the opening tap); the rows rise in only while it opens.
  const [allRows, setAllRows] = useState(false);
  const [entering, setEntering] = useState(true);
  const now = useNow();
  const list = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    sheet.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const rest = setTimeout(() => setAllRows(true), 420), settle = setTimeout(() => setEntering(false), 1000);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(rest); clearTimeout(settle); back?.focus?.({ preventScroll: true }); };
  }, [onClose]);

  // Stacks opened with a tap (by their top notification).
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) => morph(list.current, () => setOpened((o) => { const next = new Set(o); if (next.has(key)) next.delete(key); else next.add(key); return next; }), { deep: true });
  const shown = notes.filter((n) => (show === 'Unread' ? n.unread : show === 'Important' ? important(n) : true));
  const rows = allRows ? shown : shown.slice(0, 12);
  const place = new Map(rows.map((n, k) => [n.id, k]));

  /** One notification's card: its icon, its title (two lines at most) and time, a dot while unread, its text. */
  const card = (n: PanelNote, more?: string) => (
    <>
      <NoteIcon n={n} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('flex-1 min-w-0 line-clamp-2 text-[15px] leading-snug text-zinc-900 dark:text-white', n.unread ? 'font-semibold' : 'font-medium')}>
            {n.unread && <span className="sr-only">Unread: </span>}{n.title}
          </span>
          <span className="shrink-0 text-[12px] text-zinc-500 dark:text-zinc-400">{now ? when(n.createdAt, now) : ''}</span>
          {n.unread && <span aria-hidden className="shrink-0 self-center w-2 h-2 rounded-full bg-tint" />}
        </span>
        {n.body && <span className="mt-0.5 block text-[14px] leading-snug text-zinc-600 dark:text-zinc-300 line-clamp-2">{n.body}</span>}
        {more && <span className="mt-1 block text-[13px] font-medium text-zinc-500 dark:text-zinc-400">{more}</span>}
        {important(n) && <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-[#ff6961]"><AlertTriangle className="w-3 h-3" aria-hidden />Important</span>}
      </span>
    </>
  );

  return (
    <>
      <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: 0.25 }}
        onClick={onClose} className="fixed inset-0 z-[120] bg-black/20 dark:bg-black/50" />
      <motion.div ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Notifications" data-entering={entering || undefined}
        // One transform string, so the compositor runs the slide even while the rows render (M130).
        initial={{ transform: offEdge() }} animate={{ transform: 'translateX(0%)' }}
        exit={{ transform: offEdge(), transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] } }} transition={spring.smooth}
        className="notif-sheet fixed z-[130] inset-y-0 end-0 w-full sm:inset-y-2 sm:end-2 sm:w-[400px] flex flex-col overflow-hidden outline-none sm:rounded-[26px] bg-[#f2f2f7] dark:bg-[#0c0c0e] sm:border border-black/[0.06] dark:border-white/[0.08] shadow-[0_30px_80px_-24px_rgb(0_0_0/0.45)] sheet-safe-top">
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[28px] font-bold tracking-[-0.02em] leading-tight text-zinc-900 dark:text-white">Notifications</h2>
            <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">{unread === 0 ? 'You’re all caught up' : `${unread} unread`}</p>
          </div>
          <div className="mt-1 flex items-center gap-2 shrink-0">
            {unread > 0 && (
              <button type="button" onClick={() => onRead()} className="h-8 px-3.5 rounded-full bg-black/[0.05] dark:bg-white/[0.1] text-[13px] font-semibold text-tint-text transition-[transform,background-color] duration-150 hover:bg-black/[0.08] dark:hover:bg-white/[0.14] active:scale-95">Read all</button>
            )}
            <button type="button" onClick={onClose} aria-label="Close notifications" className="w-8 h-8 rounded-full bg-black/[0.05] dark:bg-white/[0.1] grid place-items-center text-zinc-600 dark:text-zinc-300 transition-[transform,background-color] duration-150 hover:bg-black/[0.08] dark:hover:bg-white/[0.14] active:scale-90">
              <X className="w-4 h-4" strokeWidth={2.6} />
            </button>
          </div>
        </div>

        <div className="px-5 pb-3">
          <Segmented label="Show" value={show} onChange={(v) => morph(list.current, () => setShow(v), { deep: true })}
            segments={[{ value: 'All', label: 'All' }, { value: 'Unread', label: 'Unread' }, { value: 'Important', label: 'Important' }]} />
        </div>

        <div ref={list} className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {rows.length === 0 ? (
            <div className="h-full min-h-60 flex flex-col items-center justify-center text-center px-8">
              <span aria-hidden className="w-14 h-14 rounded-full bg-black/[0.05] dark:bg-white/[0.08] grid place-items-center text-zinc-400 dark:text-zinc-500"><Bell className="w-6 h-6" /></span>
              <p className="mt-3 text-[17px] font-semibold text-zinc-900 dark:text-white">{show === 'All' ? 'No notifications' : show === 'Unread' ? 'Nothing unread' : 'Nothing important'}</p>
              <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">{show === 'All' ? 'What needs you will show up here.' : 'You’re all caught up.'}</p>
            </div>
          ) : byDay(rows, now || Date.parse(rows[0].createdAt)).map((g) => (
            <section key={g.label} aria-label={g.label} className="mb-3 last:mb-0">
              <h3 className="px-2 pt-1 pb-1.5 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">{g.label}</h3>
              <ul className="space-y-2">
                {stacks(g.notes).map((st) => {
                  const top = st[0], key = top.id, open = st.length === 1 || opened.has(key), unseen = st.filter((n) => n.unread);
                  if (open) return st.map((n, k) => (
                    <li key={n.id} data-key={n.id} className="notif-row" style={{ '--i': place.get(n.id) } as React.CSSProperties}>
                      {/* An opened stack: "Show less" above it, as on iOS. */}
                      {k === 0 && st.length > 1 && (
                        <div className="flex justify-end pb-1.5"><button type="button" onClick={() => toggle(key)} className="h-7 px-3 rounded-full bg-black/[0.05] dark:bg-white/[0.1] text-[12px] font-semibold text-zinc-700 dark:text-zinc-200 active:scale-95 transition-transform">Show less</button></div>
                      )}
                      <SwipeRow end={n.unread ? { label: 'Read', icon: Check, tone: 'text-tint-text', run: () => onRead([n.id]) } : undefined} className="rounded-[18px]">
                        <button type="button" onClick={() => onOpen(n)} className={CARD}>{card(n)}</button>
                      </SwipeRow>
                    </li>
                  ));
                  // The same notification several times: one card, the others as layers under it; a tap opens them.
                  return (
                    <li key={key} data-key={key} className="notif-row relative pb-3" style={{ '--i': place.get(key) } as React.CSSProperties}>
                      <span aria-hidden className="absolute inset-x-2.5 bottom-1.5 h-8 rounded-[16px] bg-white/80 dark:bg-[#1c1c1e]/80 shadow-[0_1px_2px_rgb(0_0_0/0.04)]" />
                      <span aria-hidden className="absolute inset-x-5 bottom-0 h-8 rounded-[14px] bg-white/55 dark:bg-[#1c1c1e]/55" />
                      <SwipeRow end={unseen.length ? { label: 'Read', icon: Check, tone: 'text-tint-text', run: () => onRead(unseen.map((n) => n.id)) } : undefined} className="rounded-[18px]">
                        <button type="button" onClick={() => toggle(key)} aria-expanded={false} className={cn(CARD, 'relative')}>
                          {card(top, `${st.length - 1} more`)}
                        </button>
                      </SwipeRow>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* iOS's grouped list: one card, two rows. */}
        <div className="px-3 pt-1 pb-3 sheet-safe-bottom">
          <div className="rounded-[18px] bg-white dark:bg-[#1c1c1e] overflow-hidden divide-y divide-black/[0.06] dark:divide-white/[0.08]">
            <EmailNotificationsSwitch compact />
            <Link href="/notifications" onClick={onClose} className="flex items-center justify-between px-5 py-3 text-[15px] font-medium text-zinc-900 dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
              See all notifications<ChevronRight className="w-4 h-4 text-zinc-400 rtl:-scale-x-100" aria-hidden />
            </Link>
          </div>
        </div>
      </motion.div>
    </>
  );
}
