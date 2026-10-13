'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { BookOpen, Languages, Loader2, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { LANGUAGES, isLanguage, languageName } from '@/lib/languages';
import { spring } from '@/lib/motion';
import { useLanguageStore } from '@/store/language';
import { cn } from '@/lib/utils';

// A course material as text, in your language (Stage 5 · D8, language-free classroom). The text is
// what the AI tutor read from the file; sections are translated a few at a time and cached for
// everyone (src/server/text-translate.ts, kind "material-part"). The original is one tap away.

type Read = { title: string; status: string; error?: string | null; sourceId: string | null; sections: string[]; canPrepare: boolean };
type Result = { text: string; from: string; same: boolean };
const BATCH = 3;

export function MaterialReader({ courseId, materialId, title, onClose }: { courseId: string; materialId: string; title: string; onClose: () => void }) {
  const key = `/api/courses/${courseId}/materials/${materialId}/read`;
  const { data, error, mutate } = useSWR<Read>(key, authedJson);
  const app = useLanguageStore((s) => s.language);
  const to = isLanguage(app) ? app : 'en';
  const [translated, setTranslated] = useState<Record<number, Result>>({});
  const [mode, setMode] = useState<'original' | 'translated'>('original');
  const [working, setWorking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const stop = useRef(false);

  const translateAll = async () => {
    if (!data?.sourceId) return;
    setMode('translated');
    setWorking(true);
    stop.current = false;
    try {
      const todo = data.sections.map((_, i) => i).filter((i) => !translated[i]);
      for (let i = 0; i < todo.length && !stop.current; i += BATCH) {
        const part = todo.slice(i, i + BATCH);
        const r = await authedJson<{ translations: Record<string, Result> }>('/api/translate', { method: 'POST', body: JSON.stringify({ to, items: part.map((n) => ({ kind: 'material-part', id: `${data.sourceId}.${n}` })) }) });
        const got: Record<number, Result> = {};
        for (const n of part) { const t = r.translations[`material-part:${data.sourceId}.${n}`]; if (t) got[n] = t; }
        setTranslated((s) => ({ ...s, ...got }));
      }
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t translate this right now.')); }
    finally { setWorking(false); }
  };

  const prepare = async () => {
    setPreparing(true);
    try { await mutate(await authedJson<Read>(key, { method: 'POST' }), { revalidate: false }); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t read this file.')); }
    finally { setPreparing(false); }
  };

  const done = Object.keys(translated).length;
  const allSame = data?.sections.length ? data.sections.every((_, i) => translated[i]?.same) : false;
  const from = Object.values(translated).find((t) => !t.same)?.from;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="reader-title" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={spring.smooth} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 sm:rounded-2xl w-full max-w-3xl h-full sm:h-[88vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 sheet-safe-top">
          <div className="min-w-0">
            <h3 id="reader-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 truncate"><BookOpen className="w-4 h-4 text-indigo-500 shrink-0" /> {title}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Read it in your language. The original file is still the one that counts.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close reader" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        {data?.status === 'READY' && (
          <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center gap-2" role="group" aria-label="Language">
            <button type="button" aria-pressed={mode === 'original'} onClick={() => { stop.current = true; setMode('original'); }} className={cn('btn-sm', mode === 'original' ? 'btn-primary' : 'btn-secondary')}>Original</button>
            <button type="button" aria-pressed={mode === 'translated'} onClick={() => void translateAll()} disabled={working && mode === 'translated'} className={cn('btn-sm', mode === 'translated' ? 'btn-primary' : 'btn-secondary')}>
              {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />} <span lang={to}>{LANGUAGES[to]?.native ?? languageName(to)}</span>
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
              {mode === 'translated' && (allSame ? `It’s already in ${languageName(to)}.` : working ? `Translating… ${done} of ${data.sections.length} sections` : from && isLanguage(from) ? `Translated by AI from ${languageName(from)}` : '')}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6" role="region" aria-label="Text" tabIndex={0}>
          {error && !data ? <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'Couldn’t open this.')}</p>
            : !data ? <div className="space-y-3">{[90, 80, 95, 70].map((w, i) => <div key={i} className="h-3 rounded-full skeleton" style={{ width: `${w}%` }} />)}</div>
            : data.status !== 'READY' ? (
              <div className="max-w-md mx-auto text-center py-10 space-y-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {data.status === 'FAILED' ? (data.error ?? 'This file couldn’t be read.') : data.canPrepare ? 'This file hasn’t been read yet. Reading it takes a few seconds and lets everyone in the course read it in their language (and ask the AI tutor about it).' : 'This file can’t be shown as text yet. Ask your teacher, or download the original.'}
                </p>
                {data.canPrepare && data.status !== 'FAILED' && (
                  <button type="button" onClick={() => void prepare()} disabled={preparing} className="btn-primary">{preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />} Read the file now</button>
                )}
              </div>
            ) : (
              <article className="max-w-prose mx-auto space-y-5">
                {data.sections.map((text, i) => {
                  const t = translated[i];
                  const show = mode === 'translated' && t && !t.same ? t.text : text;
                  return <p key={i} lang={show !== text ? to : undefined} className="text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-line">{show}</p>;
                })}
              </article>
            )}
        </div>
      </motion.div>
    </motion.div>
  );
}
