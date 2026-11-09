import { cn } from '@/lib/utils';

// M141: the Ballast reels' outcome labels ("Waiting", "Within limits", "Approved"): a small tinted
// label whose colour says the state. Green, amber and red only for states (§8); blue for "done, nothing
// to decide"; grey for the rest.

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'grey';

const TONES: Record<Tone, string> = {
  green: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 ring-emerald-600/20 dark:ring-emerald-400/25',
  amber: 'bg-amber-500/10 text-amber-800 dark:text-amber-200 ring-amber-600/25 dark:ring-amber-400/25',
  red: 'bg-rose-500/10 text-rose-800 dark:text-rose-300 ring-rose-600/20 dark:ring-rose-400/25',
  blue: 'bg-sky-500/10 text-sky-800 dark:text-sky-300 ring-sky-600/20 dark:ring-sky-400/25',
  grey: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 ring-zinc-500/20',
};

export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center h-6 px-2 rounded-md text-xs font-medium ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}
