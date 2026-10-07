'use client';

import { Fragment, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { Clapperboard, FileEdit, FileText, GraduationCap, Loader2, NotebookPen, PlayCircle, Search, Sparkles, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// "Ask your semester" (Stage 4 · 4.5; src/server/semester.ts): one box to search everything from a
// student's semester (what was said in class, study packs, materials, their documents, their graded
// work, notes of calls they were in) and to ask AI for an answer with sources. Which kinds are
// included is the student's choice, kept on this device and sent with every search.

type Kind = 'transcript' | 'pack' | 'material' | 'doc' | 'work' | 'meeting';
interface Result { id: number; kind: Kind; ref: string; title: string; snippet: string; link: string; at: number | null; day: string | null }
interface Answer { answer: string | null; grounded: boolean; citations: { n: number; kind: Kind; title: string; link: string; at: number | null; excerpt: string }[]; pending: number }

const KINDS: { id: string; label: string; kinds: Kind[]; icon: typeof FileText }[] = [
  { id: 'classes', label: 'Classes', kinds: ['transcript', 'pack'], icon: Clapperboard },
  { id: 'materials', label: 'Materials', kinds: ['material'], icon: FileText },
  { id: 'docs', label: 'Documents', kinds: ['doc'], icon: FileEdit },
  { id: 'work', label: 'My work', kinds: ['work'], icon: GraduationCap },
  { id: 'meetings', label: 'Meetings', kinds: ['meeting'], icon: Users },
];
const ICON: Record<Kind, typeof FileText> = { transcript: Clapperboard, pack: NotebookPen, material: FileText, doc: FileEdit, work: GraduationCap, meeting: Users };
const LABEL: Record<Kind, string> = { transcript: 'Said in class', pack: 'Study pack', material: 'Material', doc: 'Document', work: 'Your work', meeting: 'Meeting notes' };
const KEY = 'universe:semester-kinds';
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The search's highlighted words («…» from the database) as <mark>. */
function Snippet({ text }: { text: string }) {
  return <>{text.split(/(«[^»]*»)/).map((p, i) => (p.startsWith('«') ? <mark key={i} className="bg-amber-200/70 dark:bg-amber-400/25 text-inherit rounded px-0.5">{p.slice(1, -1)}</mark> : <Fragment key={i}>{p}</Fragment>))}</>;
}

/** The answer's [n] marks as links to their sources. */
function Cited({ text, citations }: { text: string; citations: Answer['citations'] }) {
  return (
    <>{text.split(/(\[\d+\])/).map((p, i) => {
      const n = /^\[(\d+)\]$/.exec(p)?.[1];
      const c = n ? citations.find((x) => x.n === Number(n)) : undefined;
      return c ? <Link key={i} href={c.link} title={c.title} className="align-super text-[10px] font-bold text-indigo-600 dark:text-indigo-300 px-0.5 hover:underline">{n}</Link> : <Fragment key={i}>{p}</Fragment>;
    })}</>
  );
}

export function SemesterSearch() {
  const [on, setOn] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return Array.isArray(v) && v.length ? v : KINDS.map((k) => k.id); } catch { return KINDS.map((k) => k.id); }
  });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [pending, setPending] = useState(0);
  const [searching, setSearching] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const kinds = KINDS.filter((k) => on.includes(k.id)).flatMap((k) => k.kinds);

  // Search as you type (a moment after you stop): no AI, so it's free and quick.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    let off = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await authedJson<{ results: Result[]; pending: number }>(`/api/semester?q=${encodeURIComponent(query)}&kinds=${kinds.join(',')}`);
        if (!off) { setResults(r.results); setPending(r.pending); }
      } catch (e) { if (!off) toast.error((e as Error).message); } finally { if (!off) setSearching(false); }
    }, 350);
    return () => { off = true; clearTimeout(t); };
  }, [q, kinds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id];
    if (!next.length) return;
    setOn(next);
    setAnswer(null);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };
  const ask = async () => {
    if (q.trim().length < 3) return;
    setAsking(true);
    try {
      const r = await authedJson<Answer>('/api/semester', { method: 'POST', body: JSON.stringify({ q: q.trim(), kinds }) });
      setAnswer(r);
      setPending(r.pending);
      if (!r.answer) toast('Nothing in your semester matches that yet. Try other words.');
    } catch (e) { toast.error((e as Error).message); } finally { setAsking(false); }
  };

  const shown = q.trim().length >= 2 ? results : null;
  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Ask your semester</h2>
          <p className="text-sm text-zinc-500">Find anything from your classes, materials, documents and graded work, or ask for an answer with sources.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="flex gap-2">
          <label className="flex-1 flex items-center gap-2 h-12 px-4 rounded-2xl bg-white dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 focus-within:ring-2 focus-within:ring-indigo-400/40">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setAnswer(null); }} placeholder="When did we cover recursion? What did my essay feedback say?" aria-label="Search your semester"
              className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-400" />
            {searching && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
          </label>
          <button type="submit" disabled={asking || q.trim().length < 3} className="h-12 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Ask AI
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="What to include">
          {KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => toggle(k.id)} aria-pressed={on.includes(k.id)}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors', on.includes(k.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-300 dark:border-white/15 text-zinc-500')}>
              <k.icon className="w-3.5 h-3.5" />{k.label}
            </button>
          ))}
        </div>
        {pending > 0 && <p className="text-xs text-zinc-500">Still reading {pending} older item{pending === 1 ? '' : 's'} from your semester; results get fuller as you search.</p>}

        {answer?.answer && (
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="rounded-2xl border border-indigo-200/70 dark:border-indigo-400/20 bg-indigo-50/60 dark:bg-indigo-500/[0.07] p-4 space-y-3" aria-label="Answer">
            <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 whitespace-pre-line"><Cited text={answer.answer} citations={answer.citations} /></p>
            {answer.citations.length > 0 && (
              <ol className="space-y-1.5">
                {answer.citations.map((c) => {
                  const Icon = ICON[c.kind];
                  return (
                    <li key={c.n}>
                      <Link href={c.link} className="flex items-start gap-2 rounded-xl p-2 -mx-1 hover:bg-white/70 dark:hover:bg-white/[0.05] text-sm">
                        <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300 w-4 shrink-0 pt-0.5">{c.n}</span>
                        <Icon className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                        <span className="min-w-0"><span className="font-medium text-zinc-900 dark:text-white">{c.title}</span><span className="block text-xs text-zinc-500 line-clamp-2">{c.excerpt}</span></span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="text-[11px] text-zinc-400 flex items-center gap-1"><Sparkles className="w-3 h-3" />{answer.grounded ? 'From your semester, with its sources.' : 'Your semester doesn’t clearly answer this; check the sources or ask your teacher.'}</p>
          </motion.section>
        )}

        {shown && (
          shown.length === 0 && !searching ? (
            <p className="text-sm text-zinc-500 py-6 text-center">Nothing found{pending ? ' yet' : ''}. Try other words, or include more kinds above.</p>
          ) : (
            <ul className="space-y-2" aria-label="Results">
              {shown.map((r) => {
                const Icon = ICON[r.kind];
                return (
                  <li key={r.id}>
                    <Link href={r.link} className="block rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-3.5 hover:border-indigo-300 transition-colors">
                      <span className="flex items-center gap-2 text-xs text-zinc-500">
                        <Icon className="w-3.5 h-3.5" />{LABEL[r.kind]}{r.day ? ` · ${new Date(`${r.day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                        {r.at !== null && <span className="ml-auto inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300 font-semibold"><PlayCircle className="w-3.5 h-3.5" />{clock(r.at)}</span>}
                      </span>
                      <span className="block mt-1 text-sm font-semibold text-zinc-900 dark:text-white">{r.title}</span>
                      <span className="block mt-0.5 text-sm text-zinc-600 dark:text-zinc-300 line-clamp-3"><Snippet text={r.snippet} /></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        )}
        {!shown && !answer && (
          <p className="text-sm text-zinc-500">Type a few words. Only things you can see are searched: your classes, your documents and your own work.</p>
        )}
      </div>
    </div>
  );
}
