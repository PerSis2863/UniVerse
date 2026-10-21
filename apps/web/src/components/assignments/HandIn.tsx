'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Link2, Loader2, Paperclip, X } from 'lucide-react';
import { FileBubble } from '@/components/chat/FilePreview';
import { uploadChatFile } from '@/components/chat/chat-client';
import { safeHref } from '@/lib/safe-href';
import { FileDrop } from '@/components/ui/FileDrop';

// Files and links handed in for an assignment (Stage 5 · B3.2, src/lib/submit-kinds.ts): what the
// grader and the student see, and the student's picker.

export interface HandedIn { fileUrl?: string | null; fileName?: string | null; fileSize?: number | null; linkUrl?: string | null }

const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const isImage = (name: string | null | undefined) => /\.(png|jpe?g|gif|webp)$/i.test(name ?? '');
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/** A handed-in file (pictures shown, PDFs and text previewed) or link. */
export function HandedInView({ h }: { h: HandedIn }) {
  if (h.fileUrl) {
    if (isImage(h.fileName)) {
      return (
        <a href={h.fileUrl} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element -- a file the student uploaded */}
          <img src={h.fileUrl} alt={h.fileName ?? 'Picture handed in'} className="max-h-[28rem] rounded-xl border border-zinc-200 dark:border-white/10" />
        </a>
      );
    }
    return <div className="rounded-2xl border border-zinc-200 dark:border-white/10 inline-block"><FileBubble url={h.fileUrl} name={h.fileName ?? null} size={h.fileSize ?? null} mime={null} mine={false} /></div>;
  }
  const href = h.linkUrl ? safeHref(h.linkUrl) : null;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 px-3 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/5 max-w-full">
        <Link2 className="w-4 h-4 shrink-0" aria-hidden /><span className="truncate">{hostOf(href)}</span><ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
      </a>
    );
  }
  return null;
}

/** The student's file picker (uploads at once) or link field. */
export function HandInFields({ kind, value, onChange, disabled }: { kind: 'FILE' | 'LINK'; value: HandedIn; onChange: (v: HandedIn) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const pick = async (f: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!f) return;
    setProgress(0);
    try {
      const url = await uploadChatFile(f, setProgress);
      onChange({ fileUrl: url, fileName: f.name, fileSize: f.size });
    } catch (e) {
      toast.error((e as Error).message || 'The file couldn’t be uploaded.');
    } finally {
      setProgress(null);
    }
  };
  if (kind === 'LINK') {
    return (
      <label className="block text-sm"><span className="font-semibold text-zinc-900 dark:text-white">Your link</span>
        <input type="url" inputMode="url" disabled={disabled} value={value.linkUrl ?? ''} onChange={(e) => onChange({ linkUrl: e.target.value })} placeholder="https://" className="input mt-1" />
      </label>
    );
  }
  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-zinc-900 dark:text-white">Your file</span>
      {value.fileUrl ? (
        <div className="flex items-center gap-2 text-sm">
          <Paperclip className="w-4 h-4 text-indigo-500 shrink-0" aria-hidden />
          <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">{value.fileName}{value.fileSize ? ` · ${sizeText(value.fileSize)}` : ''}</span>
          {!disabled && <button type="button" onClick={() => onChange({})} aria-label="Remove the file" className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><X className="w-4 h-4" /></button>}
        </div>
      ) : null}
      <input ref={input} type="file" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <FileDrop onFiles={(f) => void pick(f[0])} disabled={disabled || progress !== null}>
        <button type="button" disabled={disabled || progress !== null} onClick={() => input.current?.click()} className="btn-secondary btn-sm">
          {progress !== null ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading… {progress}%</> : <><Paperclip className="w-4 h-4" /> {value.fileUrl ? 'Choose another file' : 'Choose a file (up to 25 MB)'}</>}
        </button>
      </FileDrop>
    </div>
  );
}
