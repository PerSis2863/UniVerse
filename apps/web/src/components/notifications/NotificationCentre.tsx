'use client';

import { useEffect, useRef, useState } from 'react';
import { mutate as refresh } from 'swr';
import useSWRInfinite from 'swr/infinite';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AnimatePresence, m as motion, type PanInfo } from 'framer-motion';
import { formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';
import { AtSign, Bell, BellOff, CalendarClock, Check, CheckCheck, Clock, GraduationCap, Loader2, MessageSquare, School, Settings2, Trash2, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Menu } from '@/components/ui/Menu';
import { authedJson } from '@/lib/authed-fetch';
import { useAuthStore } from '@/store/auth';
import { NOTE_GROUPS, type NoteGroupId } from '@/lib/notify-prefs';
import { useLiveInterval } from '@/lib/realtime-client';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// The notification centre (Stage 5 · Q9): every notification, by kind, newest first, with mark
// read, snooze (back as unread later) and remove; swipe on phones (left: read, right: snooze an
// hour); more load as you scroll.

interface Item { id: string; title: string; body: string; type: string; read: boolean; link: string | null; createdAt: string; group: NoteGroupId; course: string | null }
interface Page { items: Item[]; next: string | null; unread: Partial<Record<NoteGroupId, number>>; snoozed: number }

const ICON: Record<NoteGroupId, LucideIcon> = { mentions: AtSign, messages: MessageSquare, grades: GraduationCap, calls: CalendarClock, tasks: Check, school: School, other: Bell };
const TONE: Record<NoteGroupId, string> = {
  mentions: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300', messages: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', grades: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  calls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', tasks: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', school: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', other: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
};

/** Snooze choices: an hour, this evening, tomorrow morning, next week. */
function snoozeTimes(now = new Date()) {
  const at = (days: number, h: number) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };
  const evening = at(0, 18);
  return [
    { label: 'For an hour', until: new Date(now.getTime() + 3_600_000) },
    ...(evening.getTime() - now.getTime() > 90 * 60_000 ? [{ label: 'Until this evening', until: evening }] : []),
    { label: 'Until tomorrow morning', until: at(1, 8) },
    { label: 'For a week', until: at(7, 8) },
  ];
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  return isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function NotificationCentre() {
  const router = useRouter();
  const role = useAuthStore((st) => st.user?.role);
  const settings = `/${role === 'ADMIN' ? 'admin' : role === 'TEACHER' ? 'teacher' : 'student'}/settings?section=notifications`;
  const [group, setGroup] = useState<NoteGroupId | 'all' | 'unread'>('all');
  const poll = useLiveInterval(120_000, 0);
  const keyOf = (i: number, prev: Page | null) => {
    if (prev && !prev.next) return null;
    const sp = new URLSearchParams();
    if (group === 'unread') sp.set('unread', '1'); else if (group !== 'all') sp.set('group', group);
    if (prev?.next) sp.set('before', prev.next);
    return `/api/notifications/centre?${sp}`;
  };
  const { data, size, setSize, mutate, isLoading, isValidating } = useSWRInfinite<Page>(keyOf, authedJson, { refreshInterval: poll, revalidateFirstPage: true });
  const items = (data ?? []).flatMap((p) => p.items);
  const unread = data?.[0]?.unread ?? {};
  const totalUnread = Object.values(unread).reduce((a, b) => a + (b ?? 0), 0);
  const more = !!data?.[data.length - 1]?.next;

  // More load by themselves as the end of the list scrolls into view.
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = end.current;
    if (!el || !more) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting && !isValidating) void setSize((s) => s + 1); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, isValidating, setSize]);

  const act = async (action: 'read' | 'unread' | 'snooze' | 'delete', ids: string[] | 'all', until?: Date) => {
    // Shown straight away; put back if saving fails.
    await mutate((pages) => pages?.map((p) => ({
      ...p,
      items: action === 'delete' || action === 'snooze' ? p.items.filter((n) => ids !== 'all' && !ids.includes(n.id)) : p.items.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, read: action === 'read' } : n)),
    })), { revalidate: false });
    try {
      await authedJson('/api/notifications/centre', { method: 'POST', body: JSON.stringify({ action, ...(ids === 'all' ? { all: true } : { ids }), until: until?.toISOString() }) });
      if (action === 'snooze') toast.success(`Snoozed until ${until!.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`);
      void mutate();
      void refresh('/api/notifications'); // the bell
    } catch (e) {
      toast.error((e as Error).message);
      void mutate();
    }
  };

  const open = (n: Item) => {
    if (!n.read) void act('read', [n.id]);
    if (n.link?.startsWith('/')) router.push(n.link);
  };

  const filters: { id: NoteGroupId | 'all' | 'unread'; label: string; n?: number }[] = [
    { id: 'all', label: 'All' }, { id: 'unread', label: 'Unread', n: totalUnread },
    ...NOTE_GROUPS.map((g) => ({ id: g.id, label: g.label, n: unread[g.id] })),
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{totalUnread ? `${totalUnread} unread` : 'You’re all caught up'}{data?.[0]?.snoozed ? ` · ${data[0].snoozed} snoozed` : ''}</p>
        <div className="flex gap-2">
          <button type="button" disabled={!totalUnread} onClick={() => void act('read', 'all')} className="btn-secondary btn-sm disabled:opacity-40"><CheckCheck className="w-4 h-4" />Mark all read</button>
          <Link href={settings} className="btn-secondary btn-sm"><Settings2 className="w-4 h-4" />Settings</Link>
        </div>
      </div>
      <div role="radiogroup" aria-label="Show" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1 pb-1">
        {filters.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={group === f.id} onClick={() => { setGroup(f.id); haptic('tap'); }}
            className={cn('shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors', group === f.id ? 'bg-indigo-600 text-white border-transparent' : 'border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
            {f.label}{f.n ? <span className={cn('ms-1.5 text-xs tabular-nums', group === f.id ? 'text-white/90' : 'text-zinc-600 dark:text-zinc-400')}>{f.n}</span> : null}
          </button>
        ))}
      </div>

      {isLoading && !data ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-16 rounded-2xl skeleton" />)}</div>
      ) : !items.length ? (
        <div className="py-16 text-center text-zinc-600 dark:text-zinc-400">
          <BellOff className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nothing here.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {items.map((n, i) => {
              // A day's heading over its first notification.
              const heading = i === 0 || dayLabel(items[i - 1].createdAt) !== dayLabel(n.createdAt) ? dayLabel(n.createdAt) : null;
              return (
                <motion.li key={n.id} layout="position" exit={{ opacity: 0, height: 0 }} transition={spring.smooth}>
                  {heading && <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 px-1 pt-3 pb-1">{heading}</h3>}
                  <Row n={n} onOpen={() => open(n)} onAct={act} />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <div ref={end} />
      {more && (
        <div className="flex justify-center">
          <button type="button" onClick={() => void setSize(size + 1)} disabled={isValidating} className="btn-secondary btn-sm">{isValidating && <Loader2 className="w-4 h-4 animate-spin" />}Load more</button>
        </div>
      )}
    </div>
  );
}

function Row({ n, onOpen, onAct }: { n: Item; onOpen: () => void; onAct: (a: 'read' | 'unread' | 'snooze' | 'delete', ids: string[], until?: Date) => Promise<void> }) {
  const Icon = ICON[n.group];
  // Swipe on phones: left marks it read, right snoozes it for an hour.
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -90) { haptic('success'); void onAct(n.read ? 'unread' : 'read', [n.id]); }
    else if (info.offset.x > 90) { haptic('success'); void onAct('snooze', [n.id], new Date(Date.now() + 3_600_000)); }
  };
  return (
    <div className="relative rounded-2xl overflow-hidden">
      <div aria-hidden className="absolute inset-0 flex items-center justify-between px-4 text-xs font-semibold">
        <span className="text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><Clock className="w-4 h-4" />Snooze</span>
        <span className="text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1">{n.read ? 'Unread' : 'Read'}<Check className="w-4 h-4" /></span>
      </div>
      <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.5} dragSnapToOrigin onDragEnd={onDragEnd}
        className={cn('relative flex items-start gap-3 p-3 rounded-2xl border bg-white dark:bg-[#11131f] touch-pan-y', n.read ? 'border-zinc-200/70 dark:border-white/[0.06]' : 'border-indigo-500/30')}>
        <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', TONE[n.group])}><Icon className="w-4 h-4" /></span>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
          <span className="flex items-baseline gap-2">
            <span className={cn('text-sm leading-snug', n.read ? 'font-medium text-zinc-700 dark:text-zinc-300' : 'font-semibold text-zinc-900 dark:text-white')}>{n.title}</span>
            {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" aria-label="Unread" role="img" />}
          </span>
          {n.body && <span className="block text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2 mt-0.5">{n.body}</span>}
          <span className="block text-xs text-zinc-600 dark:text-zinc-400 mt-1">{n.course ? `${n.course} · ` : ''}{formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => void onAct(n.read ? 'unread' : 'read', [n.id])} aria-label={n.read ? `Mark “${n.title}” unread` : `Mark “${n.title}” read`} title={n.read ? 'Mark unread' : 'Mark read'} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300"><Check className="w-4 h-4" /></button>
          <Menu label={`Snooze “${n.title}”`} title="Snooze" button={<Clock className="w-4 h-4" />} items={snoozeTimes().map((s) => ({ label: s.label, onSelect: () => void onAct('snooze', [n.id], s.until) }))} />
          <button type="button" onClick={() => void onAct('delete', [n.id])} aria-label={`Remove “${n.title}”`} title="Remove" className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300"><Trash2 className="w-4 h-4" /></button>
        </div>
      </motion.div>
    </div>
  );
}
