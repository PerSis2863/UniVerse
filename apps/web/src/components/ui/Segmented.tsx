'use client';

import { memo, useCallback, useEffect, useId, useRef } from 'react';
import { m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// iOS segmented control: a grey track whose white thumb springs to the chosen segment. For
// switching views inside one screen (Chart | Table, All | Unread). Pages that are separate routes
// use SectionTabs, which draws the same control with links.

export interface Segment<T extends string> { value: T; label: React.ReactNode; icon?: React.ReactNode }

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name of the group, e.g. "Show as". */
  label: string;
  large?: boolean;
  className?: string;
}

/**
 * The control redraws only when what it shows changes (2026-11-23, the owner: "make sure everything is ultra smooth"):
 * its thumb is a framer-motion layout element, which measures the page each time it redraws, so a parent that redraws
 * on every keystroke (Hyperion's editor) or every frame (the live wind tunnel) made it measure the page each time.
 * The newest onChange is kept in a ref, so a skipped redraw never leaves an old one behind.
 */
export function Segmented<T extends string>(props: Props<T>) {
  const latest = useRef(props.onChange);
  useEffect(() => { latest.current = props.onChange; });
  const onChange = useCallback((v: T) => latest.current(v), []);
  const View = SegmentedView as unknown as (p: Props<T>) => React.ReactElement;
  return <View {...props} onChange={onChange} />;
}

/** Labels and icons that are plain text compare by value; anything else counts as changed. */
const same = (a: React.ReactNode, b: React.ReactNode) => a === b && (a == null || typeof a !== 'object');
const SegmentedView = memo(SegmentedInner, (a, b) => a.value === b.value && a.label === b.label && a.large === b.large && a.className === b.className && a.onChange === b.onChange
  && a.segments.length === b.segments.length && a.segments.every((s, i) => s.value === b.segments[i].value && same(s.label, b.segments[i].label) && same(s.icon, b.segments[i].icon)));

function SegmentedInner<T extends string>({ segments, value, onChange, label, large, className }: Props<T>) {
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
