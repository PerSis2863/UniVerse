'use client';

import { useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ChevronDown, Crown, Eye, EyeOff, Gavel, KanbanSquare, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { confirmDialog } from '@/components/ui/Dialogs';
import { fadeUp, list, spring } from '@/lib/motion';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { Progress, day } from './LeagueBits';
import type { LeagueAct, LeagueDetail, LeagueTeamView } from './types';

// The teams of an Impact League challenge (Stage 5 · D14): start or join one (students), volunteer to
// mentor one (mentors), score handed-in projects (judges), match mentors and moderate (organizers).

export function TeamList({ d, act }: { d: LeagueDetail; act: LeagueAct }) {
  const [starting, setStarting] = useState(false);
  const c = d.challenge;
  return (
    <div className="space-y-4">
      {d.me.canJoin && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 max-w-prose">Join a team with a free seat, or start your own: {c.teamMin === c.teamMax ? `${c.teamMin} people` : `${c.teamMin} to ${c.teamMax} people`}{c.mixCampuses ? ', from at least two universities' : ', from any university in the network'}. Other students see your first name and university.</p>
            {!starting && <button type="button" onClick={() => setStarting(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Start a team</button>}
          </div>
          {d.me.minor && <p className="text-xs text-zinc-600 dark:text-zinc-400">Students under 18 team up within their own university.</p>}
          <AnimatePresence initial={false}>{starting && <StartTeam onClose={() => setStarting(false)} act={act} />}</AnimatePresence>
        </div>
      )}
      {d.teams.length === 0 ? (
        <EmptyState icon={Users} title="No teams yet" hint={c.status === 'OPEN' ? 'Be the first: start a team and others can join it.' : 'Teams form once the challenge opens.'} />
      ) : (
        <motion.ul variants={list} initial="hidden" animate="show" className="grid md:grid-cols-2 gap-3" aria-label="Teams">
          {d.teams.map((t) => <motion.li key={t.id} variants={fadeUp}><TeamCard t={t} d={d} act={act} /></motion.li>)}
        </motion.ul>
      )}
    </div>
  );
}

function StartTeam({ onClose, act }: { onClose: () => void; act: LeagueAct }) {
  const [name, setName] = useState('');
  const [lookingFor, setLookingFor] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await act({ action: 'create-team', name, lookingFor }, 'Team started: your group and milestones board are ready');
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} onSubmit={save} className="overflow-hidden" aria-label="Start a team">
      <div className="panel p-4 space-y-3">
        <Field label="Team name">{(p) => <input {...p} className="input" maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Drop by Drop" />}</Field>
        <Field label="Looking for (optional)" hint="Who you’d like to join you: skills, or a university.">{(p) => <input {...p} className="input" maxLength={200} value={lookingFor} onChange={(e) => setLookingFor(e.target.value)} placeholder="Someone who likes building things with sensors" />}</Field>
        <div className="flex gap-2">
          <button type="submit" disabled={busy || name.trim().length < 2} className="btn-primary btn-sm">{busy ? 'Starting…' : 'Start the team'}</button>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm">Cancel</button>
        </div>
      </div>
    </motion.form>
  );
}

function TeamCard({ t, d, act }: { t: LeagueTeamView; d: LeagueDetail; act: LeagueAct }) {
  const me = useAuthStore((s) => s.user?.id);
  const [scoring, setScoring] = useState(false);
  const [more, setMore] = useState(false);
  const c = d.challenge;
  const mentors = d.people.filter((p) => p.role === 'MENTOR');
  const canScore = d.me.judge && c.status === 'JUDGING' && t.status === 'SUBMITTED' && !t.mentoring;
  const removeTeam = async () => {
    if (!(await confirmDialog({ title: `Remove ${t.name}?`, message: 'The team, its group and its board are deleted. Its members are told.', confirmLabel: 'Remove team', destructive: true }))) return;
    await act({ action: 'remove-team', teamId: t.id }, 'Team removed');
  };
  return (
    <article aria-label={t.name} className={cn('panel p-4 space-y-3 h-full', t.mine && 'border-indigo-500/40')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="font-semibold text-zinc-900 dark:text-white">{t.name}</h3>
            {t.mine && <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Your team</span>}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {t.members.length} {t.members.length === 1 ? 'person' : 'people'}{t.campuses > 1 ? ` · ${t.campuses} universities` : ''} · {t.seats ? `${t.seats} ${t.seats === 1 ? 'seat' : 'seats'} free` : 'full'}
            {t.hidden && ' · hidden from the public page'}
          </p>
        </div>
        {t.status === 'SUBMITTED' && <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 shrink-0">Handed in {day(t.submittedAt)}</span>}
      </div>
      {t.lookingFor && t.seats > 0 && c.status === 'OPEN' && <p className="text-sm text-zinc-700 dark:text-zinc-300"><span className="font-semibold">Looking for:</span> {t.lookingFor}</p>}
      <ul className="flex flex-wrap gap-1.5" aria-label={`Members of ${t.name}`}>
        {t.members.map((m) => (
          <li key={m.id} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] px-2 py-0.5 text-xs text-zinc-800 dark:text-zinc-200">
            {m.captain && <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" aria-label="Captain" />}{m.name}{m.campus && <span className="text-zinc-600 dark:text-zinc-400">{' · '}{m.campus}</span>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{t.mentor ? `Mentor: ${t.mentor.name}` : 'No mentor yet'}{typeof t.judged === 'number' && t.status === 'SUBMITTED' ? ` · scored by ${t.judged} ${t.judged === 1 ? 'judge' : 'judges'}` : ''}</p>
      <Progress done={t.progress.done} total={t.progress.total} label={`${t.name}: milestones done`} />

      {t.project && (t.project.title || t.project.pitch) && (
        <div className="space-y-1">
          <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="w-full flex items-center justify-between gap-2 text-left">
            <span className="text-sm font-semibold text-zinc-900 dark:text-white">{t.project.title || 'Project (no title yet)'}</span>
            <motion.span animate={{ rotate: more ? 180 : 0 }} transition={spring.snappy} className="text-zinc-500 shrink-0"><ChevronDown className="w-4 h-4" aria-hidden /></motion.span>
          </button>
          <p className={cn('text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line', !more && 'line-clamp-2')}>{t.project.pitch}</p>
          {more && t.project.link && <a href={t.project.link} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-700 dark:text-indigo-300 underline break-all">{t.project.link}</a>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {d.me.canJoin && t.seats > 0 && <button type="button" onClick={() => void act({ action: 'join', teamId: t.id }, `You joined ${t.name}`)} className="btn-primary btn-sm"><UserPlus className="w-4 h-4" /> Join</button>}
        {d.me.mentor && !t.mentor && <button type="button" onClick={() => void act({ action: 'mentor', teamId: t.id, mentorId: me }, `You’re mentoring ${t.name}`)} className="btn-secondary btn-sm">Mentor this team</button>}
        {t.mentoring && !d.me.organizer && <button type="button" onClick={() => void act({ action: 'mentor', teamId: t.id, mentorId: null }, 'You stepped down as mentor')} className="btn-ghost btn-sm">Stop mentoring</button>}
        {(t.mentoring || d.me.organizer) && t.boardId && !t.mine && <Link href={`/tasks/${t.boardId}`} className="btn-secondary btn-sm"><KanbanSquare className="w-4 h-4" /> Board</Link>}
        {canScore && <button type="button" onClick={() => setScoring(!scoring)} aria-expanded={scoring} className="btn-primary btn-sm"><Gavel className="w-4 h-4" /> {t.myScore ? `Your score: ${t.myScore.total}` : 'Score'}</button>}
      </div>
      {d.me.judge && c.status === 'JUDGING' && t.mentoring && t.status === 'SUBMITTED' && <p className="text-xs text-zinc-600 dark:text-zinc-400">You mentored this team, so the other judges score it.</p>}
      <AnimatePresence initial={false}>{scoring && canScore && <ScoreForm t={t} d={d} act={act} onDone={() => setScoring(false)} />}</AnimatePresence>

      {d.me.organizer && (
        <div className="pt-2 border-t border-zinc-200 dark:border-white/10 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`mentor-${t.id}`}>Mentor for {t.name}</label>
          <select id={`mentor-${t.id}`} className="input !py-1.5 !w-auto text-sm" value={t.mentor?.id ?? ''} onChange={(e) => void act({ action: 'mentor', teamId: t.id, mentorId: e.target.value || null }, e.target.value ? 'Mentor matched' : 'Mentor taken off')}>
            <option value="">No mentor</option>
            {mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {c.isPublic && <button type="button" onClick={() => void act({ action: 'hide', teamId: t.id, hidden: !t.hidden }, t.hidden ? 'Shown on the public page' : 'Hidden from the public page')} className="btn-ghost btn-sm">{t.hidden ? <><Eye className="w-4 h-4" /> Show publicly</> : <><EyeOff className="w-4 h-4" /> Hide publicly</>}</button>}
          {c.status !== 'DONE' && <button type="button" onClick={() => void removeTeam()} aria-label={`Remove ${t.name}`} className="btn-ghost btn-sm text-rose-700 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Remove</button>}
        </div>
      )}
    </article>
  );
}

function ScoreForm({ t, d, act, onDone }: { t: LeagueTeamView; d: LeagueDetail; act: LeagueAct; onDone: () => void }) {
  const rubric = d.challenge.rubric;
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(rubric.map((r) => [r.id, String(t.myScore?.scores.find((s) => s.id === r.id)?.score ?? '')])));
  const [comment, setComment] = useState(t.myScore?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const complete = rubric.every((r) => scores[r.id] !== '' && Number(scores[r.id]) >= 0 && Number(scores[r.id]) <= r.max);
  const total = rubric.reduce((n, r) => n + (Number(scores[r.id]) || 0), 0);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await act({ action: 'score', teamId: t.id, scores: rubric.map((r) => ({ id: r.id, score: Number(scores[r.id]) })), comment }, `Scored ${t.name}: ${total}`);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} onSubmit={save} className="overflow-hidden" aria-label={`Score ${t.name}`}>
      <div className="rounded-xl bg-zinc-100 dark:bg-white/[0.05] p-3 space-y-2">
        {rubric.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <label htmlFor={`score-${t.id}-${r.id}`} className="flex-1 min-w-0 text-sm text-zinc-800 dark:text-zinc-200">
              {r.name} <span className="text-zinc-600 dark:text-zinc-400">(out of {r.max})</span>
              {r.desc && <span className="block text-xs text-zinc-600 dark:text-zinc-400">{r.desc}</span>}
            </label>
            <input id={`score-${t.id}-${r.id}`} type="number" inputMode="numeric" min={0} max={r.max} step={1} required className="input !w-20 text-center" value={scores[r.id]} onChange={(e) => setScores((s) => ({ ...s, [r.id]: e.target.value }))} />
          </div>
        ))}
        <Field label="Comment for the team (optional)" hint="They see it without your name once results are out.">{(p) => <textarea {...p} className="input min-h-[4rem]" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">Total {total} / {rubric.reduce((n, r) => n + r.max, 0)}</span>
          <button type="submit" disabled={busy || !complete} className="btn-primary btn-sm">{busy ? 'Saving…' : t.myScore ? 'Update score' : 'Save score'}</button>
        </div>
      </div>
    </motion.form>
  );
}
