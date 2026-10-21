'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { BadgeCheck, Copy, Gavel, Plus, Rocket, Trash2, Trophy, Undo2, UserPlus, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Field } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { LEAGUE_ROLES, MAX_MILESTONES, MAX_PRIZES, ROLE_LABEL, SDGS, TEAM_SIZE, type LeagueRole, type Milestone, type Prize } from '@/lib/impact-league';
import type { Criterion } from '@/lib/oral';
import { cn } from '@/lib/utils';
import type { LeagueAct, LeagueDetail } from './types';

// Running an Impact League challenge (Stage 5 · D14), for its organizers: the next step (open it,
// start judging, finish), the ranking and prizes, finishers' credentials, and every setting.

const STEPS = [
  { status: 'DRAFT', label: 'Draft' },
  { status: 'OPEN', label: 'Teams work' },
  { status: 'JUDGING', label: 'Judging' },
  { status: 'DONE', label: 'Results' },
] as const;

export function RunPanel({ d, act, onDeleted }: { d: LeagueDetail; act: LeagueAct; onDeleted: () => void }) {
  const c = d.challenge;
  const at = STEPS.findIndex((s) => s.status === c.status);
  const step = async (action: string, title: string, message: string, confirmLabel: string, ok: string) => {
    if (!(await confirmDialog({ title, message, confirmLabel }))) return;
    await act({ action }, ok);
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this challenge?', message: 'Its settings, people and prizes are deleted. This can’t be undone.', confirmLabel: 'Delete', destructive: true }))) return;
    try { await authedJson(`/api/impact-league/${c.id}`, { method: 'DELETE' }); toast.success('Challenge deleted'); onDeleted(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t delete it.')); }
  };
  return (
    <div className="space-y-4">
      <section aria-labelledby="run-title" className="panel p-5 space-y-4">
        <h2 id="run-title" className="font-semibold text-zinc-900 dark:text-white">Where the challenge is</h2>
        <ol className="grid grid-cols-4 gap-1" aria-label="Stages">
          {STEPS.map((s, i) => (
            <li key={s.status} aria-current={i === at ? 'step' : undefined} className={cn('rounded-lg px-1.5 py-2 text-center text-xs font-semibold', i === at ? 'bg-indigo-600 text-white' : i < at ? 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-200' : 'bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-400')}>{s.label}</li>
          ))}
        </ol>
        {c.status === 'DRAFT' && (
          <div className="space-y-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">Check the brief, milestones, rubric and prizes below, add mentors and judges, then open it. Students across the network can then form teams.</p>
            <button type="button" onClick={() => void step('publish', 'Open the challenge?', 'Students can see it and form teams. Mentors, judges and sponsors you added are told.', 'Open for teams', 'The challenge is open')} className="btn-primary"><Rocket className="w-4 h-4" /> Open for teams</button>
          </div>
        )}
        {c.status === 'OPEN' && (
          <div className="space-y-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{d.judging?.submitted ?? 0} of {d.teams.length} {d.teams.length === 1 ? 'team has' : 'teams have'} handed in. When you start judging, teams and projects are fixed and judges are asked to score.</p>
            <button type="button" disabled={!d.judging?.submitted} onClick={() => void step('judging', 'Start judging?', 'Teams can no longer change their project. Judges are told to score.', 'Start judging', 'Judging has started')} className="btn-primary"><Gavel className="w-4 h-4" /> Start judging</button>
            {!d.judging?.submitted && <p className="text-xs text-zinc-600 dark:text-zinc-400">Judging can start once a team has handed in a project.</p>}
          </div>
        )}
        {c.status === 'JUDGING' && (
          <div className="space-y-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{d.judging?.judges ?? 0} {d.judging?.judges === 1 ? 'judge' : 'judges'} · {d.judging?.submitted ?? 0} projects. Give the prizes below, then finish: every finisher hears the results.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void step('finish', 'Finish and share the results?', 'Teams see the prizes and their judges’ feedback. You can then issue credentials.', 'Finish and share results', 'Results are out')} className="btn-primary"><Trophy className="w-4 h-4" /> Finish and share results</button>
              <button type="button" onClick={() => void step('reopen', 'Back to teams working?', 'Teams can change their projects again; scores so far are kept.', 'Back to teams working', 'Open again')} className="btn-ghost"><Undo2 className="w-4 h-4" /> Back to teams working</button>
            </div>
          </div>
        )}
        {c.status === 'DONE' && <Credentials d={d} />}
        {(c.status === 'DRAFT' || d.teams.length === 0) && <button type="button" onClick={() => void remove()} className="btn-ghost btn-sm text-rose-700 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Delete challenge</button>}
      </section>
      {(c.status === 'JUDGING' || c.status === 'DONE') && <Results d={d} act={act} />}
      <Settings key={c.updatedAt} d={d} />
    </div>
  );
}

function Results({ d, act }: { d: LeagueDetail; act: LeagueAct }) {
  const c = d.challenge;
  const submitted = d.teams.filter((t) => t.status === 'SUBMITTED');
  return (
    <section aria-labelledby="results-title" className="panel p-5 space-y-4">
      <h2 id="results-title" className="font-semibold text-zinc-900 dark:text-white">Ranking and prizes</h2>
      {d.ranking.length === 0 ? <p className="text-sm text-zinc-600 dark:text-zinc-400">No team handed in a project.</p> : (
        <ol className="space-y-1.5" aria-label="Ranking by average score">
          {d.ranking.map((r) => (
            <li key={r.teamId} className="flex items-center gap-3 text-sm">
              <span className="w-7 text-center font-bold tabular-nums text-zinc-900 dark:text-white">{r.rank ?? '–'}</span>
              <span className="flex-1 min-w-0 truncate text-zinc-800 dark:text-zinc-200">{r.name}</span>
              <span className="tabular-nums text-zinc-600 dark:text-zinc-400">{r.average ?? 'not scored'}{r.judges ? ` · ${r.judges} ${r.judges === 1 ? 'judge' : 'judges'}` : ''}</span>
            </li>
          ))}
        </ol>
      )}
      {c.prizes.length === 0 ? <p className="text-sm text-zinc-600 dark:text-zinc-400">No prizes. Add them in the settings below.</p> : (
        <ul className="space-y-2" aria-label="Prizes">
          {c.prizes.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <label htmlFor={`award-${p.id}`} className="flex-1 min-w-[10rem] text-sm text-zinc-800 dark:text-zinc-200"><Trophy className="inline w-4 h-4 me-1 text-amber-600 dark:text-amber-400" aria-hidden />{p.title}{p.sponsor && <span className="text-zinc-600 dark:text-zinc-400"> · {p.sponsor}</span>}</label>
              <select id={`award-${p.id}`} className="input !w-auto !py-1.5 text-sm" value={p.teamId ?? ''} onChange={(e) => void act({ action: 'award', prizeId: p.id, teamId: e.target.value || null }, e.target.value ? 'Prize given' : 'Prize taken back')}>
                <option value="">Not given</option>
                {submitted.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Issues finishers' credentials 20 at a time until none are left. */
function Credentials({ d }: { d: LeagueDetail }) {
  const c = d.challenge;
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(d.credentials?.issued ?? 0);
  const total = d.credentials?.finishers ?? 0;
  const run = async () => {
    setBusy(true);
    let done = issued, failed = 0;
    try {
      for (let round = 0; round < 50; round++) {
        const r = await authedJson<{ issued: number; failed: number; remaining: number }>(`/api/impact-league/${c.id}`, { method: 'POST', body: JSON.stringify({ action: 'credentials' }) });
        done += r.issued; failed += r.failed;
        setIssued(done);
        if (!r.remaining || (!r.issued && r.failed)) break;
      }
      if (failed) toast.error(`${failed} couldn’t be issued. Try again in a moment.`);
      else toast.success('Credentials issued', { description: 'Each finisher is told and can share it from their skills passport.' });
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t issue the credentials.')); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">Every student in a team that handed in gets a signed “Impact League finisher” credential ({c.creditHours} hours){c.isPublic ? ', linking to the public page' : ''}.</p>
      <p className="text-sm font-semibold text-zinc-900 dark:text-white tabular-nums" aria-live="polite">{issued} of {total} issued</p>
      {issued < total && <button type="button" disabled={busy} onClick={() => void run()} className="btn-primary"><BadgeCheck className="w-4 h-4" /> {busy ? 'Issuing…' : issued ? 'Issue the rest' : 'Issue credentials'}</button>}
    </div>
  );
}

const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const dt = new Date(iso);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function Settings({ d }: { d: LeagueDetail }) {
  const c = d.challenge;
  const done = c.status === 'DONE';
  const [f, setF] = useState(() => ({
    title: c.title, summary: c.summary, brief: c.brief, sdg: c.sdg ? String(c.sdg) : '', teamMin: c.teamMin, teamMax: c.teamMax, mixCampuses: c.mixCampuses,
    isPublic: c.isPublic, creditHours: c.creditHours, signupClosesAt: toLocal(c.signupClosesAt), demoDayAt: toLocal(c.demoDayAt),
  }));
  const [milestones, setMilestones] = useState<Milestone[]>(c.milestones.map((m) => ({ ...m, dueAt: toLocal(m.dueAt) })));
  const [rubric, setRubric] = useState<Criterion[]>(c.rubric);
  const [prizes, setPrizes] = useState<Prize[]>(c.prizes.map((p) => ({ id: p.id, title: p.title, sponsor: p.sponsor, description: p.description, teamId: p.teamId })));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body = done ? { isPublic: f.isPublic } : {
      ...f, sdg: f.sdg ? Number(f.sdg) : null, signupClosesAt: fromLocal(f.signupClosesAt), demoDayAt: fromLocal(f.demoDayAt),
      milestones: milestones.map((m) => ({ ...m, dueAt: fromLocal(m.dueAt ?? '') })), rubric, prizes,
    };
    try { await authedJson(`/api/impact-league/${c.id}`, { method: 'PATCH', body: JSON.stringify(body) }); toast.success('Saved'); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t save.')); }
    finally { setBusy(false); }
  };
  const copy = () => { if (c.publicUrl) void navigator.clipboard.writeText(`${location.origin}${c.publicUrl}`).then(() => toast.success('Public page link copied')); };
  const scored = d.teams.some((t) => (t.judged ?? 0) > 0);

  return (
    <form onSubmit={save} aria-labelledby="settings-title" className="panel p-5 space-y-4">
      <h2 id="settings-title" className="font-semibold text-zinc-900 dark:text-white">Settings</h2>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-800 dark:text-zinc-200">Public showcase page<span className="block text-xs text-zinc-600 dark:text-zinc-400">Teams that hand in (and agree) appear with their universities and project, never their names.</span></span>
        <Switch checked={f.isPublic} onChange={(v) => set('isPublic', v)} label="Public showcase page" />
      </label>
      {c.publicUrl && f.isPublic && <button type="button" onClick={copy} className="btn-ghost btn-sm"><Copy className="w-4 h-4" /> Copy public page link</button>}
      {!done && (
        <>
          <Field label="Title">{(p) => <input {...p} className="input" maxLength={100} required value={f.title} onChange={(e) => set('title', e.target.value)} />}</Field>
          <Field label="UN goal">{(p) => <select {...p} className="input" value={f.sdg} onChange={(e) => set('sdg', e.target.value)}><option value="">None</option>{SDGS.map((name, i) => <option key={name} value={i + 1}>{i + 1}. {name}</option>)}</select>}</Field>
          <Field label="In one sentence" count={f.summary.length} max={200}>{(p) => <input {...p} className="input" maxLength={200} value={f.summary} onChange={(e) => set('summary', e.target.value)} />}</Field>
          <Field label="The brief" count={f.brief.length} max={4000} hint="The problem, who it affects, and what a good project looks like.">{(p) => <textarea {...p} className="input min-h-[7rem]" maxLength={4000} value={f.brief} onChange={(e) => set('brief', e.target.value)} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Smallest team">{(p) => <input {...p} type="number" min={TEAM_SIZE.min} max={TEAM_SIZE.max} className="input" value={f.teamMin} onChange={(e) => set('teamMin', Number(e.target.value))} />}</Field>
            <Field label="Biggest team">{(p) => <input {...p} type="number" min={TEAM_SIZE.min} max={TEAM_SIZE.max} className="input" value={f.teamMax} onChange={(e) => set('teamMax', Number(e.target.value))} />}</Field>
          </div>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-800 dark:text-zinc-200">Teams must mix universities<span className="block text-xs text-zinc-600 dark:text-zinc-400">At least two universities in a team to hand in. Teams with students under 18 stay within one university, so they can’t enter.</span></span>
            <Switch checked={f.mixCampuses} onChange={(v) => set('mixCampuses', v)} label="Teams must mix universities" />
          </label>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Sign-up closes (optional)">{(p) => <input {...p} type="datetime-local" className="input" value={f.signupClosesAt} onChange={(e) => set('signupClosesAt', e.target.value)} />}</Field>
            <Field label="Demo day (optional)">{(p) => <input {...p} type="datetime-local" className="input" value={f.demoDayAt} onChange={(e) => set('demoDayAt', e.target.value)} />}</Field>
            <Field label="Hours on credentials">{(p) => <input {...p} type="number" min={0} max={200} className="input" value={f.creditHours} onChange={(e) => set('creditHours', Number(e.target.value))} />}</Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="label">Milestones</legend>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">Each new team gets these as cards on its board. Teams that already exist keep theirs.</p>
            {milestones.map((m, i) => (
              <div key={m.id || i} className="flex flex-wrap items-center gap-2">
                <input aria-label={`Milestone ${i + 1}`} className="input flex-1 min-w-[12rem]" maxLength={120} value={m.title} onChange={(e) => setMilestones((ms) => ms.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <input aria-label={`Milestone ${i + 1} due`} type="datetime-local" className="input !w-auto" value={m.dueAt ?? ''} onChange={(e) => setMilestones((ms) => ms.map((x, j) => (j === i ? { ...x, dueAt: e.target.value } : x)))} />
                <button type="button" onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))} disabled={milestones.length === 1} aria-label={`Remove milestone ${i + 1}`} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 disabled:opacity-40"><X className="w-4 h-4" /></button>
              </div>
            ))}
            {milestones.length < MAX_MILESTONES && <button type="button" onClick={() => setMilestones((ms) => [...ms, { id: '', title: '', notes: '', dueAt: '' }])} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add a milestone</button>}
          </fieldset>

          <fieldset className="space-y-2" disabled={scored}>
            <legend className="label">Judging rubric</legend>
            {scored && <p className="text-xs text-zinc-600 dark:text-zinc-400">Judges have started scoring, so the rubric is fixed.</p>}
            {rubric.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input aria-label={`Criterion ${i + 1}`} className="input flex-1" maxLength={60} value={r.name} onChange={(e) => setRubric((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input aria-label={`Top score for criterion ${i + 1}`} type="number" min={1} max={10} className="input !w-20" value={r.max} onChange={(e) => setRubric((rs) => rs.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) } : x)))} />
                <button type="button" onClick={() => setRubric((rs) => rs.filter((_, j) => j !== i))} disabled={rubric.length === 1} aria-label={`Remove criterion ${i + 1}`} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 disabled:opacity-40"><X className="w-4 h-4" /></button>
              </div>
            ))}
            {rubric.length < 8 && <button type="button" onClick={() => setRubric((rs) => [...rs, { id: '', name: '', desc: '', max: 10 }])} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add a criterion</button>}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="label">Prizes</legend>
            {prizes.map((p, i) => (
              <div key={p.id || i} className="rounded-xl border border-zinc-200 dark:border-white/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input aria-label={`Prize ${i + 1}`} className="input flex-1" maxLength={80} placeholder="Best community impact" value={p.title} onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <button type="button" onClick={() => setPrizes((ps) => ps.filter((_, j) => j !== i))} aria-label={`Remove prize ${i + 1}`} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600"><X className="w-4 h-4" /></button>
                </div>
                <input aria-label={`Sponsor of prize ${i + 1}`} className="input" maxLength={80} placeholder="Sponsor (optional)" value={p.sponsor} onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, sponsor: e.target.value } : x)))} />
                <input aria-label={`What prize ${i + 1} is`} className="input" maxLength={300} placeholder="What the winners get (optional)" value={p.description} onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              </div>
            ))}
            {prizes.length < MAX_PRIZES && <button type="button" onClick={() => setPrizes((ps) => [...ps, { id: '', title: '', sponsor: '', description: '', teamId: null }])} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add a prize</button>}
          </fieldset>
        </>
      )}
      <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
  );
}

/** Organizers, mentors, judges and sponsors; organizers add people by email. */
export function PeoplePanel({ d, act }: { d: LeagueDetail; act: LeagueAct }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<LeagueRole>('MENTOR');
  const [busy, setBusy] = useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (await act({ action: 'add-person', email, role }, `Added as ${ROLE_LABEL[role].toLowerCase()}`)) setEmail('');
    setBusy(false);
  };
  const remove = async (id: string, name: string, r: LeagueRole) => {
    if (!(await confirmDialog({ title: `Remove ${name} as ${ROLE_LABEL[r].toLowerCase()}?`, message: r === 'JUDGE' ? 'Their scores no longer count.' : r === 'MENTOR' ? 'They leave the groups of the teams they mentor.' : 'They lose this part in the challenge.', confirmLabel: 'Remove', destructive: true }))) return;
    await act({ action: 'remove-person', userId: id, role: r }, 'Removed');
  };
  return (
    <div className="space-y-4">
      {d.me.organizer && (
        <form onSubmit={add} aria-labelledby="add-person-title" className="panel p-4 space-y-3">
          <h2 id="add-person-title" className="font-semibold text-zinc-900 dark:text-white">Add someone</h2>
          <div className="flex flex-wrap gap-2 items-end">
            <Field label="Email" className="flex-1 min-w-[12rem]">{(p) => <input {...p} type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@university.edu" />}</Field>
            <Field label="Part">{(p) => <select {...p} className="input" value={role} onChange={(e) => setRole(e.target.value as LeagueRole)}>{LEAGUE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>}</Field>
            <button type="submit" disabled={busy || !email.includes('@')} className="btn-primary"><UserPlus className="w-4 h-4" /> Add</button>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">They need a UniVerse account (staff or mentor, not a student). They’re told in the app.</p>
        </form>
      )}
      {LEAGUE_ROLES.map((r) => {
        const people = d.people.filter((p) => p.role === r);
        if (!people.length) return null;
        return (
          <section key={r} aria-label={`${ROLE_LABEL[r]}s`} className="panel p-4 space-y-2">
            <h2 className="font-semibold text-zinc-900 dark:text-white">{ROLE_LABEL[r]}s</h2>
            <ul className="space-y-2">
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <Avatar name={p.name} src={p.avatar} size={32} />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{p.name}</span>{p.campus && <span className="block text-xs text-zinc-600 dark:text-zinc-400">{p.campus}</span>}</span>
                  {d.me.organizer && <button type="button" onClick={() => void remove(p.id, p.name, r)} aria-label={`Remove ${p.name} as ${ROLE_LABEL[r].toLowerCase()}`} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><X className="w-4 h-4" /></button>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
