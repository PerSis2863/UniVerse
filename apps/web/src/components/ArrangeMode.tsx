'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Check, LayoutDashboard, RotateCcw, Undo2 } from 'lucide-react';
import { Arranger } from '@/lib/arrange-dom';
import { useArrange } from '@/store/arrange';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// M165: "Arrange this page" on every page of the app (src/lib/arrange-dom.ts does the work). The button
// sits in the top bar; while it is on, a bar at the foot says what to do and offers Undo, Reset and Done.
// What a person arranged is put back on every visit, whether the mode is on or not.

/** The top bar's button (and the phone title row's). */
export function ArrangeButton({ className }: { className?: string }) {
  const { on, set } = useArrange();
  return (
    <button type="button" data-arrange-ui aria-pressed={on} onClick={() => set(!on)} title="Arrange this page: drag things to move them, pull a card’s edge to resize it"
      className={cn('btn-ghost btn-icon rounded-full', on && 'bg-[var(--fill)]', className)}>
      <LayoutDashboard className="w-[19px] h-[19px]" strokeWidth={2.1} aria-hidden /><span className="sr-only">Arrange this page</span>
    </button>
  );
}

export function ArrangeMode() {
  const { on, set } = useArrange();
  const pathname = usePathname();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const engine = useRef<Arranger | null>(null);
  const [state, setState] = useState({ canUndo: false, arranged: false });

  useEffect(() => {
    const root = document.getElementById('main');
    if (!root) return;
    const a = new Arranger(root, userId, setState, () => useArrange.getState().set(false));
    engine.current = a;
    return () => { a.destroy(); engine.current = null; };
  }, [userId]);
  useEffect(() => { engine.current?.setPath(pathname); }, [pathname, userId]);
  useEffect(() => { engine.current?.setMode(on); }, [on, userId]);

  if (!on) return null;
  return createPortal(
    <div data-arrange-ui role="toolbar" aria-label="Arrange this page"
      className="arrange-bar fixed z-[80] inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] lg:bottom-5 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 shadow-2xl">
      <p className="px-1 text-[13px] text-zinc-700 dark:text-zinc-200"><b className="text-zinc-900 dark:text-white">Arranging.</b> Drag anything to move it; pull a card’s right or bottom edge to resize it.</p>
      <button type="button" onClick={() => engine.current?.undo()} disabled={!state.canUndo} className="btn-secondary btn-sm"><Undo2 className="w-3.5 h-3.5" aria-hidden />Undo</button>
      <button type="button" onClick={() => engine.current?.reset()} disabled={!state.arranged} className="btn-secondary btn-sm"><RotateCcw className="w-3.5 h-3.5" aria-hidden />Reset this page</button>
      <button type="button" onClick={() => set(false)} className="btn-primary btn-sm"><Check className="w-3.5 h-3.5" aria-hidden />Done</button>
    </div>,
    document.body,
  );
}
