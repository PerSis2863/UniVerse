'use client';

import { m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// iOS switch: 51×31, green when on; the knob springs across and stretches while pressed.
export function Switch({ checked, onChange, disabled, label, id, className }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name when there's no visible <label htmlFor>. */
  label?: string;
  id?: string;
  className?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => { haptic('tap'); onChange(!checked); }}
      className={cn('ios-switch', className)}
    >
      <motion.span layout transition={spring.snappy} className="ios-switch-knob" aria-hidden />
    </button>
  );
}
