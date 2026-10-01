'use client';

import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEMPLATES, type TemplateId } from './templates';

/** Name a new whiteboard and pick a starting layout. */
export function NewBoardDialog({ onCreate, onClose }: { onCreate: (title: string, template: TemplateId) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<TemplateId>('blank');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onCreate(title.trim() || (template === 'blank' ? 'Untitled board' : TEMPLATES.find((t) => t.id === template)!.name), template);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="New whiteboard" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">New whiteboard</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Name</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Biology revision map"
            className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/50 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
        </label>
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Start from</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TEMPLATES.map((t) => (
              <button type="button" key={t.id} onClick={() => setTemplate(t.id)} aria-pressed={template === t.id}
                className={cn('relative text-left rounded-2xl border p-3 transition-colors', template === t.id ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-200 dark:border-white/10 hover:border-indigo-500/40')}>
                {template === t.id && <Check className="absolute top-2 right-2 w-4 h-4 text-indigo-500" />}
                <p className="text-sm font-semibold text-zinc-900 dark:text-white pr-4">{t.name}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{t.description}</p>
              </button>
            ))}
          </div>
        </div>
        <button aria-busy={busy || undefined} disabled={busy} className="btn-primary btn-lg w-full">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create board
        </button>
      </form>
    </div>
  );
}
