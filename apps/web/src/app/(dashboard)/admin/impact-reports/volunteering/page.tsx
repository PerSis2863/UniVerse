'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { LoadError } from '@/components/ui/LoadError';
import { Download, Printer } from 'lucide-react';
import { downloadCsv } from '@/lib/csv-download';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, IMPACT_REPORT_TABS } from '@/components/layout/SectionTabs';
import { ImpactMap, SdgFilter, type Place } from '@/components/impact/ImpactMap';
import { authedJson } from '@/lib/authed-fetch';

// Yearly volunteering report (upgrade 5) for funders: verified hours from on-site check-ins, by
// place, project and UN goal. "Print / save as PDF" uses the browser's print (no server PDF library).

interface Report {
  year: number; sdg: number | null; totals: { hours: number; volunteers: number; shifts: number }; places: Place[];
  projects: { name: string; ngo: string; sdg: number | null; hours: number; people: number }[]; sdgs: { sdg: number; hours: number }[];
}

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] print:border-zinc-300 print:bg-white';

export default function VolunteeringReportPage() {
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(thisYear);
  const [sdg, setSdg] = useState<number | null>(null);
  const { data, isLoading, error, mutate } = useSWR<Report>(`/api/volunteer/report?year=${year}${sdg ? `&sdg=${sdg}` : ''}`, authedJson, { keepPreviousData: true });
  const most = Math.max(1, ...(data?.sdgs ?? []).map((s) => s.hours));
  return (
    <>
      <div className="print:hidden">
        <Topbar title="Yearly volunteering" subtitle="Verified volunteer hours for funders and partners" />
        <SectionTabs tabs={IMPACT_REPORT_TABS} />
      </div>
      <div className="flex-1 p-4 md:p-8 overflow-y-auto print:p-0">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <select className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
              {[0, 1, 2, 3].map((i) => <option key={i} value={thisYear - i}>{thisYear - i}</option>)}
            </select>
            {!!data?.projects.length && (
              <button type="button" className="btn-secondary btn-sm ms-auto" onClick={() => downloadCsv(`volunteering-${data.year}${data.sdg ? `-sdg-${data.sdg}` : ''}`, ['Project', 'Organisation', 'UN goal (SDG)', 'Volunteers', 'Verified hours'], data.projects.map((p) => [p.name, p.ngo, p.sdg ?? '', p.people, p.hours]))}>
                <Download className="w-4 h-4" aria-hidden />Export CSV<span className="sr-only"> of the projects</span>
              </button>
            )}
            <button type="button" className={`btn-primary btn-sm ${data?.projects.length ? '' : 'ms-auto'}`} onClick={() => window.print()}><Printer className="w-4 h-4" /> Print / save as PDF</button>
          </div>
          {error && !data ? <LoadError onRetry={() => mutate()} message="Couldn’t load the volunteering report." /> : isLoading || !data ? <div className="h-64 rounded-2xl skeleton" /> : (
            <article className="space-y-5 text-zinc-900 dark:text-white print:text-black">
              <header>
                <h1 className="text-2xl font-black">Volunteering impact report {data.year}</h1>
                <p className="text-sm text-zinc-500">Hours verified by on-site check-in (rotating QR code or GPS) or confirmed by a supervisor. Generated {new Date().toLocaleDateString()}.</p>
              </header>
              <div className="grid grid-cols-3 gap-3">
                {[['Verified hours', data.totals.hours], ['Volunteers', data.totals.volunteers], ['Shifts', data.totals.shifts]].map(([l, v]) => (
                  <div key={l} className={`${card} p-4`}><p className="text-2xl font-black tabular-nums">{Number(v).toLocaleString()}</p><p className="text-xs text-zinc-500">{l}</p></div>
                ))}
              </div>
              <section className="space-y-2 break-inside-avoid">
                <h2 className="font-bold">Where{data.sdg ? ` (SDG ${data.sdg} only)` : ''}</h2>
                <div className="print:hidden"><SdgFilter sdgs={data.sdgs} value={sdg} onChange={setSdg} /></div>
                <ImpactMap places={data.places} />
              </section>
              {data.sdgs.length > 0 && (
                <section className="space-y-2 break-inside-avoid">
                  <h2 className="font-bold">By UN Sustainable Development Goal</h2>
                  {data.sdgs.map((s) => (
                    <div key={s.sdg} className="flex items-center gap-3 text-sm">
                      <span className="w-14 shrink-0 font-semibold">SDG {s.sdg}</span>
                      <span className="flex-1 h-2.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(s.hours / most) * 100}%` }} /></span>
                      <span className="w-16 text-end tabular-nums">{s.hours} h</span>
                    </div>
                  ))}
                </section>
              )}
              <section className="space-y-2">
                <h2 className="font-bold">By project</h2>
                {!data.projects.length ? <p className="text-sm text-zinc-500">No verified hours this year yet.</p> : (
                  // Its own scroll box on screen (not when printed), so the column names stay on top.
                  <div tabIndex={0} role="region" aria-label="Hours by project" className="max-h-[70vh] overflow-auto print:max-h-none print:overflow-visible focus-visible:outline-2 focus-visible:outline-indigo-500">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-white dark:bg-zinc-950 print:static"><tr className="text-start text-xs text-zinc-500"><th className="py-1">Project</th><th>Organisation</th><th className="text-end">Volunteers</th><th className="text-end">Hours</th></tr></thead>
                    <tbody>{data.projects.map((p) => <tr key={p.name} className="border-t border-zinc-200 dark:border-white/10"><td className="py-1.5">{p.name}{p.sdg ? ` (SDG ${p.sdg})` : ''}</td><td>{p.ngo}</td><td className="text-end tabular-nums">{p.people}</td><td className="text-end tabular-nums">{p.hours}</td></tr>)}</tbody>
                  </table>
                  </div>
                )}
              </section>
            </article>
          )}
        </div>
      </div>
    </>
  );
}
