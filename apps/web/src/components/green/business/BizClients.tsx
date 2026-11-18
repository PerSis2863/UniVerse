'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Briefcase, Plus } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { NewOrg } from './GreenBusiness';
import { canEdit, change, countryName, h3, icon, muted, pct, tonnes, type SectionProps } from './shared';

// Green → Business → Clients (M275): a consultancy's client companies at a glance (this year against last, scopes, how
// many months have data, how many suppliers answered), a new client, and a way into each one. Its reports carry
// "Prepared by" the consultancy.

type Client = { id: string; name: string; industry: string | null; country: string | null; employees: number | null; kg: number; scope: Record<1 | 2 | 3, number>; before: number; months: number; asked: number; answered: number };

export function BizClients({ org, role, year, onChanged, onPick }: SectionProps) {
  const { data, mutate } = useSWR<{ clients: Client[] }>(`/green/biz/${org.id}/clients?year=${year}`, fetcher);
  const [adding, setAdding] = useState(false);
  const list = data?.clients ?? [];
  const total = list.reduce((a, c) => a + c.kg, 0);
  return (
    <div className="space-y-6">
      <section className="panel p-5" aria-labelledby="cl-h">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="cl-h" className={h3}><Briefcase className={icon} aria-hidden />Your clients ({year})</h3>
            <p className={`mt-1 ${muted}`}>{list.length} {list.length === 1 ? 'company' : 'companies'}, {tonnes(total)} CO₂e between them. Your team works on each as editors; owners here own them too.</p>
          </div>
          {canEdit(role) && !adding && <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />New client</button>}
        </div>
      </section>
      {adding && <NewOrg consultancyId={org.id} onDone={async () => { setAdding(false); await mutate(); onChanged(); }} onCancel={() => setAdding(false)} />}
      {!!list.length && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const d = change(c.kg, c.before);
            return (
              <button key={c.id} type="button" onClick={() => onPick(c.id)} className="panel p-5 text-start transition-shadow hover:shadow-md">
                <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{c.name}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{[c.industry, c.country ? countryName(c.country) : null, c.employees ? `${c.employees} staff` : null].filter(Boolean).join(' · ') || 'No details yet'}</p>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">{tonnes(c.kg)}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{d === null ? 'No year before' : `${d <= 0 ? '↓' : '↑'} ${Math.abs(d)}% on ${year - 1}`}</p>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10" aria-hidden>
                  <span style={{ flexGrow: c.scope[1] || 0.0001, background: '#047857' }} /><span style={{ flexGrow: c.scope[2] || 0.0001, background: '#0284c7' }} /><span style={{ flexGrow: c.scope[3] || 0.0001, background: '#a16207' }} />
                </div>
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">Scopes 1 / 2 / 3: {pct(c.scope[1], c.kg)}% / {pct(c.scope[2], c.kg)}% / {pct(c.scope[3], c.kg)}%</p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{c.months} of 12 months with data · suppliers {c.answered}/{c.asked}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
