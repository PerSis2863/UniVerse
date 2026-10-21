'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { EASE_IOS, reducedMotion } from '@/lib/page-transition';

// A bottom sheet on phones, a centred dialog on larger screens. Swipe down to close on phones
// (SheetGestures, via data-sheet), Escape or a tap outside to close anywhere. Focus moves into the
// sheet when it opens and back to where it was when it closes. Closing with the X, Escape or a tap
// outside glides it away first (down on phones, a soft fade on larger screens), as the swipe does.

export function Sheet({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
  /** A larger sheet for reading and writing pages (lesson pages). */
  wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  const leaving = useRef(false);
  /** The exit glide, then onClose. A swipe already moved it away (SheetGestures): close at once. */
  const closeSoftly = useRef(() => {
    const p = panel.current, b = p?.parentElement;
    if (!p || leaving.current) return;
    if (reducedMotion() || p.style.transform) { close.current(); return; }
    leaving.current = true;
    const phone = window.innerWidth < 640, ms = phone ? 260 : 170;
    const pa = p.animate(phone ? [{ transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(0, 100%, 0)' }] : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: ms, easing: EASE_IOS, fill: 'forwards' });
    const ba = b?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' });
    const done = () => {
      close.current();
      // The sheet said no (it's saving, say): bring it back.
      setTimeout(() => { if (p.isConnected) { pa.cancel(); ba?.cancel(); leaving.current = false; } }, 60);
    };
    pa.finished.then(done, done);
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = panel.current;
    // The first field or button inside, else the panel itself.
    (el?.querySelector<HTMLElement>('input, textarea, select, [autofocus]') ?? el)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeSoftly.current(); return; }
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
    <div className="backdrop-in fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={(e) => e.target === e.currentTarget && closeSoftly.current()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} data-sheet className={`sheet-in w-full ${wide ? 'sm:max-w-3xl max-h-[92dvh]' : 'sm:max-w-md max-h-[85dvh]'} flex flex-col rounded-t-3xl sm:rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl outline-none`}>
        <div className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-zinc-200/70 dark:border-white/[0.07]">
          <h2 id={titleId} className="font-bold text-zinc-900 dark:text-white">{title}</h2>
          <button type="button" onClick={() => closeSoftly.current()} aria-label="Close" className="w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="p-4 border-t border-zinc-200/70 dark:border-white/[0.07] sheet-safe-bottom sm:pb-4">{footer}</div>}
      </div>
    </div>
  );
}
