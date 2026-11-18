'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { FileText, Printer } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { categoryById, type Totals } from '@/lib/carbon-ledger';
import { S3_NAMES, SCOPE_TEXT, canEdit, catLabel, countryName, field, h3, icon, label, muted, pct, tonnes, type BizOrg, type SectionProps } from './shared';

// Green → Business → Report (M274): the year's footprint laid out the way three common frameworks ask for it (the GHG
// Protocol's corporate standard; India's BRSR, Principle 6; Europe's CSRD, ESRS E1-6), every factor with its source,
// and the log's latest fingerprint so an auditor can tie the numbers to the change log. A draft to check, not a
// certified report. It prints alone (Print or save as PDF). The auditor's link (/carbon/[code]) shows the same view.

export type Report = {
  org: BizOrg; year: number; preparedBy: string | null; generatedAt: string; totals: Totals;
  base: { year: number; kg: number; scope: Record<1 | 2 | 3, number> } | null; byS3: Record<string, number>;
  intensity: { perEmployee: number | null; s12PerMillionRevenue: number | null; perMillionRevenue: number | null };
  target: { baseYear: number; targetYear: number; pct: number; path: { year: number; kg: number }[] } | null;
  plan: { cutsKg: Record<string, number>; totalKg: number };
  factors: { category: string; label: string; unit: string; factor: number; source: string }[];
  data: { lines: number; suppliers: number; suppliersAnswered: number; commuteAnswers: number };
  audit: { hash: string; at: string } | null;
};

const row = 'flex justify-between gap-4 border-b border-[var(--hairline)] py-1.5 text-sm';
const th = 'text-zinc-600 dark:text-zinc-300';
const td = 'font-semibold tabular-nums text-zinc-900 dark:text-white text-end';

export function BizReportSection({ org, role, year, onChanged }: SectionProps) {
  const { data } = useSWR<Report>(`/green/biz/${org.id}/report?year=${year}`, fetcher);
  const [f, setF] = useState({ industry: org.industry ?? '', employees: String(org.employees ?? ''), revenue: String(org.revenue ?? '') });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.put(`/green/biz/${org.id}`, { industry: f.industry, employees: f.employees || null, revenue: f.revenue || null }); toast.success('Saved.'); onChanged(); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t save that.')); }
  };
  return (
    <div className="space-y-6">
      {canEdit(role) && (
        <form onSubmit={(e) => void save(e)} className="panel p-5 grid gap-3 sm:grid-cols-[1fr_10rem_14rem_auto] sm:items-end" aria-label="Details for the report">
          <label className={label}>Industry<input maxLength={60} value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} className={field} /></label>
          <label className={label}>Staff<input type="number" min={0} value={f.employees} onChange={(e) => setF({ ...f, employees: e.target.value })} className={field} /></label>
          <label className={label}>Yearly revenue, {org.currency}<input type="number" min={0} value={f.revenue} onChange={(e) => setF({ ...f, revenue: e.target.value })} className={field} /></label>
          <button type="submit" className="btn-secondary">Save details</button>
        </form>
      )}
      {data ? <BizReport report={data} /> : <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" />}
    </div>
  );
}

export function BizReport({ report: r }: { report: Report }) {
  const t = r.totals, s12 = t.scope[1] + t.scope[2];
  const print = () => {
    document.documentElement.dataset.printing = 'report';
    const done = () => { delete document.documentElement.dataset.printing; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  const change = r.base && r.base.year !== r.year && r.base.kg > 0 ? Math.round(((t.kg - r.base.kg) / r.base.kg) * 100) : null;
  return (
    <article className="print-report panel p-5 sm:p-8 space-y-8" aria-labelledby="report-h">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="report-h" className="text-xl font-semibold text-zinc-900 sm:text-2xl dark:text-white"><FileText className={`${icon} me-2 inline-block -mt-1`} aria-hidden /><span translate="no">{r.org.name}</span>: greenhouse gas emissions {r.year}</h2>
          <p className={`mt-1 ${muted}`}>{[r.org.industry, r.org.country ? countryName(r.org.country) : null, r.org.employees ? `${r.org.employees.toLocaleString()} staff` : null].filter(Boolean).join(' · ')}{r.preparedBy ? <> · Prepared by <span translate="no">{r.preparedBy}</span></> : null}</p>
          <p className="mt-2 inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">Draft for review: not verified or certified</p>
        </div>
        <button type="button" onClick={print} className="print-hide btn-secondary inline-flex items-center gap-1.5"><Printer className="h-4 w-4" aria-hidden />Print or save as PDF</button>
      </header>

      <section aria-labelledby="r-ghg">
        <h3 id="r-ghg" className={h3}>GHG Protocol: emissions by scope</h3>
        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <div>
            {([1, 2, 3] as const).map((s) => <div key={s} className={row}><span className={th}>{SCOPE_TEXT[s].title}: {SCOPE_TEXT[s].what.toLowerCase()}</span><span className={td}>{tonnes(t.scope[s])} · {pct(t.scope[s], t.kg)}%</span></div>)}
            <div className={row}><span className="font-semibold text-zinc-900 dark:text-white">Total, tonnes CO₂e</span><span className={td}>{tonnes(t.kg)}</span></div>
            {r.base && <div className={row}><span className={th}>Base year {r.base.year}</span><span className={td}>{tonnes(r.base.kg)}{change !== null ? ` (${change > 0 ? '+' : ''}${change}%)` : ''}</span></div>}
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Scope 3 by category</p>
            {Object.entries(r.byS3).sort((a, b) => Number(a[0]) - Number(b[0])).map(([c, kg]) => <div key={c} className={row}><span className={th}>{c}. {S3_NAMES[Number(c)] ?? 'Other'}</span><span className={td}>{tonnes(kg)}</span></div>)}
            {!Object.keys(r.byS3).length && <p className={`mt-2 ${muted}`}>No scope 3 lines yet.</p>}
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Operational control. Scope 2 location-based (the country’s grid) unless a line says its own or a renewable tariff (market-based, 0 with certificates). Gases as CO₂ equivalent with IPCC AR4 warming potentials.</p>
      </section>

      <section aria-labelledby="r-brsr">
        <h3 id="r-brsr" className={h3}>BRSR, Principle 6 (India): essential indicators</h3>
        <div className="mt-3 max-w-2xl">
          <div className={row}><span className={th}>Total Scope 1 emissions (tCO₂e)</span><span className={td}>{tonnes(t.scope[1])}</span></div>
          <div className={row}><span className={th}>Total Scope 2 emissions (tCO₂e)</span><span className={td}>{tonnes(t.scope[2])}</span></div>
          <div className={row}><span className={th}>Scope 1 and 2 per million {r.org.currency} of turnover</span><span className={td}>{r.intensity.s12PerMillionRevenue !== null ? tonnes(r.intensity.s12PerMillionRevenue) : 'Add revenue'}</span></div>
          <div className={row}><span className={th}>Total energy consumed (GJ, fuels and electricity)</span><span className={td}>{Math.round(t.gj).toLocaleString()}</span></div>
          <div className={row}><span className={th}>Energy per million {r.org.currency} of turnover (GJ)</span><span className={td}>{r.org.revenue ? Math.round((t.gj / r.org.revenue) * 1e6).toLocaleString() : 'Add revenue'}</span></div>
        </div>
      </section>

      <section aria-labelledby="r-esrs">
        <h3 id="r-esrs" className={h3}>CSRD, ESRS E1 (Europe): climate</h3>
        <div className="mt-3 max-w-2xl">
          <div className={row}><span className={th}>E1-6 Gross Scopes 1, 2 and 3 (tCO₂e)</span><span className={td}>{tonnes(s12)} + {tonnes(t.scope[3])}</span></div>
          <div className={row}><span className={th}>E1-6 Intensity per million {r.org.currency} of net revenue</span><span className={td}>{r.intensity.perMillionRevenue !== null ? tonnes(r.intensity.perMillionRevenue) : 'Add revenue'}</span></div>
          <div className={row}><span className={th}>E1-5 Energy consumption (MWh)</span><span className={td}>{Math.round(t.gj / 3.6).toLocaleString()}</span></div>
          <div className={row}><span className={th}>E1-4 Target</span><span className={td}>{r.target ? `−${r.target.pct}% by ${r.target.targetYear} from ${r.target.baseYear}` : 'None set'}</span></div>
          <div className={row}><span className={th}>E1-3 Planned actions (this year’s cut)</span><span className={td}>{r.plan.totalKg ? `−${tonnes(r.plan.totalKg)} a year` : 'None planned'}</span></div>
        </div>
      </section>

      <section aria-labelledby="r-factors">
        <h3 id="r-factors" className={h3}>Factors and sources</h3>
        {/* Scrolls sideways on a phone: focusable so a keyboard can scroll it too (axe scrollable-region-focusable). */}
        <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Factors and sources">
          <table className="w-full min-w-[36rem] text-sm">
            <thead><tr className="text-xs text-zinc-600 dark:text-zinc-300"><th className="py-1.5 text-start">Line</th><th className="py-1.5 text-end">kg CO₂e a unit</th><th className="py-1.5 ps-4 text-start">Source</th></tr></thead>
            <tbody>{r.factors.map((f) => <tr key={`${f.category}-${f.factor}`} className="border-t border-[var(--hairline)]"><td className="py-1.5 text-zinc-900 dark:text-white">{catLabel(f.category)}<span className="text-xs text-zinc-500"> ({categoryById(f.category)?.unit === 'money' ? r.org.currency : f.unit})</span></td><td className="py-1.5 text-end tabular-nums">{f.factor}</td><td className="py-1.5 ps-4 text-xs text-zinc-600 dark:text-zinc-400">{f.source}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="r-data" className="text-sm text-zinc-600 dark:text-zinc-300">
        <h3 id="r-data" className={h3}>Data behind it</h3>
        <p className="mt-2">{r.data.lines} ledger lines · {r.data.suppliersAnswered} of {r.data.suppliers} suppliers answered with their own figures · {r.data.commuteAnswers} staff commute answers.</p>
        {r.audit && <p className="mt-1 break-all">Change log fingerprint (SHA-256) {r.audit.hash} at {new Date(r.audit.at).toLocaleString()}: an auditor’s link shows the whole chain.</p>}
        <p className="mt-1">Made with UniVerse Green on {new Date(r.generatedAt).toLocaleDateString()}.</p>
      </section>
    </article>
  );
}
