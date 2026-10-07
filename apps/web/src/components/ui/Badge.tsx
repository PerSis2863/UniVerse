import { cn } from '@/lib/utils';

// Status pills (globals.css .badge): a tinted fill and coloured text. Pick the tone by meaning:
// green = done/good, amber = waiting/attention, red = problem/late, blue = info, zinc = neutral.

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'zinc' | 'indigo';
const TONE: Record<Tone, string> = {
  green: 'badge-green',
  amber: 'badge-amber',
  red: 'badge-red',
  blue: 'badge-blue',
  zinc: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
};

export function Badge({ tone = 'zinc', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn('badge', TONE[tone], className)}>{children}</span>;
}
