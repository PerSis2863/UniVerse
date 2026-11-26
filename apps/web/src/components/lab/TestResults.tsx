'use client';

import { Check, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TestReport } from '@/lib/lab/verify-lab';

// Hyperion's test results (M476): shown in the figure's place after Test (or runtests): a pass/fail summary, then
// each test with its time and, for a failure, why (verify… lists every failed check; assert… the one that stopped it).
export function TestResults({ report, onClose, onAgain, busy }: { report: TestReport; onClose: () => void; onAgain: () => void; busy: boolean }) {
  const failed = report.tests.filter((t) => !t.passed).length, n = report.tests.length;
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" aria-label="Test results">
      <div className={cn('flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium', !n ? 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200' : failed ? 'bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-200' : 'bg-green-50 text-green-900 dark:bg-green-500/10 dark:text-green-200')}>
        <span className="min-w-0 flex-1" data-test-summary>{!n ? `No tests in ${report.name}: write %% sections, or functions named test…` : failed ? `${failed} of ${n} failed` : `All ${n} passed`} <span className="font-normal opacity-80">· {report.name} · {report.ms.toFixed(0)} ms</span></span>
        <button type="button" onClick={onAgain} disabled={busy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"><RotateCcw className="h-3.5 w-3.5" aria-hidden />Run again</button>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"><X className="h-3.5 w-3.5" aria-hidden />Close</button>
      </div>
      <ul className="space-y-1">
        {report.tests.map((t) => (
          <li key={t.name} className="rounded-lg px-2 py-1.5 text-[13px] text-zinc-800 dark:text-zinc-100">
            <div className="flex items-center gap-2">
              {t.passed ? <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-label="Passed" /> : <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-label="Failed" />}
              <span className="min-w-0 flex-1 truncate" translate="no">{t.name}</span>
              {t.line && <span className="text-xs text-zinc-500 dark:text-zinc-400">line {t.line}</span>}
              <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{t.ms < 1 ? '<1' : t.ms.toFixed(0)} ms</span>
            </div>
            {!t.passed && <ul className="ms-6 mt-1 space-y-0.5 text-xs text-red-800 dark:text-red-300">{t.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
          </li>
        ))}
      </ul>
    </section>
  );
}
