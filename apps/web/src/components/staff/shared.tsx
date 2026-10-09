import { format } from 'date-fns';
import { CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared bits for staff pages (Stage 5 · B15.8).

export const LEAVE_LABEL: Record<string, string> = { SICK: 'Sick leave', PERSONAL: 'Personal leave', TRAINING: 'Training', OTHER: 'Other leave' };
const d = (day: string) => new Date(`${day}T12:00:00`);
/** "Tue 14 Oct" */
export const dayLabel = (day: string) => format(d(day), 'EEE d MMM');
/** "Tue 14 Oct" or "Tue 14 – Fri 17 Oct (4 days)" */
export function range(from: string, to: string) {
  if (from === to) return dayLabel(from);
  const days = Math.round((d(to).getTime() - d(from).getTime()) / 86_400_000) + 1;
  return `${format(d(from), 'EEE d MMM')} – ${dayLabel(to)} (${days} days)`;
}

export function LeaveChip({ status }: { status: string }) {
  const [label, tone, Icon] = status === 'APPROVED' ? ['Approved', 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10', CheckCircle2]
    : status === 'DECLINED' ? ['Declined', 'text-rose-700 dark:text-rose-300 bg-rose-500/10', XCircle]
    : status === 'CANCELLED' ? ['Cancelled', 'text-zinc-600 dark:text-zinc-300 bg-zinc-500/10', MinusCircle]
    : ['Waiting', 'text-amber-800 dark:text-amber-300 bg-amber-500/10', Clock];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0', tone)}><Icon className="w-3 h-3" aria-hidden />{label}</span>;
}
