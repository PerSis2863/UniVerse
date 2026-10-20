'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Languages, Loader2, Search, Square } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LANGUAGES, type Language } from '@/lib/i18n';
import { CHUNKS, chunkOf, type Chunk } from '@/lib/ui-dictionary';
import { card, errorMessage, fetcher, field } from './shared';
import { LoadError } from '@/components/ui/LoadError';

// Owner console → Languages (Stage 5 · Q21): the app's screens in other languages. "Translate what's
// missing" drafts the strings of public/i18n/catalog.json with the AI translator, one part (of 32)
// at a time, and saves each part; everything drafted is marked machine-translated until someone
// checks it here. Server: src/server/ui-translations.ts.

type Status = { chunks: number; languages: { lang: string; translated: number; reviewed: number; updatedAt: string | null }[] };
const OTHER = LANGUAGES.filter((l) => l.code !== 'en');
const BATCH = 80;

async function loadCatalog(): Promise<string[]> {
  const res = await fetch('/i18n/catalog.json', { cache: 'no-cache' });
  return ((await res.json()) as { strings: string[] }).strings;
}
const loadPart = async (lang: string, chunk: number) => (await api.get<Chunk>(`/owner/i18n/${lang}/${chunk}`)).data;
const savePart = (lang: string, chunk: number, part: Chunk) => api.put(`/owner/i18n/${lang}/${chunk}`, part);

export function LanguagesPanel() {
  const { data, error, mutate } = useSWR<Status>('/owner/i18n', fetcher, { revalidateOnFocus: false });
  const [lang, setLang] = useState<Language>('ar');
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const stop = useRef(false);
  if (error && !data) return <LoadError onRetry={() => void mutate()} />;
  if (!data) return <div className="h-40 rounded-2xl skeleton" />;
  const status = (code: string) => data.languages.find((l) => l.lang === code);

  const translate = async () => {
    stop.current = false;
    setRun({ done: 0, total: 0 });
    try {
      const catalog = await loadCatalog();
      const keep = new Set(catalog);
      const byPart = Array.from({ length: CHUNKS }, () => [] as string[]);
      for (const s of catalog) byPart[chunkOf(s)].push(s);
      let done = 0;
      let total = 0;
      const parts: Chunk[] = [];
      for (let c = 0; c < CHUNKS; c++) {
        parts[c] = await loadPart(lang, c);
        total += byPart[c].filter((s) => !(s in parts[c].s)).length;
      }
      setRun({ done, total });
      for (let c = 0; c < CHUNKS && !stop.current; c++) {
        const part = parts[c];
        const missing = byPart[c].filter((s) => !(s in part.s));
        // Text no longer on any screen is dropped from the part.
        const s = Object.fromEntries(Object.entries(part.s).filter(([k]) => keep.has(k)));
        for (let i = 0; i < missing.length && !stop.current; i += BATCH) {
          const batch = missing.slice(i, i + BATCH);
          const { data: res } = await api.post<{ translations: string[] }>('/owner/i18n/translate', { lang, strings: batch });
          batch.forEach((k, j) => { if (res.translations[j]) s[k] = res.translations[j]; });
          done += batch.length;
          setRun({ done, total });
        }
        if (missing.length || Object.keys(s).length !== Object.keys(part.s).length) await savePart(lang, c, { s, r: part.r.filter((k) => k in s) });
      }
      toast.success(stop.current ? 'Stopped. What was done is saved; carry on any time.' : `${LANGUAGES.find((l) => l.code === lang)?.name}: done`);
    } catch (e) {
      toast.error(errorMessage(e), { description: 'What was done so far is saved; press the button again to carry on.' });
    } finally {
      setRun(null);
      void mutate();
    }
  };

  const info = LANGUAGES.find((l) => l.code === lang)!;
  const st = status(lang);
  return (
    <div className="space-y-6">
      <section className={cn(card, 'p-4 sm:p-6')} aria-labelledby="lang-h">
        <h2 id="lang-h" className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Languages className="w-4 h-4 text-zinc-400" aria-hidden /> Languages</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">The app’s screens in other languages. Each is drafted once by the AI translator and saved; people see it when they choose the language in Settings. Arabic and Urdu read right to left.</p>
        <ul className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {OTHER.map((l) => {
            const s = status(l.code);
            return (
              <li key={l.code}>
                <button type="button" onClick={() => setLang(l.code)} aria-pressed={lang === l.code}
                  className={cn('w-full text-start rounded-xl border p-3 min-h-11', lang === l.code ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-200 dark:border-white/10')}>
                  <span className="font-semibold text-zinc-900 dark:text-white">{l.nativeName}</span> <span className="text-xs text-zinc-600 dark:text-zinc-400">{l.name}</span>
                  <span className="block text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">{s ? `${s.translated.toLocaleString()} texts · ${s.reviewed} checked` : 'Not translated yet'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void translate()} disabled={!!run} className="btn-primary min-h-11 inline-flex items-center gap-1.5">
            {run ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" aria-hidden />} Translate what’s missing in {info.name}
          </button>
          {run && <button type="button" onClick={() => { stop.current = true; }} className="btn-secondary min-h-11 inline-flex items-center gap-1.5"><Square className="w-4 h-4" aria-hidden /> Stop</button>}
          {run && run.total > 0 && (
            <span className="text-sm text-zinc-700 dark:text-zinc-300 tabular-nums" role="status">{run.done.toLocaleString()} of {run.total.toLocaleString()}</span>
          )}
          {!run && st && <span className="text-xs text-zinc-600 dark:text-zinc-400">Last change {st.updatedAt ? new Date(st.updatedAt).toLocaleString() : '—'}</span>}
        </div>
        {run && run.total > 0 && <div className="mt-3 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" aria-hidden><div className="h-full bg-indigo-600 transition-[width]" style={{ width: `${Math.round((run.done / run.total) * 100)}%` }} /></div>}
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-3">Uses the AI (about one request per 80 texts, roughly 130 for a whole language). New screens: run it again and only their texts are translated.</p>
      </section>
      {st && st.translated > 0 && <Review key={lang} lang={lang} />}
    </div>
  );
}

/** Find a text and correct its translation (then it counts as checked by a person). */
function Review({ lang }: { lang: Language }) {
  const [parts, setParts] = useState<Chunk[] | null>(null);
  const [q, setQ] = useState('');
  const [onlyMachine, setOnlyMachine] = useState(true);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = async () => {
    try {
      setParts(await Promise.all(Array.from({ length: CHUNKS }, (_, c) => loadPart(lang, c))));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  if (!parts) return (
    <section className={cn(card, 'p-4 sm:p-6')}>
      <h2 className="font-semibold text-zinc-900 dark:text-white">Check translations</h2>
      <button type="button" onClick={() => void load()} className="btn-secondary min-h-11 mt-3">Load the translations</button>
    </section>
  );
  const needle = q.trim().toLowerCase();
  const rows = parts.flatMap((p, c) => Object.entries(p.s).map(([en, tr]) => ({ en, tr, c, checked: p.r.includes(en) })))
    .filter((r) => (!onlyMachine || !r.checked) && (!needle || r.en.toLowerCase().includes(needle) || r.tr.toLowerCase().includes(needle)))
    .slice(0, 50);
  const save = async (en: string, c: number) => {
    const value = (edit[en] ?? '').trim();
    if (!value) return;
    setBusy(en);
    try {
      const part = { s: { ...parts[c].s, [en]: value }, r: [...new Set([...parts[c].r, en])] };
      await savePart(lang, c, part);
      setParts(parts.map((p, i) => (i === c ? part : p)));
      toast.success('Saved');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const info = LANGUAGES.find((l) => l.code === lang)!;
  return (
    <section className={cn(card, 'p-4 sm:p-6')} aria-labelledby="review-h">
      <h2 id="review-h" className="font-semibold text-zinc-900 dark:text-white">Check translations</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[12rem]">
          <span className="sr-only">Search texts</span>
          <Search className="w-4 h-4 text-zinc-400 absolute start-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search English or the translation" className={cn(field, 'ps-9')} />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 min-h-11">
          <input type="checkbox" checked={onlyMachine} onChange={(e) => setOnlyMachine(e.target.checked)} className="w-4 h-4" /> Only not checked yet
        </label>
      </div>
      <ul className="mt-4 divide-y divide-zinc-100 dark:divide-white/[0.06]">
        {rows.map((r) => (
          <li key={r.en} className="py-3 grid sm:grid-cols-2 gap-2 items-start">
            <p className="text-sm text-zinc-800 dark:text-zinc-200 break-words" translate="no">{r.en}</p>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor={`tr-${r.c}-${r.en}`}>Translation of “{r.en}”</label>
              <input id={`tr-${r.c}-${r.en}`} dir={info.dir} lang={lang} translate="no" value={edit[r.en] ?? r.tr} onChange={(e) => setEdit({ ...edit, [r.en]: e.target.value })} className={cn(field, 'flex-1')} />
              <button type="button" onClick={() => void save(r.en, r.c)} disabled={busy !== null || (edit[r.en] ?? r.tr) === r.tr && r.checked} aria-label={`Save the translation of “${r.en}”`}
                className="btn-secondary min-h-11 px-3 inline-flex items-center gap-1">{busy === r.en ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{r.checked ? '' : <span className="sr-only">Mark checked</span>}</button>
            </div>
            {!r.checked && <span className="text-[11px] font-semibold uppercase text-amber-800 dark:text-amber-300 sm:col-start-2">Machine-translated</span>}
          </li>
        ))}
        {rows.length === 0 && <li className="py-6 text-sm text-zinc-600 dark:text-zinc-400 text-center">Nothing here.</li>}
      </ul>
    </section>
  );
}
