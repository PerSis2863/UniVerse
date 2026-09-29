'use client';

import { ArrowLeft, Eye, RotateCcw } from 'lucide-react';
import Link from '@/components/ui/Link';
import { confirmDialog } from '@/components/ui/Dialogs';
import { cn } from '@/lib/utils';

export const field =
  'w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';
export const card = 'rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50';

/** Always visible at the top of an Explore page, so nobody mistakes the preview for the real thing. */
export function PreviewBanner({ mode, onReset }: { mode: string; onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 justify-between p-3 sm:px-4 rounded-2xl border border-amber-500/30 bg-amber-500/10">
      <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
        <Eye className="w-4 h-4 shrink-0" />
        <span><strong>Preview mode: {mode}.</strong> Only you can see this, and nothing is sent to anyone.</span>
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={async () => {
            if (await confirmDialog({ title: 'Reset this preview?', message: 'Everything you set up in Explore mode is cleared.', confirmLabel: 'Reset', destructive: true })) onReset();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <Link href="/explore" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Exit
        </Link>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors', value === t.id ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
          {t.label}
          {!!t.count && <span className="ml-1.5 opacity-70">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300">{children}</span>;
}

export function Empty({ icon: Icon, title, text }: { icon: typeof Eye; title: string; text: string }) {
  return (
    <div className={cn(card, 'p-10 text-center')}>
      <Icon className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600" />
      <p className="mt-2 font-semibold text-zinc-900 dark:text-white">{title}</p>
      <p className="text-sm text-zinc-500 mt-1">{text}</p>
    </div>
  );
}
