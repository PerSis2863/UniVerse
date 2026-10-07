'use client';

import { m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';

// A ring that fills to `value` (0–1), Apple Fitness style, with the label in the middle.

export function ProgressRing({ value, size = 56, stroke = 6, label, color = 'url(#ring-gradient)' }: {
  value: number; size?: number; stroke?: number; label?: React.ReactNode; color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(v * 100)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-zinc-200 dark:stroke-white/10" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v) }} transition={spring.gentle}
        />
      </svg>
      {label != null && <span className="absolute text-xs font-bold text-zinc-900 dark:text-white tabular-nums">{label}</span>}
    </div>
  );
}
