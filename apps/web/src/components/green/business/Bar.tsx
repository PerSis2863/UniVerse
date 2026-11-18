import { Fill } from '@/components/ui/Fill';
import { cn } from '@/lib/utils';

// Green → Business (M281): a thin bar for a share (0–1) that slides on the graphics chip (`Fill`, M231), never by
// growing a width, so it stays smooth while numbers change.
export function Bar({ value, className, tone = 'bg-emerald-600' }: { value: number; className?: string; tone?: string }) {
  return <div className={cn('mt-1 h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10', className)} aria-hidden><Fill value={value} className={cn('rounded-full', tone)} /></div>;
}
