'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarClock, Plus, Trophy, Users, Video, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, impactTabs } from '@/components/layout/SectionTabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { LoadError } from '@/components/ui/LoadError';
import { SdgBadge, StatusChip, day, when } from '@/components/league/LeagueBits';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { ROLE_LABEL, SDGS, type LeagueRole, type LeagueStatus } from '@/lib/impact-league';
import { fadeUp, list, spring } from '@/lib/motion';
import { useAuthStore } from '@/store/auth';

// Impact League (Stage 5 · D14): seasonal challenges between universities around a UN goal. A tab of
// Opportunities (students), Impact reports (admins) and NGO mentorship (teachers).

interface Row {
  id: string; slug: string; title: string; sdg: number | null; sdgName: string | null; summary: string; status: LeagueStatus;
  teamMin: number; teamMax: number; mixCampuses: boolean; signupClosesAt: string | null; demoDayAt: string | null;
  teams: number; people: number; signupOpen: boolean; demoOpen: boolean; myTeam: { id: string; name: string } | null; myRoles: LeagueRole[];
}

export default function ImpactLeaguePage() {
  const role = useAuthStore((s) => s.user?.role);
  const { data, error, mutate } = useSWR<{ challenges: Row[]; canCreate: boolean }>('/api/impact-league', authedJson);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Topbar title="Impact League" subtitle="Team up across universities on a UN goal: mentors, demo day, prizes and a verified credential" />
      <SectionTabs tabs={impactTabs(role)} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          {data?.canCreate && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-prose">Start a challenge, add mentors, judges and sponsors, and open it to students across the campus network.</p>
              {!creating && <button type="button" onClick={() => setCreating(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> New challenge</button>}
            </div>
          )}
          <AnimatePresence initial={false}>{creating && <NewChallenge onClose={() => setCreating(false)} onMade={() => void mutate()} />}</AnimatePresence>
          {error && !data ? <LoadError onRetry={() => mutate()} />
            : !data ? <div className="grid md:grid-cols-2 gap-4">{[0, 1].map((i) => <div key={i} className="h-44 rounded-2xl skeleton" />)}</div>
            : data.challenges.length === 0 ? (
              <EmptyState icon={Trophy} title="No challenges yet" hint={data.canCreate ? 'Start the first one: pick a UN goal and a question worth working on.' : 'When a challenge opens, it shows here and you can form a team with students from other universities.'} />
            ) : (
              <motion.ul variants={list} initial="hidden" animate="show" className="grid md:grid-cols-2 gap-4">
                {data.challenges.map((c) => (
                  <motion.li key={c.id} variants={fadeUp}>
                    <Link href={`/impact-league/${c.id}`} className="panel p-4 flex flex-col gap-3 h-full hover:border-indigo-400/60 transition-colors">
                      <div className="flex items-start gap-3">
                        <SdgBadge sdg={c.sdg} name={c.sdgName} />
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-zinc-900 dark:text-white">{c.title}</span>
                          {c.sdgName && <span className="block text-xs text-zinc-600 dark:text-zinc-400 truncate">{c.sdgName}</span>}
                        </span>
                        <StatusChip status={c.status} />
                      </div>
                      {c.summary && <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">{c.summary}</p>}
                      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                        <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden />{c.teams} {c.teams === 1 ? 'team' : 'teams'} · {c.people} {c.people === 1 ? 'student' : 'students'}</span>
                        {c.signupOpen && c.signupClosesAt && <span>Sign-up until {day(c.signupClosesAt)}</span>}
                        {c.demoDayAt && !c.demoOpen && c.status !== 'DONE' && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" aria-hidden />Demo day {day(c.demoDayAt)}</span>}
                      </div>
                      {c.demoOpen && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5"><Video className="w-3.5 h-3.5" aria-hidden /> Demo day is on now ({when(c.demoDayAt)})</p>}
                      {(c.myTeam || c.myRoles.length > 0) && (
                        <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                          {c.myTeam ? `Your team: ${c.myTeam.name}` : `You: ${c.myRoles.map((r) => ROLE_LABEL[r]).join(', ')}`}
                        </p>
                      )}
                    </Link>
                  </motion.li>
                ))}
              </motion.ul>
            )}
        </div>
      </div>
    </>
  );
}

function NewChallenge({ onClose, onMade }: { onClose: () => void; onMade: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [sdg, setSdg] = useState('6');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authedJson<{ id: string }>('/api/impact-league', { method: 'POST', body: JSON.stringify({ title, sdg: Number(sdg) || null, summary }) });
      toast.success('Draft challenge made', { description: 'Add the details, mentors and judges, then open it.' });
      onMade();
      router.push(`/impact-league/${r.id}`);
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t make the challenge.')); setBusy(false); }
  };
  return (
    <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} onSubmit={save} className="overflow-hidden" aria-labelledby="new-league-title">
      <div className="panel p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="new-league-title" className="font-semibold text-zinc-900 dark:text-white">New challenge</h2>
          <button type="button" onClick={onClose} aria-label="Cancel" className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-4 h-4" /></button>
        </div>
        <Field label="Title">{(p) => <input {...p} className="input" maxLength={100} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Clean water ideas" />}</Field>
        <Field label="UN goal">{(p) => <select {...p} className="input" value={sdg} onChange={(e) => setSdg(e.target.value)}><option value="">None</option>{SDGS.map((name, i) => <option key={name} value={i + 1}>{i + 1}. {name}</option>)}</select>}</Field>
        <Field label="In one sentence (optional)" count={summary.length} max={200}>{(p) => <input {...p} className="input" maxLength={200} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Find a way to bring safe drinking water to a community near you." />}</Field>
        <button type="submit" disabled={busy || title.trim().length < 4} className="btn-primary">{busy ? 'Making…' : 'Make a draft'}</button>
      </div>
    </motion.form>
  );
}
