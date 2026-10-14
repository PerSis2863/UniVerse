'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, Download, FileUp, Loader2, Repeat2, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { combinedTargets, kindOf, targetsFor, type Kind, type Target } from '@/lib/convert-formats';
import { cn } from '@/lib/utils';
import type { Output } from './convert-engine';

// The file converter in Collaborate → Docs (Stage 5 · B9.14): drop files, pick what each should
// become, download the result (or open a document in Docs to edit together). Everything happens on
// this device; nothing is uploaded unless it's opened as a doc.

const KIND_LABEL: Record<Kind, string> = { image: 'Picture', pdf: 'PDF', word: 'Word', text: 'Text', markdown: 'Markdown', html: 'Web page', sheet: 'Excel', csv: 'CSV', json: 'JSON', audio: 'Sound', video: 'Video', zip: 'ZIP', other: 'Not supported' };
const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.heic,.heif,.svg,.pdf,.docx,.txt,.md,.markdown,.html,.htm,.xlsx,.csv,.tsv,.json,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.mp4,.webm,.mov,.m4v,.zip';

export function Converter({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<{ key: string; outputs: Output[] }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const add = (list: FileList | File[] | null) => {
    const picked = [...(list ?? [])].slice(0, 20);
    if (picked.length) setFiles((f) => [...f, ...picked].slice(0, 20));
  };
  const deliver = async (outs: Output[], key: string) => {
    for (const o of outs) {
      if (o.doc) {
        // A new doc, filled with this the first time it opens (src/app/(dashboard)/docs/[id]/page.tsx).
        const d = await authedJson<{ id: string }>('/api/docs', { method: 'POST', body: JSON.stringify({ title: o.doc.title.slice(0, 120) }) });
        try { sessionStorage.setItem(`doc-import:${d.id}`, o.doc.html.slice(0, 1_500_000)); } catch { /* storage full */ }
        router.push(`/docs/${d.id}`);
        return;
      }
    }
    setResults((r) => [{ key, outputs: outs.filter((o) => o.blob) }, ...r.filter((x) => x.key !== key)]);
  };
  const run = async (key: string, fn: () => Promise<Output[]>) => {
    setBusy(key);
    setProgress('');
    try {
      await deliver(await fn(), key);
    } catch (e) { toast.error((e as Error).message || 'Couldn’t convert it.'); }
    finally { setBusy(null); setProgress(''); }
  };
  const one = (f: File, t: Target) => run(`${f.name}:${t.id}`, async () => (await import('./convert-engine')).convert(f, t, setProgress));
  const all = (t: Target) => run(`all:${t.id}`, async () => [await (await import('./convert-engine')).combine(files, t)]);
  const download = (o: Output) => {
    if (!o.blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(o.blob);
    a.download = o.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const kinds = files.map((f) => kindOf(f.name, f.type));
  const together = combinedTargets(kinds);

  return (
    <section className="panel p-5 space-y-4" aria-labelledby="convert-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="convert-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Repeat2 className="w-4 h-4 text-indigo-500" aria-hidden />Convert files</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Word, PDF, Excel, CSV, pictures, sound, video and ZIP. It all happens on this device.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the converter" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <button type="button" onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={cn('w-full rounded-2xl border-2 border-dashed p-6 text-center transition-colors', over ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-300 dark:border-white/15 hover:border-indigo-400')}>
        <FileUp className="w-7 h-7 mx-auto text-zinc-400" aria-hidden />
        <span className="block mt-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Choose files or drop them here</span>
        <span className="block text-xs text-zinc-500">Up to 20 files, 100 MB each</span>
      </button>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => {
            const kind = kinds[i];
            const targets = targetsFor(kind);
            return (
              <li key={`${f.name}-${i}`} className="rounded-2xl border border-zinc-200 dark:border-white/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 shrink-0">{KIND_LABEL[kind]}</span>
                  <span className="flex-1 min-w-0 text-sm font-medium text-zinc-900 dark:text-white truncate">{f.name}</span>
                  <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">{f.size < 1048576 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1048576).toFixed(1)} MB`}</span>
                  <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="p-1 rounded-full text-zinc-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>
                </div>
                {targets.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
                    {targets.map((t) => (
                      <button key={t.id} type="button" onClick={() => void one(f, t)} disabled={!!busy} title={t.hint} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-indigo-400/60 disabled:opacity-50">
                        {busy === `${f.name}:${t.id}` && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}{t.label}{busy === `${f.name}:${t.id}` && progress && <span className="font-normal text-zinc-600 dark:text-zinc-400">· {progress}</span>}
                      </button>
                    ))}
                  </div>
                ) : <p className="mt-1.5 text-xs text-zinc-500">This kind of file can’t be converted here yet.</p>}
                {results.filter((r) => r.key.startsWith(`${f.name}:`)).flatMap((r) => r.outputs).map((o, k) => (
                  <button key={k} type="button" onClick={() => download(o)} className="mt-2 mr-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 text-xs font-semibold"><Download className="w-3.5 h-3.5" aria-hidden />{o.name}</button>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      {together.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-semibold text-zinc-500">All {files.length} together:</span>
          {together.map((t) => (
            <button key={t.id} type="button" onClick={() => void all(t)} disabled={!!busy} title={t.hint} className="btn-secondary btn-sm">{busy === `all:${t.id}` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{t.label}</button>
          ))}
          {results.filter((r) => r.key.startsWith('all:')).flatMap((r) => r.outputs).map((o, k) => (
            <button key={k} type="button" onClick={() => download(o)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 text-xs font-semibold"><Download className="w-3.5 h-3.5" aria-hidden />{o.name}</button>
          ))}
        </div>
      )}
    </section>
  );
}
