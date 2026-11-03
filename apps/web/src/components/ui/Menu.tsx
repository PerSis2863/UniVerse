'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { spring } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { useMedia } from '@/lib/use-media';
import { Sheet } from './Sheet';
import { cn } from '@/lib/utils';

// A button that opens a small panel (Office suite toolbars): drawn over the page, so a toolbar that
// scrolls sideways doesn't cut it off. Escape or a click outside closes it; focus goes back to the
// button. Menu: a list of actions, moved through with the arrow keys.

const TRIGGER = 'h-8 min-w-8 px-1.5 rounded-lg inline-flex items-center justify-center gap-1 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-40';

export function Popover({ label, button, children, disabled, className, title, wide }: {
  /** The button's name for screen readers (and its tooltip unless `title`). */
  label: string;
  button: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  disabled?: boolean; className?: string; title?: string; wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => setOpen(false);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    // Placed straight on the panel (no re-render): under the button, or above it near the bottom.
    const place = () => {
      const p = panel.current, b = btn.current;
      if (!p || !b) return;
      const r = b.getBoundingClientRect();
      const w = p.offsetWidth, h = p.offsetHeight;
      const below = r.bottom + 6 + h <= window.innerHeight - 8 || r.top < h + 12;
      p.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
      p.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    const button = btn.current;
    // Into the panel: its first control.
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], button, input, select')?.focus());
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key, true);
      // Closed from inside (an item chosen): focus goes back to the button, not lost.
      const at = document.activeElement;
      if (!at || at === document.body || at.closest('[data-popover]')) button?.focus();
    };
  }, [open]);
  return (
    <>
      <button ref={btn} type="button" disabled={disabled} aria-label={label} title={title ?? label} aria-haspopup="true" aria-expanded={open} aria-controls={open ? id : undefined}
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}
        className={cn(TRIGGER, open && 'bg-zinc-100 dark:bg-white/10', className)}>
        {button}
      </button>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            // Placed by `place` above (a plain box, so nothing re-renders it back).
            <div key="panel" ref={panel} id={id} data-popover style={{ position: 'fixed', top: -9999, left: -9999 }} className="z-[70]">
              <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={spring.snappy}
                className={cn('rounded-xl bg-white dark:bg-[#1d2650] border border-zinc-200 dark:border-white/10 shadow-2xl text-sm text-zinc-800 dark:text-zinc-100 max-h-[70vh] overflow-y-auto', wide ? 'w-80' : 'min-w-52 max-w-72')}>
                {children(close)}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

export type MenuItem = { label: string; onSelect: () => void; icon?: React.ReactNode; disabled?: boolean; checked?: boolean; hint?: string } | 'sep' | { heading: string };

/** A list of actions in a Popover. */
export function Menu({ label, button, items, disabled, className, title }: { label: string; button: React.ReactNode; items: MenuItem[]; disabled?: boolean; className?: string; title?: string }) {
  // Phones (M45): the same list as a sheet from the bottom, with room for a thumb.
  const phone = useMedia('(max-width: 767px)');
  const [sheet, setSheet] = useState(false);
  if (phone) return (
    <>
      <button type="button" disabled={disabled} aria-label={label} title={title ?? label} aria-haspopup="dialog" onClick={() => { haptic('tap'); setSheet(true); }} className={cn(TRIGGER, className)}>{button}</button>
      {sheet && <Sheet title={label} onClose={() => setSheet(false)}><div className="-mx-2"><MenuList items={items} label={label} onDone={() => setSheet(false)} /></div></Sheet>}
    </>
  );
  return (
    <Popover label={label} button={button} disabled={disabled} className={className} title={title}>
      {(close) => <MenuList items={items} label={label} onDone={close} />}
    </Popover>
  );
}

export function MenuList({ items, label, onDone }: { items: MenuItem[]; label: string; onDone: () => void }) {
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const list = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])')];
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  };
  return (
    <div role="menu" aria-label={label} onKeyDown={onKey} className="py-1">
      {items.map((it, i) => {
        if (it === 'sep') return <div key={i} role="separator" className="my-1 h-px bg-zinc-200 dark:bg-white/10" />;
        if ('heading' in it) return <p key={i} className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{it.heading}</p>;
        return (
          <button key={i} type="button" role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={it.checked} disabled={it.disabled}
            onClick={() => { onDone(); it.onSelect(); }}
            className="w-full text-start px-3 py-2 max-md:py-3 max-md:rounded-xl flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06] focus:bg-zinc-100 dark:focus:bg-white/[0.06] outline-none disabled:opacity-40">
            <span className="w-4 h-4 shrink-0 flex items-center justify-center text-zinc-500 dark:text-zinc-400">{it.checked ? <Check className="w-4 h-4" /> : it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.hint && <kbd className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans">{it.hint}</kbd>}
          </button>
        );
      })}
    </div>
  );
}

/** Colours for text and fills, as in Office's palette. */
export const PALETTE = ['#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff', '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc'];

export function ColorGrid({ label, value, onPick, none = 'No colour' }: { label: string; value?: string; onPick: (c: string | null) => void; none?: string }) {
  return (
    <div className="p-2 space-y-2">
      <div role="group" aria-label={label} className="grid grid-cols-6 gap-1.5">
        {PALETTE.map((c) => (
          <button key={c} type="button" aria-label={c} aria-pressed={value === c} title={c} onClick={() => onPick(c)} style={{ background: c }}
            className={cn('w-7 h-7 rounded-md border border-zinc-300 dark:border-white/20', value === c && 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-[#1d2650]')} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPick(null)} className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-start">{none}</button>
        <label className="text-xs inline-flex items-center gap-1.5">Other
          <input type="color" value={value ?? '#000000'} onChange={(e) => onPick(e.target.value)} className="w-7 h-7 rounded border border-zinc-300 dark:border-white/20 bg-transparent" />
        </label>
      </div>
    </div>
  );
}
