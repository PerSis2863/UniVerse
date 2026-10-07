'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

// A bottom sheet on phones, a centred dialog on larger screens. Swipe down to close on phones
// (SheetGestures, via data-sheet), Escape or a tap outside to close anywhere. Focus moves into the
// sheet when it opens and back to where it was when it closes.

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = panel.current;
    // The first field or button inside, else the panel itself.
    (el?.querySelector<HTMLElement>('input, textarea, select, [autofocus]') ?? el)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      // Keep Tab inside the sheet.
      const items = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); before?.focus?.({ preventScroll: true }); };
  }, []);

  return (
    <div className="backdrop-in fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} data-sheet className="sheet-in w-full sm:max-w-md max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl outline-none">
        <div className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-zinc-200/70 dark:border-white/[0.07]">
          <h3 id={titleId} className="font-bold text-zinc-900 dark:text-white">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="p-4 border-t border-zinc-200/70 dark:border-white/[0.07] sheet-safe-bottom sm:pb-4">{footer}</div>}
      </div>
    </div>
  );
}
