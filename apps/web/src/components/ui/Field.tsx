'use client';

import { useId } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// A labelled form field: label, the control, then a hint or an error, and a character counter when
// there's a limit. The control gets the label, hint and error wired up for screen readers.

export function Field({ label, hint, error, count, max, children, className }: {
  label: string;
  hint?: string;
  error?: string | null;
  /** Current length, shown as "12/300" when `max` is set. */
  count?: number;
  max?: number;
  /** The control; receives id / aria-describedby / aria-invalid. */
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="label">{label}</label>
        {max != null && count != null && <span className={cn('text-[11px] tabular-nums', count > max ? 'text-rose-500' : 'text-zinc-400')}>{count}/{max}</span>}
      </div>
      {children({ id, 'aria-describedby': note ? noteId : undefined, 'aria-invalid': error ? true : undefined })}
      {note && <p id={noteId} className={cn('mt-1 text-xs', error ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500 dark:text-zinc-400')}>{note}</p>}
    </div>
  );
}

/** A search box with a magnifier and a clear button. */
export function SearchField({ value, onChange, placeholder = 'Search', className, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus} className="input pl-10 pr-9" />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
