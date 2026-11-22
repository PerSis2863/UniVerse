'use client';

import useSWR from 'swr';
import { toast } from 'sonner';
import { Bike, Copy, Leaf, Link2Off, Users } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { COMMUTE } from '@/lib/carbon-ledger';
import { copy, linkOf } from './BizSuppliers';
import { Bar } from './Bar';
import { canEdit, h3, icon, kgText, muted, pct, tonnes, type SectionProps } from './shared';

// Green → Business → Staff (M272): one link for the whole team: how each person gets to work, how far and how often
// (no account needed, nothing about who). Answers make the year's commuting line (scope 3, category 7), scaled up to
// the headcount. Staff who answer while signed in also bring what they saved in their own UniVerse Green this year.

type Staff = { surveyCode: string | null; answers: number; employees: number | null; byMode: Record<string, { people: number; kg: number }>; kg: number; linked: number; greenSaved: { kg: number; actions: number } };

export function BizStaff({ org, role, year, onChanged }: SectionProps) {
  const { data, mutate } = useSWR<Staff>(`/green/biz/${org.id}/staff?year=${year}`, fetcher, { keepPreviousData: true });
  const toggle = async (on: boolean) => {
    try { const r = await api.post<{ surveyCode: string | null }>(`/green/biz/${org.id}/survey`, { on }); await mutate(); onChanged(); if (r.data.surveyCode) void copy(linkOf(r.data.surveyCode), 'The survey link'); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t change the link.')); }
  };
  if (!data) return null;
  const modes = Object.entries(data.byMode).sort((a, b) => b[1].kg - a[1].kg);
  const scale = data.employees && data.employees > data.answers && data.answers ? data.employees / data.answers : 1;
  return (
    <div className="space-y-6">
      <section className="panel p-5" aria-labelledby="staff-h">
        <h3 id="staff-h" className={h3}><Users className={icon} aria-hidden />Staff commuting survey</h3>
        <p className={`mt-2 max-w-3xl ${muted}`}>Share one link with everyone (by chat or the notice board). It takes 20 seconds and asks nothing about who answers. Signed-in answers count once per person and bring what they saved in their own Green living.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.surveyCode ? (
            <>
              <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => void copy(linkOf(data.surveyCode!), 'The survey link')}><Copy className="h-4 w-4" aria-hidden />Copy the survey link</button>
              {canEdit(role) && <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={() => void toggle(false)}><Link2Off className="h-4 w-4" aria-hidden />Turn the link off</button>}
            </>
          ) : canEdit(role) ? <button type="button" className="btn-primary" onClick={() => void toggle(true)}>Make the survey link</button> : <p className={muted}>No survey link yet.</p>}
        </div>
      </section>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="staff-modes">
          <h3 id="staff-modes" className={h3}><Bike className={icon} aria-hidden />How they get to work ({year})</h3>
          {!data.answers ? <p className={`mt-2 ${muted}`}>No answers yet.</p> : (
            <>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-white">{tonnes(data.kg * scale)}<span className="ms-1 text-base font-normal text-zinc-500 dark:text-zinc-400">a year</span></p>
              <p className={muted}>{data.answers} answers{scale > 1 ? `, scaled up to ${data.employees} staff` : ''}.</p>
              <ul className="mt-4 space-y-2.5">
                {modes.map(([m, v]) => (
                  <li key={m}>
                    <div className="flex justify-between gap-3 text-sm"><span className="text-zinc-700 dark:text-zinc-200">{COMMUTE[m]?.label ?? m} · {v.people} {v.people === 1 ? 'person' : 'people'}</span><span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{kgText(v.kg)}</span></div>
                    <Bar value={pct(v.people, data.answers) / 100} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="panel p-5" aria-labelledby="staff-green">
          <h3 id="staff-green" className={h3}><Leaf className={icon} aria-hidden />What staff saved in their own Green living</h3>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-white">{kgText(data.greenSaved.kg)}</p>
          <p className={muted}>{data.greenSaved.actions} climate actions in {year} by the {data.linked} {data.linked === 1 ? 'person' : 'people'} who answered while signed in. Shown apart: it’s their own, not the company’s footprint.</p>
        </section>
      </div>
    </div>
  );
}
