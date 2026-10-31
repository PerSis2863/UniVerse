'use client';

import { m as motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/use-now';

// A timetable with a moving "now" line (M50, after the "Waypoint" video's dock schedule): one row
// per item, a bar from when it started to when it ends (or is expected to), bars growing in from
// the left one after another, and a pink line for now that glides along as time passes. Hours along
// the top. For shipments today, class times, anything with a start and an end.

export interface Slot { id: string; label: string; start: number; end: number; state: 'moving' | 'done' | 'late'; note?: string }

export function Schedule({ slots, from, to, className }: { slots: Slot[]; from: number; to: number; className?: string }) {
  const now = useNow();
  const span = Math.max(1, to - from);
  const pos = (x: number) => `${Math.max(0, Math.min(100, ((x - from) / span) * 100))}%`;
  // At most about seven marks along the top: hours for a day or less, days beyond.
  const H = 3600_000;
  const step = [H, 2 * H, 3 * H, 6 * H, 12 * H, 24 * H, 48 * H, 168 * H].find((x) => span / x <= 7) ?? 168 * H;
  const hours: number[] = [];
  for (let x = Math.ceil(from / step) * step; x <= to; x += step) hours.push(x);
  const mark = (x: number) => (step >= 24 * H ? new Date(x).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : new Date(x).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
  return (
    <div className={cn('relative', className)}>
      <div className="relative ms-28 h-5 text-[11px] text-zinc-500 dark:text-zinc-400" aria-hidden>
        {hours.map((x) => <span key={x} className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ insetInlineStart: pos(x) }}>{mark(x)}</span>)}
      </div>
      <ol className="relative space-y-1.5">
        {slots.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span className="w-26 shrink-0 truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200" translate="no">{s.label}</span>
            <span className="relative h-7 flex-1 rounded-lg bg-zinc-900/[0.04] dark:bg-white/[0.04]">
              <motion.span
                className={cn('absolute inset-y-1 flex origin-left items-center overflow-hidden rounded-md px-2 text-[11px] font-semibold rtl:origin-right',
                  s.state === 'done' ? 'bg-zinc-900/10 text-zinc-700 dark:bg-white/10 dark:text-zinc-200' : s.state === 'late' ? 'bg-amber-500/90 text-zinc-950' : 'bg-gradient-to-r from-fuchsia-600 to-pink-500 text-white shadow-[0_6px_16px_-8px_rgba(236,72,153,0.8)]')}
                style={{ insetInlineStart: pos(s.start), width: `calc(${pos(s.end)} - ${pos(s.start)})`, minWidth: 6 }}
                initial={{ scaleX: 0.85, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ delay: 0.05 + Math.min(i, 10) * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                <span className="truncate">{s.note ?? ''}</span>
              </motion.span>
            </span>
          </li>
        ))}
        {now >= from && now <= to && (
          <li aria-hidden className="pointer-events-none absolute inset-y-0 start-28 end-0">
            <span className="absolute inset-y-[-4px] w-px bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.9)]" style={{ insetInlineStart: pos(now) }}>
              <span className="absolute -bottom-5 -translate-x-1/2 rounded-full bg-pink-500 px-1.5 text-[11px] font-semibold text-white tabular-nums">now</span>
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}
