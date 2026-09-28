'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

/*
 * Designed replacements for window.confirm / window.prompt.
 *   if (!(await confirmDialog({ title: 'Delete this course?', destructive: true }))) return;
 *   const name = await promptDialog({ title: 'Rename group', defaultValue: convo.title });
 * <DialogHost /> is mounted once at the app root.
 */

type ConfirmOpts = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean };
type PromptOpts = { title: string; message?: string; defaultValue?: string; placeholder?: string; confirmLabel?: string; maxLength?: number };
type Pending =
  | ({ kind: 'confirm'; resolve: (v: boolean) => void } & ConfirmOpts)
  | ({ kind: 'prompt'; resolve: (v: string | null) => void } & PromptOpts);

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function open(p: Pending) {
  // A new dialog replaces any open one (the old one resolves as cancelled).
  if (current) current.kind === 'confirm' ? current.resolve(false) : current.resolve(null);
  current = p;
  emit();
}

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => open({ kind: 'confirm', resolve, ...opts }));
}

export function promptDialog(opts: PromptOpts): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => open({ kind: 'prompt', resolve, ...opts }));
}

export function DialogHost() {
  const pending = useSyncExternalStore(subscribe, () => current, () => null);
  const [value, setValue] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pending) return;
    if (pending.kind === 'prompt') { setValue(pending.defaultValue ?? ''); setTimeout(() => inputRef.current?.select(), 30); }
    else setTimeout(() => confirmRef.current?.focus(), 30);
  }, [pending]);

  if (!pending) return null;

  const close = (ok: boolean) => {
    const p = pending;
    current = null;
    emit();
    if (p.kind === 'confirm') { if (ok && p.destructive) haptic('warning'); p.resolve(ok); }
    else p.resolve(ok ? value.trim() || null : null);
  };

  const destructive = pending.kind === 'confirm' && pending.destructive;
  const Icon = destructive ? AlertTriangle : HelpCircle;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ui-dialog-title"
      className="backdrop-in fixed inset-0 z-[120] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && close(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') close(false); }}
    >
      <div data-sheet className="sheet-in w-full sm:max-w-sm rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl p-5 sheet-safe-bottom sm:pb-5">
        <div className="flex items-start gap-3">
          <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0', destructive ? 'bg-rose-500/12 text-rose-500' : 'bg-indigo-500/12 text-indigo-500')}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 id="ui-dialog-title" className="font-bold text-zinc-900 dark:text-white leading-snug">{pending.title}</h2>
            {pending.message && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{pending.message}</p>}
          </div>
        </div>

        {pending.kind === 'prompt' && (
          <input
            ref={inputRef}
            value={value}
            maxLength={pending.maxLength ?? 200}
            placeholder={pending.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) close(true); }}
            className="mt-4 w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button aria-label="Cancel" onClick={() => close(false)} className="py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-white/[0.07] hover:bg-zinc-200 dark:hover:bg-white/10">
            {pending.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            onClick={() => close(true)}
            disabled={pending.kind === 'prompt' && !value.trim()}
            className={cn('py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50', destructive ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500')}
          >
            {pending.confirmLabel ?? (destructive ? 'Delete' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}
