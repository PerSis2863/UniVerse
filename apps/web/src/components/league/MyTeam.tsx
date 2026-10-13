'use client';

import { useState } from 'react';
import { BadgeCheck, Crown, KanbanSquare, LogOut, MessagesSquare, Send, Trophy, Video, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Avatar } from '@/components/ui/Avatar';
import { Field } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { useAuthStore } from '@/store/auth';
import { Progress, day } from './LeagueBits';
import type { LeagueAct, LeagueDetail, LeagueTeamView } from './types';

// Your team in an Impact League challenge (Stage 5 · D14): who's in it, the milestones on its board,
// the project you hand in, whether it shows on the public page, and the judges' feedback at the end.

export function MyTeam({ d, team, act }: { d: LeagueDetail; team: LeagueTeamView; act: LeagueAct }) {
  const me = useAuthStore((s) => s.user?.id);
  const c = d.challenge;
  const open = c.status === 'OPEN';
  const won = c.prizes.filter((p) => p.teamId === team.id);
  const myCredential = team.members.find((m) => m.id === me)?.credential;
  const leave = async () => {
    const last = team.members.length === 1;
    if (!(await confirmDialog({ title: 'Leave your team?', message: last ? 'You’re the last one in it, so the team, its group and its board are deleted.' : 'You can join or start another team while sign-up is open.', confirmLabel: 'Leave team', destructive: true }))) return;
    await act({ action: 'leave' }, 'You left the team');
  };
  const remove = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: `Remove ${name} from the team?`, message: 'They’re told in the app and can join another team while sign-up is open.', confirmLabel: 'Remove', destructive: true }))) return;
    await act({ action: 'remove-member', userId: id }, `${name} was removed`);
  };

  return (
    <section aria-labelledby="my-team-title" className="panel p-5 space-y-4 border-indigo-500/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Your team</p>
          <h2 id="my-team-title" className="text-lg font-bold text-zinc-900 dark:text-white">{team.name}</h2>
        </div>
        <span className={team.status === 'SUBMITTED' ? 'rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'rounded-full px-2 py-0.5 text-xs font-semibold bg-zinc-500/10 text-zinc-700 dark:text-zinc-300'}>
          {team.status === 'SUBMITTED' ? `Handed in ${day(team.submittedAt)}` : 'Working on it'}
        </span>
      </div>

      <ul className="space-y-2" aria-label="Team members">
        {team.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <Avatar name={m.name} src={m.avatar} size={32} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-medium text-zinc-900 dark:text-white">{m.name}{m.id === me && ' (you)'}{m.captain && <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-label="Captain" />}</span>
              {m.campus && <span className="block text-xs text-zinc-600 dark:text-zinc-400">{m.campus}</span>}
            </span>
            {open && d.me.captain && m.id !== me && <button type="button" onClick={() => void remove(m.id, m.name)} aria-label={`Remove ${m.name}`} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><X className="w-4 h-4" /></button>}
          </li>
        ))}
      </ul>
      {team.mentor ? <p className="text-sm text-zinc-700 dark:text-zinc-300">Mentor: <span className="font-semibold">{team.mentor.name}</span> (in your group)</p>
        : <p className="text-sm text-zinc-600 dark:text-zinc-400">No mentor yet. The organizers match mentors to teams.</p>}

      <div className="space-y-2">
        <Progress done={team.progress.done} total={team.progress.total} label="Milestones done" />
        <div className="flex flex-wrap gap-2">
          {team.boardId && <Link href={`/tasks/${team.boardId}`} className="btn-secondary btn-sm"><KanbanSquare className="w-4 h-4" /> Milestones board</Link>}
          {team.groupId && <Link href={`/student/groups?group=${team.groupId}`} className="btn-secondary btn-sm"><MessagesSquare className="w-4 h-4" /> Team group</Link>}
          {team.groupId && <Link href={`/call/g_${team.groupId}?kind=video`} className="btn-secondary btn-sm"><Video className="w-4 h-4" /> Team call</Link>}
        </div>
      </div>

      {open ? <ProjectForm key={team.id} team={team} act={act} /> : team.project && (
        <div className="rounded-xl bg-zinc-100 dark:bg-white/[0.05] p-3 space-y-1">
          <p className="font-semibold text-zinc-900 dark:text-white">{team.project.title || 'No project title'}</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line">{team.project.pitch}</p>
          {team.project.link && <a href={team.project.link} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-700 dark:text-indigo-300 underline break-all">{team.project.link}</a>}
        </div>
      )}

      {open && team.status !== 'SUBMITTED' && (
        <div className="space-y-1">
          <button type="button" disabled={!!d.me.submitProblem} onClick={() => void act({ action: 'submit' }, 'Project handed in')} className="btn-primary"><Send className="w-4 h-4" /> Hand in our project</button>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{d.me.submitProblem ?? 'Your mentor and teammates are told. You can still improve it until judging starts.'}</p>
        </div>
      )}
      {open && team.status === 'SUBMITTED' && <p className="text-sm text-zinc-700 dark:text-zinc-300">Handed in. You can still improve it until judging starts.</p>}

      {c.isPublic && (
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-800 dark:text-zinc-200">Show our project on the public page<span className="block text-xs text-zinc-600 dark:text-zinc-400">Team name, universities and project only, never your names.</span></span>
          <Switch checked={team.showcase !== false} onChange={(v) => void act({ action: 'team', showcase: v }, v ? 'Your project can appear on the public page' : 'Your project is off the public page')} label="Show our project on the public page" />
        </label>
      )}

      {won.length > 0 && c.status === 'DONE' && (
        <div className="rounded-xl bg-amber-500/10 p-3 space-y-1">
          {won.map((p) => <p key={p.id} className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100"><Trophy className="w-4 h-4" aria-hidden /> You won “{p.title}”{p.sponsor ? ` · from ${p.sponsor}` : ''}</p>)}
        </div>
      )}
      {d.feedback && <Feedback f={d.feedback} />}
      {myCredential && <p className="text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2"><BadgeCheck className="w-4 h-4" aria-hidden /> Your finisher credential is issued. <Link href="/student/credentials" className="underline">See it</Link></p>}

      {open && <button type="button" onClick={() => void leave()} className="btn-ghost btn-sm text-rose-700 dark:text-rose-400"><LogOut className="w-4 h-4" /> Leave team</button>}
    </section>
  );
}

function ProjectForm({ team, act }: { team: LeagueTeamView; act: LeagueAct }) {
  const [name, setName] = useState(team.name);
  const [lookingFor, setLookingFor] = useState(team.lookingFor);
  const [title, setTitle] = useState(team.project?.title ?? '');
  const [pitch, setPitch] = useState(team.project?.pitch ?? '');
  const [link, setLink] = useState(team.project?.link ?? '');
  const [busy, setBusy] = useState(false);
  const changed = name !== team.name || lookingFor !== team.lookingFor || title !== (team.project?.title ?? '') || pitch !== (team.project?.pitch ?? '') || link !== (team.project?.link ?? '');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await act({ action: 'team', name, lookingFor, projectTitle: title, pitch, link }, 'Saved');
    setBusy(false);
  };
  return (
    <form onSubmit={save} className="space-y-3" aria-label="Your project">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Team name">{(p) => <input {...p} className="input" maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        {team.seats > 0 && <Field label="Looking for (optional)" hint="Shown to students looking for a team.">{(p) => <input {...p} className="input" maxLength={200} value={lookingFor} onChange={(e) => setLookingFor(e.target.value)} placeholder="Someone who likes data" />}</Field>}
      </div>
      <Field label="Project title">{(p) => <input {...p} className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A map of every safe tap near campus" />}</Field>
      <Field label="What you made and why" count={pitch.length} max={3000} hint="Who it helps, what you learned from them, what you built, what’s next.">{(p) => <textarea {...p} className="input min-h-[7rem]" maxLength={3000} value={pitch} onChange={(e) => setPitch(e.target.value)} />}</Field>
      <Field label="Link (optional)" hint="A demo, video or document, starting with https://">{(p) => <input {...p} type="url" inputMode="url" className="input" maxLength={300} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />}</Field>
      <button type="submit" disabled={busy || !changed || name.trim().length < 2} className="btn-secondary btn-sm">{busy ? 'Saving…' : 'Save'}</button>
    </form>
  );
}

function Feedback({ f }: { f: NonNullable<LeagueDetail['feedback']> }) {
  if (!f.judges) return <p className="text-sm text-zinc-600 dark:text-zinc-400">No judge scored your project.</p>;
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-zinc-900 dark:text-white">Judges’ feedback <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400">({f.judges} {f.judges === 1 ? 'judge' : 'judges'})</span></h3>
      <ul className="space-y-1.5">
        {f.criteria.map((c) => (
          <li key={c.id} className="text-sm">
            <span className="flex justify-between gap-2 text-zinc-800 dark:text-zinc-200"><span>{c.name}</span><span className="tabular-nums">{c.average ?? '–'} / {c.max}</span></span>
            <Progress done={Math.round((c.average ?? 0) * 10)} total={c.max * 10} label={`${c.name}: ${c.average ?? 0} out of ${c.max}`} count={false} />
          </li>
        ))}
      </ul>
      {f.comments.map((t, i) => <p key={i} className="text-sm rounded-xl bg-zinc-100 dark:bg-white/[0.05] px-3 py-2 text-zinc-800 dark:text-zinc-200">“{t}”</p>)}
    </div>
  );
}
