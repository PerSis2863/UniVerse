'use client';

import { useSyncExternalStore } from 'react';
import { Eye } from 'lucide-react';
import { endViewAs, viewAsName, viewAsToken } from '@/lib/view-as';

const noopSubscribe = () => () => {};

/** Shown while the owner views the app as someone (Stage 5 · Q19, src/lib/view-as.ts). */
export default function ViewAsBanner() {
  const name = useSyncExternalStore(noopSubscribe, () => (viewAsToken() ? viewAsName() ?? 'someone' : null), () => null);
  if (!name) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-amber-100 py-1.5 pl-4 pr-1.5 text-sm text-amber-950 shadow-lg ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-50 dark:ring-amber-700">
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">Viewing as <strong>{name}</strong> · read-only</span>
      <button type="button" onClick={() => void endViewAs()} className="min-h-[44px] shrink-0 rounded-full bg-amber-950 px-4 text-xs font-semibold text-amber-50 hover:bg-amber-900 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-white">
        End
      </button>
    </div>
  );
}
