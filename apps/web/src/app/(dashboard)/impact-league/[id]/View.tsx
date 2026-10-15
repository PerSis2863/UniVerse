'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock, ExternalLink, Flag, Trophy, Users, Video } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { LoadError } from '@/components/ui/LoadError';
import { Segmented, type Segment } from '@/components/ui/Segmented';
import { SdgBadge, StatusChip, day, when } from '@/components/league/LeagueBits';
import { MyTeam } from '@/components/league/MyTeam';
import { TeamList } from '@/components/league/TeamList';
import { PeoplePanel, RunPanel } from '@/components/league/Organizer';
import type { LeagueAct, LeagueDetail } from '@/components/league/types';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/impact-league';
import { fadeUp, list } from '@/lib/motion';

// One Impact League challenge (Stage 5 · D14): the brief, milestones, prizes and demo day; your team;
// every team; the people running it; and, for organizers, running it (src/server/impact-league.ts).

type View = 'overview' | 'teams' | 'people' | 'run';

function LeagueChallengePage({ id }: { id: string }) {
  const router = useRouter();
  const key = `/api/impact-league/${id}`;
  const { data, error, mutate } = useSWR<LeagueDetail>(key, authedJson);
  const [view, setView] = useState<View>('overview');
  const act: LeagueAct = async (body, ok) => {
    try {
      await authedJson(key, { method: 'POST', body: JSON.stringify(body) });
      if (ok) toast.success(ok);
      await mutate();
      return true;
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t do that.'));
      return false;
    }
  };

  if (error && !data) {
    return (
      <>
        <Topbar title="Impact League" />
        <div className="flex-1 p-4 md:p-8"><div className="max-w-3xl mx-auto"><LoadError onRetry={() => mutate()} message={errorMessage(error, 'Couldn’t load this challenge.')} /></div></div>
      </>
    );
  }
  const c = data?.challenge;
  const myTeam = data?.teams.find((t) => t.mine) ?? null;
  const segments: Segment<View>[] = data ? [
    { value: 'overview', label: 'Overview' },
    { value: 'teams', label: `Teams (${data.teams.length})` },
    { value: 'people', label: 'People' },
    ...(data.me.organizer ? [{ value: 'run' as const, label: 'Run' }] : []),
  ] : [];

  return (
    <>
      <Topbar title={c?.title ?? 'Impact League'} subtitle={c?.sdgName ? `UN goal ${c.sdg}: ${c.sdgName}` : 'Impact League challenge'} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-4">
          <Link href="/impact-league" className="inline-flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white min-h-11"><ArrowLeft className="w-4 h-4" /> All challenges</Link>
          {!data || !c ? <div className="h-56 rounded-2xl skeleton" /> : (
            <>
              <section aria-label="About this challenge" className="panel p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <SdgBadge sdg={c.sdg} name={c.sdgName} size="lg" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <StatusChip status={c.status} />
                    {c.summary && <p className="text-sm text-zinc-700 dark:text-zinc-300">{c.summary}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden />Teams of {c.teamMin === c.teamMax ? c.teamMin : `${c.teamMin}–${c.teamMax}`}{c.mixCampuses ? ', from 2+ universities' : ''}</span>
                  {c.signupClosesAt && c.status === 'OPEN' && <span>Sign-up until {when(c.signupClosesAt)}</span>}
                  {c.demoDayAt && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" aria-hidden />Demo day {when(c.demoDayAt)}</span>}
                  {data.me.roles.length > 0 && <span className="font-semibold text-indigo-700 dark:text-indigo-300">You: {data.me.roles.map((r) => ROLE_LABEL[r]).join(', ')}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(data.demo.open || (data.me.organizer && c.status !== 'DRAFT')) && c.demoDayAt && (
                    <Link href={`/call/${data.demo.callId}?kind=video`} className={data.demo.open ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}><Video className="w-4 h-4" /> {data.demo.open ? 'Join demo day' : 'Open demo day room'}</Link>
                  )}
                  {c.publicUrl && <Link href={c.publicUrl} className="btn-ghost btn-sm"><ExternalLink className="w-4 h-4" /> Public page</Link>}
                </div>
                {data.me.organizer && data.demo.open === false && c.demoDayAt && c.status !== 'DRAFT' && <p className="text-xs text-zinc-600 dark:text-zinc-400">You host demo day: turn on webinar mode in the call so the audience watches while teams present.</p>}
              </section>

              {myTeam && <MyTeam d={data} team={myTeam} act={act} />}

              <Segmented segments={segments} value={view} onChange={(v) => setView(v)} label="Show" className="w-full" />

              {view === 'overview' && <Overview d={data} />}
              {view === 'teams' && <TeamList d={data} act={act} />}
              {view === 'people' && <PeoplePanel d={data} act={act} />}
              {view === 'run' && data.me.organizer && <RunPanel d={data} act={act} onDeleted={() => router.push('/impact-league')} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Overview({ d }: { d: LeagueDetail }) {
  const c = d.challenge;
  return (
    <motion.div variants={list} initial="hidden" animate="show" className="space-y-4">
      {c.brief && (
        <motion.section variants={fadeUp} aria-labelledby="brief-title" className="panel p-5 space-y-2">
          <h2 id="brief-title" className="font-semibold text-zinc-900 dark:text-white">The brief</h2>
          <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-line">{c.brief}</p>
        </motion.section>
      )}
      {d.me.canJoin && (
        <motion.p variants={fadeUp} className="panel p-4 text-sm text-zinc-800 dark:text-zinc-200">You’re not in a team yet. Open <strong>Teams</strong> to join one with a free seat, or start your own.</motion.p>
      )}
      <motion.section variants={fadeUp} aria-labelledby="milestones-title" className="panel p-5 space-y-3">
        <h2 id="milestones-title" className="font-semibold text-zinc-900 dark:text-white">Milestones</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">Each team gets these as cards on its own board.</p>
        <ol className="space-y-2">
          {c.milestones.map((m, i) => (
            <li key={m.id} className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-500/10 text-indigo-800 dark:text-indigo-200 text-xs font-bold flex items-center justify-center shrink-0"><Flag className="w-3.5 h-3.5" aria-hidden /><span className="sr-only">{i + 1}</span></span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-900 dark:text-white">{m.title}{m.dueAt && <span className="font-normal text-zinc-600 dark:text-zinc-400"> · by {day(m.dueAt)}</span>}</span>
                {m.notes && <span className="block text-xs text-zinc-600 dark:text-zinc-400">{m.notes}</span>}
              </span>
            </li>
          ))}
        </ol>
      </motion.section>
      {c.prizes.length > 0 && (
        <motion.section variants={fadeUp} aria-labelledby="prizes-title" className="panel p-5 space-y-3">
          <h2 id="prizes-title" className="font-semibold text-zinc-900 dark:text-white">Prizes</h2>
          <ul className="space-y-2">
            {c.prizes.map((p) => (
              <li key={p.id} className="flex gap-3">
                <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{p.title}{p.sponsor && <span className="font-normal text-zinc-600 dark:text-zinc-400"> · from {p.sponsor}</span>}</span>
                  {p.description && <span className="block text-xs text-zinc-600 dark:text-zinc-400">{p.description}</span>}
                  {c.status === 'DONE' && p.teamName && <span className="block text-sm text-emerald-800 dark:text-emerald-300">Won by {p.teamName}</span>}
                </span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
      <motion.section variants={fadeUp} aria-labelledby="rubric-title" className="panel p-5 space-y-2">
        <h2 id="rubric-title" className="font-semibold text-zinc-900 dark:text-white">How projects are judged</h2>
        <ul className="space-y-1.5">
          {c.rubric.map((r) => <li key={r.id} className="text-sm text-zinc-800 dark:text-zinc-200"><span className="font-medium">{r.name}</span> <span className="text-zinc-600 dark:text-zinc-400">(up to {r.max})</span>{r.desc && <span className="block text-xs text-zinc-600 dark:text-zinc-400">{r.desc}</span>}</li>)}
        </ul>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">Every finisher gets a signed credential ({c.creditHours} hours) for their skills passport.</p>
      </motion.section>
    </motion.div>
  );
}

// Served for every address from the page built once with "open" (page.tsx, cloudflare/page-routes.gen.ts):
// the values come from the address, read in the browser.
export default function LeagueChallengePageRoute() {
  const p = usePathParams('/impact-league/[id]');
  return p ? <LeagueChallengePage key={p.id} id={p.id} /> : <AddressLoading portal />;
}
