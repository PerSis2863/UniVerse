'use client';

import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// A headline card in the owner's CreditKarma photos (M92, "Credit Factors"): a thin-line icon in a
// circle and a round arrow button on top, the label under them, one big number with a small unit at
// the bottom and a tiny picture of it beside the number. Tones are the photos' frosts. Every part
// draws in currentColor, so a card reads in both themes and on a frost.

type Tone = 'plain' | 'dusk' | 'gold' | 'olive';
const TONE: Record<Tone, string> = {
  plain: 'bg-[var(--card-bg)] text-zinc-900 dark:text-white border border-[var(--card-border)] shadow-[var(--card-shadow)]',
  dusk: 'karma-frost',
  gold: 'text-zinc-900 dark:text-white [background:var(--karma-gold)]',
  olive: 'karma-frost-olive',
};

export function FactorCard({ icon: Icon, label, value, unit, viz, tone = 'plain', warn, onClick, className }: {
  icon: LucideIcon; label: string; value: React.ReactNode; unit?: string; viz?: React.ReactNode;
  tone?: Tone; warn?: boolean; onClick?: () => void; className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={cn('group relative flex min-h-[11.5rem] flex-col rounded-[var(--radius-card)] p-5 text-start transition-transform duration-200 [corner-shape:squircle]', onClick && 'active:scale-[0.985]', TONE[tone], className)}>
      <span className="flex items-start justify-between">
        <span className="karma-icon relative opacity-90"><Icon className="w-[18px] h-[18px]" strokeWidth={1.5} aria-hidden />
          {warn && <span className="absolute -top-0.5 -end-0.5 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-[var(--card-bg)]" aria-hidden />}
        </span>
        {onClick && <span className="karma-go" aria-hidden><ArrowUpRight className="w-4 h-4" /></span>}
      </span>
      <span className="mt-4 max-w-[12rem] text-[15px] font-medium leading-snug">{label}{warn && <span className="sr-only"> (waiting for you)</span>}</span>
      <span className="mt-auto flex items-end justify-between gap-3 pt-4">
        <span className="text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}{unit && <span className="ms-1 text-sm font-medium opacity-60">{unit}</span>}</span>
        {viz && <span className="mb-1 shrink-0 opacity-90" aria-hidden>{viz}</span>}
      </span>
    </Tag>
  );
}

/** Where a value sits on a short scale: small dots on a line, the one at the value large. */
export function Dots({ value, max }: { value: number; max: number }) {
  const at = Math.round(Math.max(0, Math.min(1, max ? value / max : 0)) * 4);
  return (
    <svg width="92" height="20" viewBox="0 0 92 20">
      <line x1="6" x2="86" y1="10" y2="10" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={6 + i * 20} cy="10" r={i === at ? 7 : 2.5} fill="currentColor" fillOpacity={i === at ? 1 : 0.7} />)}
    </svg>
  );
}

/** A few thin bars (the latest days), the last one full strength. */
export function Ticks({ values }: { values: number[] }) {
  const v = values.slice(-9), peak = Math.max(1, ...v);
  return (
    <svg width="92" height="28" viewBox="0 0 92 28">
      <line x1="0" x2="92" y1="27.5" y2="27.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
      {v.map((n, i) => { const h = 3 + (n / peak) * 23; return <rect key={i} x={4 + i * 10} y={27 - h} width="2.5" height={h} rx="1.25" fill="currentColor" fillOpacity={i === v.length - 1 ? 1 : 0.55} />; })}
    </svg>
  );
}

/** A soft line through the values, dots on its two highest points. */
export function Wave({ values }: { values: number[] }) {
  const v = values.length > 1 ? values : [0, 0], peak = Math.max(1, ...v), n = v.length - 1;
  const pts = v.map((y, i) => [2 + (i / n) * 88, 24 - (y / peak) * 20] as const);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2; d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`; }
  const top = [...pts.keys()].sort((a, b) => v[b] - v[a]).slice(0, 2);
  return (
    <svg width="92" height="28" viewBox="0 0 92 28" fill="none">
      <path d={d} stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      {top.map((i) => <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r="2.5" fill="currentColor" />)}
    </svg>
  );
}

/** Rings for a small count: one filled ring per item, up to five. */
export function Rings({ filled, total = 5 }: { filled: number; total?: number }) {
  return (
    <svg width={total * 18} height="16" viewBox={`0 0 ${total * 18} 16`} fill="none">
      {Array.from({ length: total }, (_, i) => <circle key={i} cx={8 + i * 18} cy="8" r="6.5" stroke="currentColor" strokeOpacity={i < filled ? 1 : 0.4} strokeWidth="1.25" fill={i < filled ? 'currentColor' : 'none'} />)}
    </svg>
  );
}

/** A grid of small dots, as many dark as the value (out of 16). */
export function Matrix({ value }: { value: number }) {
  const on = Math.min(16, Math.max(0, Math.round(value)));
  return (
    <svg width="72" height="18" viewBox="0 0 72 18">
      {Array.from({ length: 16 }, (_, i) => <circle key={i} cx={4 + (i % 8) * 9} cy={i < 8 ? 4 : 13} r="2.2" fill="currentColor" fillOpacity={i < on ? 1 : 0.22} />)}
    </svg>
  );
}
