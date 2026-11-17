import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

// M231: the coloured part of a progress bar. It is always the track's full width and slides in from the start
// (`.fill` in globals.css): moving it is done by the graphics chip, so it stays smooth while a page loads,
// where growing a width re-lays out the page on every frame. It slides in from empty when it appears
// (@starting-style) and glides to each new value. The track around it needs `overflow-hidden`.

/** `quick`: for progress that moves while you watch (an upload, a timer, loading): a short glide that keeps up. */
export function Fill({ value, className, style, delay, quick }: { value: number; className?: string; style?: CSSProperties; delay?: number; quick?: boolean }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return <span aria-hidden className={cn('fill', quick && 'fill-quick', className)} style={{ ...style, '--fill': v, ...(delay ? { transitionDelay: `${delay}ms` } : {}) } as CSSProperties} />;
}
