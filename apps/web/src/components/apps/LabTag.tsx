import { cn } from '@/lib/utils';

/** M112 (the council): the apps still finding their first people wear a small "Lab" tag (`lab` in
 *  src/lib/apps.ts). Pass the colours for where it sits; the text is real, so it reads in a name. */
export function LabTag({ className }: { className?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full border px-1.5 text-[11px] font-semibold leading-[18px]', className)}>Lab</span>;
}
