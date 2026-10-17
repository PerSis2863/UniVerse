'use client';

import { format, isToday, isTomorrow } from 'date-fns';
import { m as motion } from 'framer-motion';
import { BookOpen, CalendarClock, CheckCircle2, ClipboardCheck, FileText, PenLine, Sparkles, Video } from 'lucide-react';
import Link from '@/components/ui/Link';
import { JOIN_EARLY_MIN, upNext, type UpNextItem, type UpNextRow } from '@/lib/home-layout';
import { useNow } from '@/lib/use-now';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/utils';

// "Up next" on the home pages (Stage 5 · Q8): the class or call that's on or about to start (Join
// from 10 minutes before), quizzes and work due, and for teachers what's waiting to be graded. It
// changes by itself as the time passes.

const ICONS = { call: Video, class: BookOpen, quiz: CheckCircle2, assignment: FileText, grade: PenLine, event: CalendarClock };

function dayTime(t: number) {
  const d = new Date(t);
  return `${isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEE d MMM')} ${format(d, 'HH:mm')}`;
}

function when(r: UpNextRow) {
  const { item, state, minutes } = r;
  if (state === 'todo') return 'Now';
  if (state === 'live') return item.end ? `Now · until ${format(new Date(item.end), 'HH:mm')}` : 'Now';
  if (state === 'soon') return minutes <= 1 ? 'Starting now' : `In ${minutes} min`;
  if (state === 'due') {
    if (minutes < 60) return `Due in ${minutes} min`;
    if (minutes < 12 * 60) return `Due in ${Math.round(minutes / 60)} h`;
    return `Due ${dayTime(item.due!)}`;
  }
  return dayTime(item.start!);
}

function ActionButton({ row, big }: { row: UpNextRow; big?: boolean }) {
  const { item, ready, action } = row;
  if (!ready && item.start) {
    return <span className={cn('shrink-0 text-xs font-medium text-zinc-600 dark:text-zinc-400 text-right', big && 'text-sm')}>Join from {format(new Date(item.start - JOIN_EARLY_MIN * 60_000), 'HH:mm')}</span>;
  }
  return (
    <Link href={item.href} className={cn(big ? 'btn-primary' : 'btn-secondary btn-sm', 'shrink-0')} aria-label={`${action}: ${item.title}`}>
      {item.kind === 'call' && <Video className="w-4 h-4" />}{action}
    </Link>
  );
}

export function UpNextCard({ items, loading, empty }: { items: UpNextItem[] | undefined; loading?: boolean; empty?: React.ReactNode }) {
  const now = useNow();
  const rows = now ? upNext(items ?? [], now) : [];
  const [first, ...rest] = rows;
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" aria-labelledby="upnext-title"
      className="relative rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-5 md:p-6 overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.07] via-transparent to-emerald-500/[0.06] pointer-events-none" />
      <div className="relative">
        <h2 id="upnext-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/15 to-emerald-500/15 border border-indigo-500/20 flex items-center justify-center"><ClipboardCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /></span>
          Up next
        </h2>
        {loading && !items ? <div className="h-20 rounded-2xl skeleton" /> : !first ? (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-dashed border-zinc-200 dark:border-white/[0.08]">
            <Sparkles className="w-5 h-5 text-indigo-500 shrink-0" />
            <div className="text-sm text-zinc-700 dark:text-zinc-300">{empty ?? 'Nothing coming up. You’re all caught up.'}</div>
          </div>
        ) : (
          <div className="space-y-3">
            <Hero row={first} />
            {rest.length > 0 && (
              <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                {rest.map((r) => {
                  const Icon = ICONS[r.item.kind];
                  return (
                    <li key={`${r.item.kind}-${r.item.id}`} className="flex items-center gap-3 py-2.5">
                      <Icon aria-hidden className="w-4 h-4 text-zinc-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{r.item.title}</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{when(r)}{r.item.sub ? ` · ${r.item.sub}` : ''}</p>
                      </div>
                      <ActionButton row={r} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </motion.section>
  );
}

function Hero({ row }: { row: UpNextRow }) {
  const Icon = ICONS[row.item.kind];
  const hot = row.state === 'live' || row.state === 'soon';
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border', hot ? 'border-emerald-500/30 bg-emerald-500/[0.07]' : 'border-zinc-200/70 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.03]')}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', hot ? 'bg-emerald-600 text-white' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300')}><Icon className="w-5 h-5" /></span>
        <div className="min-w-0">
          <p className={cn('text-xs font-semibold', hot ? 'text-emerald-700 dark:text-emerald-300' : 'text-indigo-700 dark:text-indigo-300')} aria-live="polite">{when(row)}</p>
          <p className="text-base font-bold text-zinc-900 dark:text-white truncate">{row.item.title}</p>
          {row.item.sub && <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{row.item.sub}</p>}
        </div>
      </div>
      <ActionButton row={row} big />
    </div>
  );
}
