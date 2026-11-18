'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { FileText, Printer } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { fetcher } from '@/lib/fetcher';
import { RELIEF_KIND_LABEL, type ReliefKind } from '@/lib/relief';

// M314: an organisation's emergencies with their timeline and report (GET /relief/orgs/:id/incidents and
// /relief/incidents/:id/report): the numbers, needs by kind, people marking safe hour by hour, supplies
// used, shifts, and every step in order; printable for funders and authorities.

type Row = { id: string; title: string; place: string | null; startedAt: string; endsAt: string; safe: number; over: boolean };
type Report = {
  incident: { title: string; place: string | null; radiusKm: number; startedAt: string; endsAt: string; over: boolean; org: string };
  numbers: { hours: number; safe: number; needs: number; offers: number; taken: number; delivered: number; helped: number; shifts: number; volunteers: number };
  byKind: { kind: string; n: number }[]; safeByHour: number[]; used: { name: string; unit: string; out: number }[]; timeline: { at: string; kind: string; text: string }[];
};
const when = (s: string) => new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function IncidentReports({ orgId }: { orgId: string }) {
  const { data } = useSWR<{ incidents: Row[] }>(`/relief/orgs/${orgId}/incidents`, fetcher);
  const [open, setOpen] = useState<Row | null>(null);
  if (!data?.incidents.length) return null;
  return (
    <section className="panel p-5" aria-labelledby="reports-h">
      <h3 id="reports-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><FileText className="w-4 h-4 text-orange-500" aria-hidden />Emergencies and their reports</h3>
      <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/[0.06]">
        {data.incidents.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1"><b className="text-zinc-900 dark:text-white" translate="no">{i.title}</b><span className="text-zinc-500"> · {when(i.startedAt)}{i.over ? '' : ' · still on'} · {i.safe} safe</span></span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(i)}>Report</button>
          </li>
        ))}
      </ul>
      {open && <ReportSheet id={open.id} onClose={() => setOpen(null)} />}
    </section>
  );
}

function ReportSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useSWR<Report>(`/relief/incidents/${id}/report`, fetcher);
  const print = () => {
    document.documentElement.dataset.printing = 'report';
    const done = () => { delete document.documentElement.dataset.printing; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  const max = Math.max(1, ...(data?.safeByHour ?? [1]));
  return (
    <Sheet title="Emergency report" onClose={onClose} wide footer={<div className="flex justify-end"><button type="button" className="btn-secondary btn-sm" onClick={print} disabled={!data}><Printer className="w-4 h-4" aria-hidden />Print</button></div>}>
      {!data ? <div className="h-48 rounded-2xl skeleton" /> : (
        <article className="print-report space-y-5">
          <header>
            <p className="text-sm text-zinc-500" translate="no">{data.incident.org}</p>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white" translate="no">{data.incident.title}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{data.incident.place ? <span translate="no">{data.incident.place} · </span> : null}within {data.incident.radiusKm} km · {when(data.incident.startedAt)} to {data.incident.over ? when(data.incident.endsAt) : 'now'} ({data.numbers.hours} h)</p>
          </header>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['Marked safe', data.numbers.safe], ['Needs posted', data.numbers.needs], ['Delivered', `${data.numbers.delivered} of ${data.numbers.needs}`], ['People helped', data.numbers.helped], ['Offers of help', data.numbers.offers], ['Taken by helpers', data.numbers.taken], ['Shifts', data.numbers.shifts], ['Volunteers on shifts', data.numbers.volunteers]].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]"><dt className="text-xs text-zinc-500">{k}</dt><dd className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>
            ))}
          </dl>
          {data.safeByHour.some((n) => n > 0) && (
            <section>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Marked safe, hour by hour</h3>
              <div className="mt-2 flex h-20 items-end gap-px" role="img" aria-label={`People marking safe per hour: ${data.safeByHour.join(', ')}`}>
                {data.safeByHour.map((n, h) => <span key={h} className="flex-1 rounded-t bg-orange-500/70" style={{ height: `${Math.max(2, (n / max) * 100)}%` }} />)}
              </div>
            </section>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.byKind.length > 0 && (
              <section><h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Needs by kind</h3>
                <ul className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">{data.byKind.map((k) => <li key={k.kind}>{RELIEF_KIND_LABEL[k.kind as ReliefKind] ?? k.kind}: {k.n}</li>)}</ul></section>
            )}
            {data.used.length > 0 && (
              <section><h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Supplies given out</h3>
                <ul className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">{data.used.map((u) => <li key={u.name}><span translate="no">{u.name}</span>: {u.out} {u.unit}</li>)}</ul></section>
            )}
          </div>
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Timeline</h3>
            <ol className="mt-1 space-y-0.5 text-sm">
              {data.timeline.map((t, i) => <li key={i} className="flex gap-3"><span className="w-28 shrink-0 tabular-nums text-xs text-zinc-500">{when(t.at)}</span><span className="text-zinc-800 dark:text-zinc-100" translate="no">{t.text}</span></li>)}
            </ol>
          </section>
        </article>
      )}
    </Sheet>
  );
}
