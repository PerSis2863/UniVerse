'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { CheckCircle2, Flag, Gamepad2, Loader2, Play, SkipForward, Trophy, Users } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, spring } from '@/lib/motion';
import { useLiveInterval } from '@/lib/realtime-client';
import { useTick } from '@/lib/use-now';
import { cn } from '@/lib/utils';

// Live quiz game (Stage 5 · B4.5, src/server/live-game.ts): the teacher's class screen and the
// students' phones. Both refresh through live updates; a slower re-check runs only during a game.

interface State {
  game: { id: string; courseId: string; course: string; quiz: string; status: 'LOBBY' | 'QUESTION' | 'REVEAL' | 'DONE'; current: number; total: number; seconds: number; endsAt: string | null; players: number; answered: number } | null;
  host?: boolean;
  question?: { id: string; question: string; options: string[]; type: string } | null;
  reveal?: { right: string; counts: number[] } | null;
  names?: string[];
  top?: { name: string; score: number; rank: number; streak: number }[];
  me?: { joined: boolean; score: number; streak: number; rank: number | null; answered: boolean; correct?: boolean; points?: number } | null;
}

const TILE = ['bg-rose-600', 'bg-sky-700', 'bg-amber-700', 'bg-emerald-700', 'bg-violet-700', 'bg-zinc-700'];
const LETTER = ['A', 'B', 'C', 'D', 'E', 'F'];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

function useGame(key: string) {
  const during = useLiveInterval(3000, 15_000);
  const swr = useSWR<State>(key, authedJson, { refreshInterval: (d) => (d?.game && d.game.status !== 'DONE' ? during : 0) });
  // After an action, the new state straight away (fetched and put in place, not left to a re-check).
  const reload = async () => { await swr.mutate(await authedJson<State>(key), { revalidate: false }); };
  return { ...swr, reload };
}

function Countdown({ endsAt }: { endsAt: string | null }) {
  const now = useTick(!!endsAt);
  if (!endsAt) return null;
  const left = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000));
  return <span className={cn('tabular-nums font-bold text-2xl', left <= 5 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-white')} aria-label={`${left} seconds left`}>{left}</span>;
}

function Board({ top, me }: { top: NonNullable<State['top']>; me?: string }) {
  return (
    <ol className="space-y-1.5" aria-label="Leaderboard">
      {top.map((p) => (
        <li key={p.name} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', p.name === me ? 'bg-indigo-500/10 ring-1 ring-indigo-500/40' : 'bg-zinc-100 dark:bg-white/[0.05]')}>
          <span className="w-7 font-bold tabular-nums text-zinc-700 dark:text-zinc-300">{ordinal(p.rank)}</span>
          <span className="flex-1 min-w-0 truncate font-medium text-zinc-900 dark:text-white">{p.name}</span>
          {p.streak >= 2 && <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">{p.streak} in a row</span>}
          <span className="font-bold tabular-nums text-zinc-900 dark:text-white">{p.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

/** The teacher's panel on Live class: start a game, then run it on the class screen. */
export function LiveGameHost({ courseId }: { courseId: string }) {
  const { data, reload } = useGame(`/api/live/game?courseId=${encodeURIComponent(courseId)}`);
  const { data: quizzes } = useSWR<{ id: string; title: string; courseId: string; status: string }[]>('/api/core/quizzes/teacher/my-quizzes', authedJson);
  const [quizId, setQuizId] = useState('');
  const [seconds, setSeconds] = useState('20');
  const [busy, setBusy] = useState(false);
  const mine = (quizzes ?? []).filter((q) => q.courseId === courseId && q.status !== 'DRAFT');
  const g = data?.game ?? null;
  const act = async (url: string, body: object, done?: string) => {
    setBusy(true);
    try { await authedJson(url, { method: 'POST', body: JSON.stringify(body) }); await reload(); if (done) toast.success(done); }
    catch (e) { toast.error(errorMessage(e, 'That didn’t work. Try again.')); }
    finally { setBusy(false); }
  };
  const start = () => void act('/api/live/game', { courseId, quizId: quizId || mine[0]?.id, seconds: Number(seconds) }, 'The game is open: students can join');
  const step = (action: 'next' | 'reveal' | 'end') => void act(`/api/live/game/${g!.id}`, { action });

  return (
    <section className="panel p-5 space-y-4" aria-labelledby="game-title">
      <h2 id="game-title" className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Gamepad2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Quiz game</h2>
      {!g || g.status === 'DONE' ? <>
        {g?.status === 'DONE' && data?.top?.length ? (
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-3">
            <p className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" /> {data.top[0].name} wins “{g.quiz}”</p>
            <Board top={data.top} />
            <p className="text-xs text-zinc-600 dark:text-zinc-400">Everyone’s answers are saved as practice, so they count towards their mastery.</p>
          </motion.div>
        ) : <p className="text-sm text-zinc-600 dark:text-zinc-400">Play one of the course’s quizzes live: students answer on their phones, quicker right answers score more, and there’s a leaderboard after each question. One-answer and true / false questions are played.</p>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 min-w-48">Quiz
            <select value={quizId || mine[0]?.id || ''} onChange={(e) => setQuizId(e.target.value)} className="input mt-1">
              {!mine.length && <option value="">{quizzes ? 'No published quizzes yet' : 'Loading…'}</option>}
              {mine.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
            </select>
          </label>
          <label className="text-sm text-zinc-700 dark:text-zinc-300">Seconds a question
            <select value={seconds} onChange={(e) => setSeconds(e.target.value)} className="input mt-1">{['10', '20', '30', '60'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
          <button type="button" onClick={start} disabled={busy || !mine.length} className="btn-primary">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} {g?.status === 'DONE' ? 'New game' : 'Start a game'}</button>
        </div>
      </> : (
        <motion.div key={`${g.status}-${g.current}`} variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold">{g.quiz}{g.current >= 0 ? ` · question ${g.current + 1} of ${g.total}` : ''}</span>
            <span className="inline-flex items-center gap-1.5"><Users className="w-4 h-4" /> {g.players} playing{g.status === 'QUESTION' ? ` · ${g.answered} answered` : ''}</span>
          </div>
          {g.status === 'LOBBY' && <>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">Join the game</p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">Students: open <b>Live class</b> on your phone and tap <b>Join the game</b>, or join the class with its code.</p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Players">{(data?.names ?? []).map((n) => <motion.li key={n} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.snappy} className="badge badge-blue">{n}</motion.li>)}</ul>
          </>}
          {data?.question && <>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">{data.question.question}</p>
              {g.status === 'QUESTION' && <Countdown endsAt={g.endsAt} />}
            </div>
            <ul className="grid sm:grid-cols-2 gap-2">
              {data.question.options.map((o, i) => {
                const right = data.reveal?.right === o;
                const n = data.reveal?.counts[i] ?? 0;
                return (
                  // Once revealed, the wrong answers turn grey (fading them made the text too faint to read).
                  <li key={o} className={cn('rounded-xl px-4 py-3 text-white font-semibold flex items-center gap-3', data.reveal && !right ? 'bg-zinc-600' : TILE[i % TILE.length])}>
                    <span className="w-7 h-7 rounded-lg bg-black/25 flex items-center justify-center shrink-0">{LETTER[i]}</span>
                    <span className="flex-1 min-w-0 break-words">{o}</span>
                    {data.reveal && <span className="tabular-nums">{n}</span>}
                    {right && <CheckCircle2 className="w-5 h-5" aria-label="Right answer" />}
                  </li>
                );
              })}
            </ul>
          </>}
          {g.status === 'REVEAL' && !!data?.top?.length && <Board top={data.top} />}
          <div className="flex flex-wrap gap-2">
            {g.status === 'QUESTION' && <button type="button" onClick={() => step('reveal')} disabled={busy} className="btn-primary"><CheckCircle2 className="w-4 h-4" /> Show the answer</button>}
            {(g.status === 'LOBBY' || g.status === 'REVEAL') && (g.current + 1 < g.total
              ? <button type="button" onClick={() => step('next')} disabled={busy} className="btn-primary"><SkipForward className="w-4 h-4" /> {g.status === 'LOBBY' ? 'Start the first question' : 'Next question'}</button>
              : <button type="button" onClick={() => step('end')} disabled={busy} className="btn-primary"><Trophy className="w-4 h-4" /> See the winners</button>)}
            <button type="button" onClick={() => step('end')} disabled={busy} className="btn-ghost"><Flag className="w-4 h-4" /> End the game</button>
          </div>
        </motion.div>
      )}
    </section>
  );
}

/** A student's phone during a game (on Live class); nothing when there's no game. */
export function LiveGamePlayer({ myName }: { myName?: string }) {
  const { data, reload } = useGame('/api/live/game');
  const [busy, setBusy] = useState(false);
  const g = data?.game ?? null;
  if (!g) return null;
  const me = data?.me;
  const send = async (body: object) => {
    setBusy(true);
    try { await authedJson(`/api/live/game/${g.id}`, { method: 'POST', body: JSON.stringify(body) }); await reload(); }
    catch (e) { toast.error(errorMessage(e, 'That didn’t go through.')); await reload().catch(() => {}); }
    finally { setBusy(false); }
  };
  return (
    <section className="panel p-5 space-y-4 ring-2 ring-indigo-500/30" aria-labelledby="play-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="play-title" className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Gamepad2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Quiz game · {g.course}</h2>
        {me?.joined && <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-white">{me.score.toLocaleString()} pts</span>}
      </div>
      {!me?.joined ? (
        g.status === 'DONE' ? <p className="text-sm text-zinc-700 dark:text-zinc-300">The game “{g.quiz}” has ended.</p> : <>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">Your teacher is playing “{g.quiz}”.</p>
          <button type="button" onClick={() => void send({ action: 'join' })} disabled={busy} className="btn-primary w-full justify-center">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Join the game</button>
        </>
      ) : (
        <motion.div key={`${g.status}-${g.current}`} variants={fadeUp} initial="hidden" animate="show" className="space-y-3">
          {g.status === 'LOBBY' && <p className="text-lg font-semibold text-zinc-900 dark:text-white">You’re in! Waiting for your teacher to start.</p>}
          {g.status === 'QUESTION' && data?.question && (me.answered ? (
            <p className="text-lg font-semibold text-zinc-900 dark:text-white">Answer locked in. Waiting for the others…</p>
          ) : <>
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-semibold text-zinc-900 dark:text-white">{data.question.question}</p>
              <Countdown endsAt={g.endsAt} />
            </div>
            <div role="group" aria-label="Your answer" className="grid grid-cols-2 gap-2">
              {data.question.options.map((o, i) => (
                <button key={o} type="button" disabled={busy} onClick={() => void send({ action: 'answer', questionId: data.question!.id, answer: o })} className={cn('min-h-20 rounded-2xl px-3 py-3 text-white font-semibold text-left flex items-start gap-2 active:scale-[0.98] transition-transform', TILE[i % TILE.length])}>
                  <span className="w-6 h-6 rounded-md bg-black/25 flex items-center justify-center shrink-0 text-sm">{LETTER[i]}</span><span className="break-words">{o}</span>
                </button>
              ))}
            </div>
          </>)}
          {(g.status === 'REVEAL' || g.status === 'DONE') && <>
            {g.status === 'REVEAL' && <p className={cn('text-xl font-bold', me.correct ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-900 dark:text-white')}>{me.correct ? `Right! +${me.points?.toLocaleString()}` : me.answered ? 'Not this time.' : 'No answer this time.'}</p>}
            {g.status === 'REVEAL' && data?.reveal && !me.correct && <p className="text-sm text-zinc-700 dark:text-zinc-300">The answer: <b>{data.reveal.right}</b></p>}
            {g.status === 'DONE' && <p className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" /> Game over</p>}
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{me.rank ? `You’re ${ordinal(me.rank)} of ${g.players}` : ''}{me.streak >= 2 ? ` · ${me.streak} right in a row` : ''}</p>
            {!!data?.top?.length && <Board top={data.top} me={myName} />}
            {g.status === 'DONE' && <p className="text-xs text-zinc-600 dark:text-zinc-400">Your answers are saved as practice for your mastery.</p>}
          </>}
        </motion.div>
      )}
    </section>
  );
}
