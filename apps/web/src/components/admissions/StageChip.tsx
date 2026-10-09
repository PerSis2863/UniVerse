import { CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react';
import { STAGE_LABEL, type Stage } from '@/lib/admission-form';
import { cn } from '@/lib/utils';

// An application's stage as a chip (Stage 5 · B15.1): icon and words, never colour alone.
export function StageChip({ stage, className }: { stage: Stage; className?: string }) {
  const [tone, Icon] = stage === 'ENROLLED' || stage === 'ACCEPTED' ? ['text-emerald-700 dark:text-emerald-300 bg-emerald-500/10', CheckCircle2]
    : stage === 'OFFERED' ? ['text-indigo-700 dark:text-indigo-300 bg-indigo-500/10', CheckCircle2]
    : stage === 'REJECTED' || stage === 'DECLINED' ? ['text-rose-700 dark:text-rose-300 bg-rose-500/10', XCircle]
    : stage === 'WITHDRAWN' ? ['text-zinc-600 dark:text-zinc-300 bg-zinc-500/10', MinusCircle]
    : ['text-amber-800 dark:text-amber-300 bg-amber-500/10', Clock];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0', tone, className)}><Icon className="w-3 h-3" aria-hidden />{STAGE_LABEL[stage] ?? stage}</span>;
}
