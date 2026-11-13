'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// M165: a divider to drag between two panes (or under one, for its height), and the sizes it keeps on
// this device. Pointer and keys (arrows, Home to put it back); the pane follows the pointer every frame.

/** Pane sizes in px kept on this device under `key` (not part of a person's saved work). */
export function usePaneSizes<T extends Record<string, number>>(key: string, initial: T) {
  const [sizes, setSizes] = useState<T>(() => {
    try { const s = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<T> | null; if (s && typeof s === 'object') return { ...initial, ...Object.fromEntries(Object.entries(s).filter(([k, v]) => k in initial && typeof v === 'number' && Number.isFinite(v))) } as T; } catch { /* private window */ }
    return initial;
  });
  const set = useCallback((patch: Partial<T>) => setSizes((old) => {
    const next = { ...old, ...patch };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* this visit only */ }
    return next;
  }), [key]);
  return [sizes, set] as const;
}

export function Splitter({ axis = 'x', value, min, max, initial, label, onChange, className, pill, target }: {
  /** 'x': between side-by-side panes (drag left and right); 'y': under a pane (drag up and down). */
  axis?: 'x' | 'y'; value: number; min: number; max: number; initial: number; label: string; onChange: (v: number) => void; className?: string;
  /** A grab bar that always shows (phones: there is no pointer to hover with). */
  pill?: boolean;
  /** The pane it sizes, when that isn't the element holding it. */
  target?: React.RefObject<HTMLElement | null>;
}) {
  const frame = useRef(0);
  const clamp = (v: number) => Math.round(Math.max(min, Math.min(max, v)));
  // The pane's size as it really is (its parent holds the divider on its edge): right even when the size kept is "the usual".
  const now = (el: HTMLElement) => { const r = (target ? target.current : el.parentElement)?.getBoundingClientRect(); return r ? (axis === 'x' ? r.width : r.height) : value; };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget, from = axis === 'x' ? e.clientX : e.clientY, start = now(el);
    const way = axis === 'x' && getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    el.setPointerCapture(e.pointerId);
    el.dataset.dragging = '';
    let at = from;
    const move = (m: PointerEvent) => {
      at = axis === 'x' ? m.clientX : m.clientY;
      if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; onChange(clamp(start + (at - from) * way)); });
    };
    const up = () => { delete el.dataset.dragging; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const key = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const less = axis === 'x' ? 'ArrowLeft' : 'ArrowUp', more = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === less || e.key === more) { e.preventDefault(); onChange(clamp(now(e.currentTarget) + (e.key === more ? 1 : -1) * (e.shiftKey ? 48 : 16))); }
    else if (e.key === 'Home') { e.preventDefault(); onChange(initial); }
  };
  return (
    <div role="separator" tabIndex={0} data-no-arrange aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-label={label}
      aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max} onPointerDown={down} onKeyDown={key} onDoubleClick={() => onChange(initial)}
      title={`${label}: drag, or double-click to put it back`}
      className={cn('splitter group absolute z-10 touch-none select-none outline-none', axis === 'x' ? 'inset-y-0 -end-[6px] w-3 cursor-col-resize' : 'inset-x-0 -bottom-[6px] h-3 cursor-row-resize', className)}>
      {pill && <span aria-hidden className={cn('absolute rounded-full bg-zinc-400/70 dark:bg-zinc-500/80', axis === 'x' ? 'start-1/2 top-1/2 h-9 w-1 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2' : 'start-1/2 top-1/2 h-1 w-10 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2')} />}
      <span aria-hidden className={cn('absolute rounded-full bg-indigo-500 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[dragging]:opacity-100',
        axis === 'x' ? 'inset-y-0 start-[5px] w-0.5' : 'inset-x-0 top-[5px] h-0.5')} />
    </div>
  );
}
