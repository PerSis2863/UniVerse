'use client';

import { m as motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// A list row that swipes with a finger (M45; first in Notifications, Q9): drag it toward the end to
// run `start` (its label waits at the start edge), toward the start to run `end`. The mouse and the
// keyboard use the row's own buttons; the page still scrolls up and down through it.

export interface SwipeAction { label: string; icon: LucideIcon; tone: string; run: () => void }

const FAR = 90;

export function SwipeRow({ start, end, onSwipeStart, className, clip = true, children }: {
  start?: SwipeAction; end?: SwipeAction; onSwipeStart?: () => void; className?: string;
  /** false when the list around it already clips (so a highlight gliding between rows isn't cut). */
  clip?: boolean; children: React.ReactNode;
}) {
  const drag = useDragControls();
  const x = useMotionValue(0);
  const shown = useTransform(x, (v) => Math.min(1, Math.abs(v) / FAR));
  const done = (_: unknown, info: PanInfo) => {
    const toEnd = info.offset.x * (document.documentElement.dir === 'rtl' ? -1 : 1);
    const a = toEnd > FAR ? start : toEnd < -FAR ? end : undefined;
    if (a) { haptic('success'); a.run(); }
  };
  return (
    <div className={cn('relative rounded-2xl', clip && 'overflow-hidden')}>
      <motion.div aria-hidden style={{ opacity: shown }} className="absolute inset-0 flex items-center justify-between px-4 text-xs font-semibold">
        <span className={cn('inline-flex items-center gap-1', start?.tone)}>{start && <><start.icon className="w-4 h-4" />{start.label}</>}</span>
        <span className={cn('inline-flex items-center gap-1', end?.tone)}>{end && <>{end.label}<end.icon className="w-4 h-4" /></>}</span>
      </motion.div>
      <motion.div drag="x" dragListener={false} dragControls={drag} dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={0.5} dragSnapToOrigin
        style={{ x }} onPointerDown={(e) => { if (e.pointerType === 'touch') drag.start(e); }} onDragStart={onSwipeStart} onDragEnd={done}
        className={cn('relative touch-pan-y', className)}>
        {children}
      </motion.div>
    </div>
  );
}
