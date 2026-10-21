'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Archive, CheckCircle2, Download, FileUp, Loader2, Minimize2, X } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { LEVELS, LEVEL_ORDER, METHOD_NOTE, formatSize, methodFor, savedPercent, type Level } from '@/lib/compress';
import { cn } from '@/lib/utils';

// Collaborate → Tools → Compress (src/components/docs/compress-engine.ts): drop files, pick how
// strongly, see each file's size before and after, download. It all happens on this device.

type Row = { id: string; file: File; state: 'waiting' | 'working' | 'done' | 'failed'; progress?: string; fraction?: number; out?: { name: string; blob: Blob; note?: string }; error?: string };
const MAX_FILES = 30;

const save = (name: string, blob: Blob) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
};

export function Compressor({ onClose }: { onClose?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [level, setLevel] = useState<Level>('medium');
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const add = (list: FileList | File[] | null) => {
    const picked = [...(list ?? [])];
    if (!picked.length) return;
    setRows((r) => [...r, ...picked.map((file) => ({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`, file, state: 'waiting' as const }))].slice(0, MAX_FILES));
  };
  const patch = (id: string, p: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const pickLevel = (l: Level) => {
    setLevel(l);
    // Results were for the old level: compress again with the new one.
    setRows((r) => r.map((x) => (x.state === 'working' ? x : { id: x.id, file: x.file, state: 'waiting' })));
  };

  const run = async () => {
    const todo = rows.filter((r) => r.state !== 'done');
    if (!todo.length) return;
    setRunning(true);
    const { compress } = await import('./compress-engine');
    for (const r of todo) {
      const ctl = new AbortController();
      abort.current = ctl;
      patch(r.id, { state: 'working', progress: 'Starting', fraction: undefined, error: undefined });
      try {
        const out = await compress(r.file, level, (progress, fraction) => patch(r.id, { progress, fraction }), ctl.signal);
        patch(r.id, { state: 'done', out });
      } catch (e) {
        if (ctl.signal.aborted) { patch(r.id, { state: 'waiting', progress: undefined }); break; }
        patch(r.id, { state: 'failed', error: (e as Error).message || 'Couldn’t compress it.' });
      }
    }
    abort.current = null;
    setRunning(false);
  };
  const done = rows.filter((r) => r.state === 'done' && r.out);
  const left = rows.filter((r) => r.state !== 'done').length;
  const before = done.reduce((n, r) => n + r.file.size, 0), after = done.reduce((n, r) => n + (r.out?.blob.size ?? 0), 0);
  const downloadAll = async () => {
    try {
      const { zipAll } = await import('./compress-engine');
      save('compressed-files.zip', await zipAll(done.map((r) => r.out!)));
    } catch (e) { toast.error((e as Error).message || 'Couldn’t make the ZIP.'); }
  };

  return (
    <section className="panel p-5 space-y-4" aria-labelledby="compress-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="compress-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Minimize2 className="w-4 h-4 text-indigo-500" aria-hidden />Compress files</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">Make pictures, PDFs, Word, Excel and PowerPoint files, videos and sound smaller. Anything else goes into a ZIP. It all happens on this device.</p>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close compress files" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>}
      </div>

      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} aria-label="Choose files to compress" />
      <button type="button" onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={cn('w-full rounded-2xl border-2 border-dashed p-6 text-center transition-colors', over ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-300 dark:border-white/15 hover:border-indigo-400')}>
        <FileUp className="w-7 h-7 mx-auto text-zinc-500" aria-hidden />
        <span className="block mt-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Choose files or drop them here</span>
        <span className="block text-xs text-zinc-600 dark:text-zinc-400">Up to {MAX_FILES} files</span>
      </button>

      <div className="space-y-1.5">
        <Segmented segments={LEVEL_ORDER.map((l) => ({ value: l, label: LEVELS[l].label }))} value={level} onChange={(l) => pickLevel(l)} label="How much to compress" className="w-full" />
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{LEVELS[level].hint}</p>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2" aria-label="Files to compress">
          {rows.map((r) => {
            const method = methodFor(r.file.name, r.file.type);
            const saved = r.out ? savedPercent(r.file.size, r.out.blob.size) : 0;
            return (
              <li key={r.id} className="rounded-2xl border border-zinc-200 dark:border-white/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{r.file.name}</span>
                    <span className="block text-xs text-zinc-600 dark:text-zinc-400">{formatSize(r.file.size)} · {METHOD_NOTE[method]}</span>
                  </span>
                  {r.state !== 'working' && <button type="button" onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))} aria-label={`Remove ${r.file.name}`} className="p-1.5 rounded-full text-zinc-500 hover:text-rose-600"><X className="w-4 h-4" /></button>}
                </div>
                {r.state === 'working' && (
                  <div className="flex items-center gap-2" aria-live="polite">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" aria-hidden />
                    <div role="progressbar" aria-label={`Compressing ${r.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.fraction != null ? Math.round(r.fraction * 100) : undefined} className="h-1.5 flex-1 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                      <div className={cn('h-full rounded-full bg-indigo-500 transition-[width]', r.fraction == null && 'w-1/3 animate-pulse')} style={r.fraction != null ? { width: `${Math.round(r.fraction * 100)}%` } : undefined} />
                    </div>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 tabular-nums shrink-0">{r.progress}</span>
                  </div>
                )}
                {r.state === 'done' && r.out && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="w-4 h-4" aria-hidden />{saved ? `${formatSize(r.file.size)} → ${formatSize(r.out.blob.size)} · ${saved}% smaller` : 'Unchanged'}</span>
                    <button type="button" onClick={() => save(r.out!.name, r.out!.blob)} className="btn-secondary btn-sm ms-auto"><Download className="w-4 h-4" />Download</button>
                    {r.out.note && <p className="w-full text-xs text-zinc-600 dark:text-zinc-400">{r.out.note}</p>}
                  </div>
                )}
                {r.state === 'failed' && <p className="text-sm text-rose-700 dark:text-rose-400 flex items-start gap-1.5"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />{r.error}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {running
            ? <button type="button" onClick={() => abort.current?.abort()} className="btn-secondary"><X className="w-4 h-4" />Stop</button>
            : <button type="button" onClick={() => void run()} disabled={!left} className="btn-primary"><Minimize2 className="w-4 h-4" />{left > 1 ? `Compress ${left} files` : 'Compress'}</button>}
          {done.length > 1 && <button type="button" onClick={() => void downloadAll()} className="btn-secondary"><Archive className="w-4 h-4" />Download all (ZIP)</button>}
          {done.length > 0 && before > after && <span className="text-xs text-zinc-600 dark:text-zinc-400">Saved {formatSize(before - after)} in all</span>}
        </div>
      )}
    </section>
  );
}
