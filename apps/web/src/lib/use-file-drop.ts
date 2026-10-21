'use client';

import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';

// Files dropped on a field, or pasted while it's focused (a screenshot: Ctrl/Cmd+V), go to the
// same place as the file picker (Phase E). Spread `props` on the area around the field; `over`
// is true while files are dragged over it (show it).

/** Whether a file fits an <input accept> list ("image/*,.pdf,application/zip"); empty fits all. */
export function matchesAccept(file: { name: string; type: string }, accept?: string) {
  const parts = (accept ?? '').split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return parts.some((p) => (p.startsWith('.') ? name.endsWith(p) : p.endsWith('/*') ? type.startsWith(p.slice(0, -1)) : type === p));
}

const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');

export function useFileDrop(onFiles: (files: File[]) => void, opts: { accept?: string; multiple?: boolean; disabled?: boolean } = {}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const take = (list: FileList | null | undefined) => {
    const files = [...(list ?? [])].filter((f) => matchesAccept(f, opts.accept));
    if (!files.length) return false;
    onFiles(opts.multiple ? files : files.slice(0, 1));
    return true;
  };
  const props = opts.disabled ? {} : {
    onDragEnter: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current += 1; setOver(true); },
    onDragOver: (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
    onDrop: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current = 0; setOver(false); take(e.dataTransfer.files); },
    onPaste: (e: ClipboardEvent) => { if (e.clipboardData?.files?.length && take(e.clipboardData.files)) e.preventDefault(); },
  };
  return { over, props };
}
