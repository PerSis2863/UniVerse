'use client';

import { useId } from 'react';
import { m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// iOS segmented control: a grey track whose white thumb springs to the chosen segment. For
// switching views inside one screen (Chart | Table, All | Unread). Pages that are separate routes
// use SectionTabs, which draws the same control with links.

export interface Segment<T extends string> { value: T; label: React.ReactNode; icon?: React.ReactNode }

export function Segmented<T extends string>({ segments, value, onChange, label, large, className }: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name of the group, e.g. "Show as". */
  label: string;
  large?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div role="group" aria-label={label} className={cn('ios-segmented', large && 'large', className)}>
      {segments.map((s) => {
        const on = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={on}
            onClick={() => { if (!on) { haptic('tap'); onChange(s.value); } }}
            className="ios-segment"
          >
            {on && <motion.span layoutId={`seg-${id}`} transition={spring.snappy} className="ios-segment-thumb" aria-hidden />}
            {s.icon}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
