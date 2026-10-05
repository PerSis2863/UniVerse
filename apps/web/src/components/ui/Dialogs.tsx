'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

/*
 * Designed replacements for window.confirm / window.prompt.
 *   if (!(await confirmDialog({ title: 'Delete this course?', destructive: true }))) return;
 *   const name = await promptDialog({ title: 'Rename group', defaultValue: convo.title });
 * <DialogHost /> is mounted once at the app root. They look like iOS alerts: a compact frosted card
 * that pops in, with the buttons side by side under a hairline (stacked when the labels are long).
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
  const cancelLabel = pending.cancelLabel ?? 'Cancel';
  const confirmLabel = pending.confirmLabel ?? (destructive ? 'Delete' : 'OK');
  const stacked = cancelLabel.length + confirmLabel.length > 22;
  const button = 'min-h-11 px-3 text-[17px] text-tint-text transition-colors active:bg-[var(--fill)] disabled:opacity-40';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ui-dialog-title"
      className="backdrop-in fixed inset-0 z-[120] bg-black/30 flex items-center justify-center p-8"
      onMouseDown={(e) => e.target === e.currentTarget && close(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') close(false); }}
    >
      <div className="alert-in ios-alert w-[270px] max-w-full rounded-[22px] overflow-hidden text-center">
        <div className="px-4 pt-5 pb-4">
          <h2 id="ui-dialog-title" className="text-[17px] font-semibold leading-snug text-zinc-900 dark:text-white">{pending.title}</h2>
          {pending.message && <p className="text-[13px] leading-snug text-zinc-700 dark:text-zinc-300 mt-1">{pending.message}</p>}
          {pending.kind === 'prompt' && (
            <input
              ref={inputRef}
              value={value}
              maxLength={pending.maxLength ?? 200}
              placeholder={pending.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) close(true); }}
              className="mt-3 w-full h-9 px-2.5 rounded-[9px] bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 text-[15px] text-left text-zinc-900 dark:text-white outline-none focus:border-tint"
            />
          )}
        </div>
        <div className={cn(stacked ? 'flex flex-col-reverse' : 'grid grid-cols-2')} style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)' }}>
          <button aria-label={cancelLabel} onClick={() => close(false)} className={button} style={stacked ? { boxShadow: 'inset 0 0.5px 0 var(--separator)' } : { boxShadow: 'inset -0.5px 0 0 var(--separator)' }}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={() => close(true)}
            disabled={pending.kind === 'prompt' && !value.trim()}
            className={cn(button, 'font-semibold', destructive && 'text-[var(--ios-red)]')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
