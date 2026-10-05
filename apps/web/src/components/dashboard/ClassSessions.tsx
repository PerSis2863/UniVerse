'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { BookmarkPlus, CheckCircle2, ChevronDown, Clock, Layers, ListChecks, Loader2, NotebookPen, PlayCircle, Sparkles, Trash2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Course board → Class sessions (upgrade 1, AI class companion). Each class call the teacher took
// class notes in becomes a study pack: summary, notes, key moments (with the recording when there
// is one), flashcards students add to their own deck, and a quiz the teacher checks and publishes.

export interface ClassSession {
  id: string; startedAt: string; durationSec: number; status: 'READY' | 'PENDING'; summary: string | null;
  notes: string[]; keyMoments: { t: number; text: string }[]; flashcards: { front: string; back: string }[];
  quiz: { id: string; status: string } | null; recordingMaterialId: string | null;
}

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const minutes = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;

export function ClassSessions({ sessions, canManage, materials, openId, refresh }: {
  sessions: ClassSession[]; canManage: boolean; materials: { id: string; fileUrl: string }[]; openId?: string | null; refresh: () => void;
}) {
  const [open, setOpen] = useState<string | null>(openId ?? sessions[0]?.id ?? null);

  if (!sessions.length) {
    return (
      <div className={cn(card, 'p-8 text-center')}>
        <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center"><NotebookPen className="w-6 h-6" /></div>
        <p className="mt-3 font-semibold text-zinc-900 dark:text-white">No class sessions yet</p>
        <p className="mt-1 text-sm text-zinc-500 max-w-md mx-auto">
          {canManage
            ? 'In a class call, tap the notebook button (Class notes). When you stop, the class gets a study pack here: summary, notes, key moments, flashcards and a quiz for you to check.'
            : 'When your teacher takes class notes in a class call, a study pack appears here: summary, notes, key moments and flashcards.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 stagger">
      {sessions.map((s) => (
        <SessionCard key={s.id} s={s} canManage={canManage} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)}
          recordingUrl={materials.find((m) => m.id === s.recordingMaterialId)?.fileUrl ?? null} refresh={refresh} />
      ))}
    </div>
  );
}

function SessionCard({ s, canManage, open, onToggle, recordingUrl, refresh }: {
  s: ClassSession; canManage: boolean; open: boolean; onToggle: () => void; recordingUrl: string | null; refresh: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'cards' | 'retry' | 'delete'>(null);
  const [flipped, setFlipped] = useState<number | null>(null);

  const addCards = async () => {
    setBusy('cards');
    try {
      const r = await authedJson<{ added: number; already: number }>(`/api/class-sessions/${s.id}/flashcards`, { method: 'POST' });
      toast.success(r.added ? `${r.added} flashcard${r.added === 1 ? '' : 's'} added to your deck` : 'These flashcards are already in your deck', {
        action: { label: 'Review', onClick: () => router.push('/student/tutor') },
      });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const retry = async () => {
    setBusy('retry');
    try {
      await authedJson(`/api/class-sessions/${s.id}/retry`, { method: 'POST' });
      toast.success('Study pack ready. The class has been told.');
      refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this class session?', message: 'Students will no longer see its study pack. A draft quiz made from it stays in Quizzes.', confirmLabel: 'Delete', destructive: true }))) return;
    setBusy('delete');
    try {
      await authedJson(`/api/class-sessions/${s.id}`, { method: 'DELETE' });
      refresh();
    } catch (e) { toast.error((e as Error).message); setBusy(null); }
  };

  return (
    <motion.article layout transition={spring.smooth} className={cn(card, 'overflow-hidden')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left p-4 sm:p-5 flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20"><NotebookPen className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-zinc-900 dark:text-white">{dayOf(s.startedAt)}</p>
          <p className="text-xs text-zinc-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{minutes(s.durationSec)}</span>
            {s.status === 'READY' ? (
              <>
                <span>· {s.notes.length} notes</span>
                <span>· {s.flashcards.length} flashcards</span>
                {recordingUrl && <span className="inline-flex items-center gap-1 text-indigo-500"><PlayCircle className="w-3 h-3" />Recording</span>}
              </>
            ) : <span className="text-amber-600 dark:text-amber-400">· Notes saved, study pack not made yet</span>}
          </p>
          {!open && s.summary && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">{s.summary}</p>}
        </div>
        <ChevronDown className={cn('w-5 h-5 text-zinc-400 shrink-0 transition-transform duration-300', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden">
            <div className="px-4 sm:px-5 pb-5 space-y-5 border-t border-zinc-100 dark:border-white/[0.05] pt-4">
              {s.status === 'PENDING' ? (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-sm text-zinc-700 dark:text-zinc-300">
                  The class notes were saved, but AI wasn’t available when the class ended.
                  {canManage && (
                    <button type="button" onClick={retry} disabled={busy === 'retry'} className="mt-3 btn-primary btn-sm rounded-full inline-flex">
                      {busy === 'retry' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Make study pack
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <section>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Summary</h4>
                    <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{s.summary}</p>
                  </section>

                  {s.notes.length > 0 && (
                    <section>
                      <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Notes</h4>
                      <ul className="space-y-1.5">
                        {s.notes.map((n, i) => (
                          <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300 flex gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />{n}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {s.keyMoments.length > 0 && (
                    <section>
                      <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Key moments</h4>
                      <ol className="space-y-1">
                        {s.keyMoments.map((k, i) => {
                          const inner = (<><span className="font-mono text-xs tabular-nums px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 shrink-0">{clock(k.t)}</span><span className="min-w-0">{k.text}</span></>);
                          return (
                            <li key={i}>
                              {recordingUrl ? (
                                <a href={`${recordingUrl}#t=${k.t}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300 rounded-lg p-1.5 -mx-1.5 hover:bg-indigo-500/[0.06]" title="Watch from here">{inner}</a>
                              ) : <div className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300 p-1.5 -mx-1.5">{inner}</div>}
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  )}

                  {s.flashcards.length > 0 && (
                    <section>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500 inline-flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Flashcards <span className="font-normal normal-case">(tap to flip)</span></h4>
                        {!canManage && (
                          <button type="button" onClick={addCards} disabled={busy === 'cards'} className="btn-primary btn-sm rounded-full inline-flex">
                            {busy === 'cards' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookmarkPlus className="w-3.5 h-3.5" />} Add to my flashcards
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {s.flashcards.slice(0, 6).map((c, i) => (
                          <button key={i} type="button" onClick={() => setFlipped(flipped === i ? null : i)} className="text-left min-w-0 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 p-3 lift" style={{ perspective: 800 }}>
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.p key={flipped === i ? 'back' : 'front'} initial={{ rotateX: -80, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: 80, opacity: 0 }} transition={{ duration: 0.18 }}
                                className={cn('text-sm break-words', flipped === i ? 'text-emerald-700 dark:text-emerald-300' : 'font-medium text-zinc-900 dark:text-white')}>
                                {flipped === i ? c.back : c.front}
                              </motion.p>
                            </AnimatePresence>
                          </button>
                        ))}
                      </div>
                      {s.flashcards.length > 6 && <p className="mt-1.5 text-xs text-zinc-500">+{s.flashcards.length - 6} more in the pack</p>}
                    </section>
                  )}

                  {s.quiz && (
                    <section className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-500/[0.06] border border-indigo-500/15 p-3">
                      <ListChecks className="w-4 h-4 text-indigo-500 shrink-0" />
                      {canManage ? (
                        <>
                          <p className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">
                            {s.quiz.status === 'DRAFT' ? 'A 5-question quiz was drafted from this class. Check the answers, then publish it.' : 'The quiz from this class is published.'}
                          </p>
                          <Link href="/teacher/quizzes" className="btn-secondary btn-sm rounded-full">{s.quiz.status === 'DRAFT' ? 'Review quiz' : 'Open quizzes'}</Link>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">Check what you remember with the quiz from this class.</p>
                          <Link href="/student/quizzes" className="btn-primary btn-sm rounded-full inline-flex"><CheckCircle2 className="w-3.5 h-3.5" /> Take the quiz</Link>
                        </>
                      )}
                    </section>
                  )}
                  <p className="text-[11px] text-zinc-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Made by AI from the class’s live captions. It can miss or mishear words.</p>
                </>
              )}

              {canManage && (
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={remove} disabled={busy === 'delete'} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-rose-500">
                    {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete session
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
