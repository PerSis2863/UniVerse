'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { Arranger } from '@/lib/arrange-dom';
import { useArrange } from '@/store/arrange';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// M165: every page of the app can be rearranged with the mouse alone (src/lib/arrange-dom.ts does the
// work): drag a card or a button to move it, pull a card's right or bottom edge to resize it. Nothing
// is drawn and there is no mode. What a person arranged is put back on every visit; once a page was
// changed, the top bar offers to put it back as it was.

/** The top bar's "Put this page back" (and the phone title row's): there only on a page the person rearranged. */
export function ArrangeButton({ className }: { className?: string }) {
  const { arranged, reset } = useArrange();
  if (!arranged) return null;
  return (
    <button type="button" data-arrange-ui onClick={reset} title="Put this page back as it was (Ctrl+Z takes back one change)"
      className={cn('drop-in btn-ghost btn-icon rounded-full', className)}>
      <RotateCcw className="w-[18px] h-[18px]" strokeWidth={2.1} aria-hidden /><span className="sr-only">Put this page back</span>
    </button>
  );
}

export function ArrangeMode() {
  const pathname = usePathname();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const engine = useRef<Arranger | null>(null);

  useEffect(() => {
    const root = document.getElementById('main');
    if (!root) return;
    const a = new Arranger(root, userId, ({ arranged }) => useArrange.getState().set({ arranged, reset: () => a.reset() }));
    engine.current = a;
    return () => { a.destroy(); engine.current = null; useArrange.getState().set({ arranged: false, reset: () => undefined }); };
  }, [userId]);
  useEffect(() => { engine.current?.setPath(pathname); }, [pathname, userId]);
  return null;
}
