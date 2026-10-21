'use client';

import type { ReactNode } from 'react';
import { useFileDrop } from '@/lib/use-file-drop';
import { cn } from '@/lib/utils';

/**
 * A file field's surroundings that also take a dropped file, or one pasted while the field is
 * focused (Phase E): wrap the "Choose a file" button and pass what its picker does with the files.
 */
export function FileDrop({ onFiles, accept, multiple, disabled, children, className }: {
  onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; disabled?: boolean; children: ReactNode; className?: string;
}) {
  const { over, props } = useFileDrop(onFiles, { accept, multiple, disabled });
  return (
    <div {...props} className={cn('relative rounded-xl', className)}>
      {children}
      {!disabled && <p className="hidden sm:block mt-1 text-xs text-zinc-600 dark:text-zinc-400">Or drop {multiple ? 'files' : 'a file'} here, or paste {multiple ? 'them' : 'it'} (Ctrl+V).</p>}
      {over && (
        <div aria-hidden className="absolute -inset-1 rounded-xl bg-indigo-500/10 border-2 border-dashed border-indigo-500 flex items-center justify-center text-sm font-semibold text-indigo-700 dark:text-indigo-200 pointer-events-none">
          Drop to add
        </div>
      )}
    </div>
  );
}
