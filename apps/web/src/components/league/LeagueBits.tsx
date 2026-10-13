import { STATUS_LABEL, type LeagueStatus } from '@/lib/impact-league';
import { cn } from '@/lib/utils';

// Small pieces shared by the Impact League pages (Stage 5 · D14).

// The UN's colour for each goal; the number is drawn in black or white, whichever reads better.
const SDG_COLORS = ['#E5243B', '#DDA63A', '#4C9F38', '#C5192D', '#FF3A21', '#26BDE2', '#FCC30B', '#A21942', '#FD6925', '#DD1367', '#FD9D24', '#BF8B2E', '#3F7E44', '#0A97D9', '#56C02B', '#00689D', '#19486A'];
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const inkFor = (hex: string) => {
  const l = luminance(hex);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#18181b' : '#ffffff';
};

export function SdgBadge({ sdg, name, size = 'md' }: { sdg: number | null; name?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  if (!sdg) return null;
  const bg = SDG_COLORS[sdg - 1] ?? '#6366f1';
  const box = size === 'lg' ? 'w-14 h-14 text-xl rounded-2xl' : size === 'sm' ? 'w-8 h-8 text-xs rounded-lg' : 'w-11 h-11 text-base rounded-xl';
  return (
    <span className={cn('shrink-0 inline-flex flex-col items-center justify-center font-black leading-none', box)} style={{ backgroundColor: bg, color: inkFor(bg) }} title={name ? `UN goal ${sdg}: ${name}` : `UN goal ${sdg}`}>
      <span className="sr-only">UN goal </span>{sdg}
      {size !== 'sm' && <span className="text-[8px] font-bold tracking-wide mt-0.5" aria-hidden>SDG</span>}
    </span>
  );
}

const STATUS_CLS: Record<LeagueStatus, string> = {
  DRAFT: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  OPEN: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  JUDGING: 'bg-amber-500/10 text-amber-800 dark:text-amber-200',
  DONE: 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-200',
};
export function StatusChip({ status }: { status: LeagueStatus }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold shrink-0', STATUS_CLS[status])}>{STATUS_LABEL[status]}</span>;
}

export const when = (d: string | null | undefined) => (d ? new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

/** A thin progress bar with its numbers for screen readers. */
export function Progress({ done, total, label, count = true }: { done: number; total: number; label: string; count?: boolean }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="h-1.5 flex-1 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {count && <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400 shrink-0">{done}/{total}</span>}
    </div>
  );
}
