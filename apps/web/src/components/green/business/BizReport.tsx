'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BadgeCheck, FileText, Printer, ShieldAlert } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { QUALITY, S3_CATEGORIES, categoryById, type Quality, type Screen, type Totals } from '@/lib/carbon-ledger';
import { SCOPE_TEXT, canEdit, catLabel, countryName, field, h3, icon, label, muted, pct, tonnes, type BizOrg, type SectionProps } from './shared';

// Green → Business → Report (M274, M276–M279): the year's footprint laid out the way three common frameworks ask for it
// (the GHG Protocol's corporate standard with scope 2 both ways; India's BRSR, Principle 6; Europe's CSRD, ESRS E1), all
// fifteen scope 3 categories (counted, not relevant, or left out with a reason), data quality and its uncertainty, sites,
// the carbon cost at the company's internal price, every factor with its source, certificates and offsets apart from
// the footprint, and the verifier's signed statement when there is one (or "Draft" when not). It prints alone. The
// auditor's link (/carbon/[code]) shows the same view.

type Verification = { firm: string; verifier: string; standard: string | null; level: string | null; scopes: number[]; accreditation: string | null; opinion: string | null; signedAt: string; signature: string | null; intact: boolean; changed: boolean };
type CreditSum = { recMwh: number; greenMwh: number; backed: boolean; offsetT: number; removalT: number; retiredT: number };
export type Report = {
  org: BizOrg; year: number; preparedBy: string | null; generatedAt: string; totals: Totals;
  base: { year: number; kg: number; scope: Record<1 | 2 | 3, number> } | null; byS3: Record<string, number>;
  intensity: { perEmployee: number | null; s12PerMillionRevenue: number | null; perMillionRevenue: number | null };
  target: { baseYear: number; targetYear: number; pct: number; path: { year: number; kg: number }[] } | null;
  plan: { cutsKg: Record<string, number>; totalKg: number };
  factors: { category: string; label: string; unit: string; factor: number; source: string }[];
  data: { lines: number; suppliers: number; suppliersAnswered: number; commuteAnswers: number };
  audit: { hash: string; at: string } | null;
  scope2: { location: number; market: number }; quality: Totals['quality']; bySite: Record<string, number>;
  screening: Record<number, { status: Screen; reason: string | null }>; carbonCost: number | null; credits: CreditSum; verification: Verification | null;
};

const row = 'flex justify-between gap-4 border-b border-[var(--hairline)] py-1.5 text-sm';
const th = 'text-zinc-600 dark:text-zinc-300';
const td = 'font-semibold tabular-nums text-zinc-900 dark:text-white text-end';
const SCREEN_TEXT: Record<Screen, string> = { included: 'Counted', 'not-relevant': 'Not relevant', excluded: 'Left out' };

export function BizReportSection({ org, role, year, onChanged }: SectionProps) {
  const { data, mutate } = useSWR<Report>(`/green/biz/${org.id}/report?year=${year}`, fetcher, { keepPreviousData: true });
  const [f, setF] = useState({ industry: org.industry ?? '', employees: String(org.employees ?? ''), revenue: String(org.revenue ?? ''), carbonPrice: String(org.carbonPrice ?? '') });
  const [screen, setScreen] = useState(org.screening);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.put(`/green/biz/${org.id}`, { industry: f.industry, employees: f.employees || null, revenue: f.revenue || null, carbonPrice: f.carbonPrice || null }); toast.success('Saved.'); onChanged(); void mutate(); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t save that.')); }
  };
  const saveScreen = async () => {
    try { await api.put(`/green/biz/${org.id}`, { screening: screen }); toast.success('Scope 3 categories saved.'); onChanged(); void mutate(); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t save that.')); }
  };
  const edit = canEdit(role);
  return (
    <div className="space-y-6">
      {edit && (
        <form onSubmit={(e) => void save(e)} className="panel p-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_12rem_12rem_auto] lg:items-end" aria-label="Details for the report">
          <label className={label}>Industry<input maxLength={60} value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} className={field} /></label>
          <label className={label}>Staff<input type="number" min={0} value={f.employees} onChange={(e) => setF({ ...f, employees: e.target.value })} className={field} /></label>
          <label className={label}>Yearly revenue, {org.currency}<input type="number" min={0} value={f.revenue} onChange={(e) => setF({ ...f, revenue: e.target.value })} className={field} /></label>
          <label className={label}>Internal carbon price, {org.currency} a tonne<input type="number" min={0} value={f.carbonPrice} onChange={(e) => setF({ ...f, carbonPrice: e.target.value })} className={field} /></label>
          <button type="submit" className="btn-secondary">Save details</button>
        </form>
      )}
      {edit && (
        <details className="panel p-5">
          <summary className="cursor-pointer text-lg font-semibold text-zinc-900 dark:text-white">Scope 3’s fifteen categories: what you count</summary>
          <p className={`mt-2 max-w-3xl ${muted}`}>The GHG Protocol asks you to say, for each category, whether it’s counted, not relevant to you, or left out, and why. Verifiers read this first.</p>
          <ul className="mt-4 divide-y divide-[var(--hairline)]">
            {S3_CATEGORIES.map((c) => {
              const v = screen[c.n] ?? { status: 'included' as Screen, reason: null };
              return (
                <li key={c.n} className="grid grid-cols-1 gap-2 py-3 lg:grid-cols-[1fr_11rem_1fr] lg:items-center">
                  <div><p className="text-sm font-medium text-zinc-900 dark:text-white">{c.n}. {c.name}</p><p className="text-xs text-zinc-600 dark:text-zinc-400">{c.hint}</p></div>
                  <label><span className="sr-only">{c.name}: status</span><select value={v.status} onChange={(e) => setScreen({ ...screen, [c.n]: { ...v, status: e.target.value as Screen } })} className={`${field} mt-0`}>{(Object.keys(SCREEN_TEXT) as Screen[]).map((s) => <option key={s} value={s}>{SCREEN_TEXT[s]}</option>)}</select></label>
                  <label><span className="sr-only">{c.name}: reason</span><input maxLength={300} value={v.reason ?? ''} onChange={(e) => setScreen({ ...screen, [c.n]: { ...v, reason: e.target.value } })} placeholder={v.status === 'included' ? 'How it’s counted (optional)' : 'Why'} className={`${field} mt-0`} /></label>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn-primary mt-3" onClick={() => void saveScreen()}>Save the categories</button>
        </details>
      )}
      {data ? <BizReport report={data} /> : <div className="h-96 rounded-[var(--radius-card)] skeleton" />}
    </div>
  );
}

export function BizReport({ report: r }: { report: Report }) {
  const t = r.totals, v = r.verification;
  const print = () => {
    document.documentElement.dataset.printing = 'report';
    const done = () => { delete document.documentElement.dataset.printing; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  const change = r.base && r.base.year !== r.year && r.base.kg > 0 ? Math.round(((t.kg - r.base.kg) / r.base.kg) * 100) : null;
  const sites = Object.entries(r.bySite).sort((a, b) => b[1] - a[1]);
  return (
    <article className="print-report panel p-5 sm:p-8 space-y-8" aria-labelledby="report-h">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="report-h" className="text-xl font-semibold text-zinc-900 sm:text-2xl dark:text-white"><FileText className={`${icon} me-2 inline-block -mt-1`} aria-hidden /><span translate="no">{r.org.name}</span>: greenhouse gas emissions {r.year}</h2>
          <p className={`mt-1 ${muted}`}>{[r.org.industry, r.org.country ? countryName(r.org.country) : null, r.org.employees ? `${r.org.employees.toLocaleString()} staff` : null].filter(Boolean).join(' · ')}{r.preparedBy ? <> · Prepared by <span translate="no">{r.preparedBy}</span></> : null}</p>
          {v && v.intact && !v.changed ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300"><BadgeCheck className="h-3.5 w-3.5" aria-hidden />Verified: {v.level} assurance by <span translate="no">{v.firm}</span></p>
          ) : v ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300"><ShieldAlert className="h-3.5 w-3.5" aria-hidden />{v.intact ? 'Changed since it was verified' : 'The verifier’s statement doesn’t match its signature'}</p>
          ) : (
            <p className="mt-2 inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">Draft for review: not independently verified</p>
          )}
        </div>
        <button type="button" onClick={print} className="print-hide btn-secondary inline-flex items-center gap-1.5"><Printer className="h-4 w-4" aria-hidden />Print or save as PDF</button>
      </header>

      {v && (
        <section aria-labelledby="r-ver" className="rounded-2xl border border-[var(--hairline)] p-4">
          <h3 id="r-ver" className={h3}>Independent verification statement</h3>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200"><span translate="no">{v.verifier}, {v.firm}</span>{v.accreditation ? <> (accredited: <span translate="no">{v.accreditation}</span>)</> : null}: {v.level} assurance under {v.standard}, scopes {v.scopes.join(' + ')}, signed {new Date(v.signedAt).toLocaleDateString()}.</p>
          <p className="mt-2 whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-200" translate="no">{v.opinion}</p>
          <p className="mt-2 break-all text-xs text-zinc-500 dark:text-zinc-400">Signature (SHA-256 over the numbers, the log and the opinion): {v.signature}</p>
        </section>
      )}

      <section aria-labelledby="r-ghg">
        <h3 id="r-ghg" className={h3}>GHG Protocol: emissions by scope</h3>
        <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            {([1, 2, 3] as const).map((s) => <div key={s} className={row}><span className={th}>{SCOPE_TEXT[s].title}: {SCOPE_TEXT[s].what.toLowerCase()}</span><span className={td}>{tonnes(t.scope[s])} · {pct(t.scope[s], t.kg)}%</span></div>)}
            <div className={row}><span className={th}>Scope 2, location-based (the grid’s average)</span><span className={td}>{tonnes(r.scope2.location)}</span></div>
            <div className={row}><span className={th}>Scope 2, market-based (your contracts and certificates)</span><span className={td}>{tonnes(r.scope2.market)}</span></div>
            <div className={row}><span className="font-semibold text-zinc-900 dark:text-white">Total, tonnes CO₂e (market-based)</span><span className={td}>{tonnes(t.kg)} ± {tonnes(t.quality.uncertaintyKg)}</span></div>
            {r.base && <div className={row}><span className={th}>Base year {r.base.year}</span><span className={td}>{tonnes(r.base.kg)}{change !== null ? ` (${change > 0 ? '+' : ''}${change}%)` : ''}</span></div>}
            {r.carbonCost !== null && <div className={row}><span className={th}>At your internal carbon price ({r.org.carbonPrice?.toLocaleString()} {r.org.currency} a tonne)</span><span className={td}>{r.carbonCost.toLocaleString()} {r.org.currency}</span></div>}
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Scope 3’s fifteen categories</p>
            {S3_CATEGORIES.map((c) => {
              const kg = r.byS3[c.n] ?? 0, sc = r.screening[c.n], status = kg > 0 ? 'included' : sc?.status ?? 'included';
              return <div key={c.n} className={row}><span className={th}>{c.n}. {c.name}{status !== 'included' || sc?.reason ? <span className="block text-xs">{SCREEN_TEXT[status]}{sc?.reason ? `: ${sc.reason}` : ''}</span> : null}</span><span className={td}>{kg > 0 ? tonnes(kg) : status === 'included' ? 'No data yet' : '–'}</span></div>;
            })}
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Operational control. Category 3 is worked out from your fuel and electricity (well-to-tank and grid losses). Gases as CO₂ equivalent with IPCC AR4 warming potentials; biogenic CO₂ from wood reported apart.</p>
      </section>

      <section aria-labelledby="r-dq">
        <h3 id="r-dq" className={h3}>Data quality</h3>
        <div className="mt-3 max-w-2xl">
          {(Object.keys(QUALITY) as Quality[]).map((q) => <div key={q} className={row}><span className={th}>{QUALITY[q].label} (±{QUALITY[q].pct}%)</span><span className={td}>{tonnes(t.quality.kg[q] ?? 0)} · {pct(t.quality.kg[q] ?? 0, t.kg)}%</span></div>)}
          <div className={row}><span className={th}>Weighted score (1 best, 5 worst)</span><span className={td}>{t.quality.score}</span></div>
          <div className={row}><span className={th}>Uncertainty of the total (root sum of squares)</span><span className={td}>± {tonnes(t.quality.uncertaintyKg)} ({pct(t.quality.uncertaintyKg, t.kg)}%)</span></div>
        </div>
      </section>

      <section aria-labelledby="r-brsr">
        <h3 id="r-brsr" className={h3}>BRSR, Principle 6 (India): essential indicators</h3>
        <div className="mt-3 max-w-2xl">
          <div className={row}><span className={th}>Total Scope 1 emissions (tCO₂e)</span><span className={td}>{tonnes(t.scope[1])}</span></div>
          <div className={row}><span className={th}>Total Scope 2 emissions (tCO₂e)</span><span className={td}>{tonnes(t.scope[2])}</span></div>
          <div className={row}><span className={th}>Scope 1 and 2 per million {r.org.currency} of turnover</span><span className={td}>{r.intensity.s12PerMillionRevenue !== null ? tonnes(r.intensity.s12PerMillionRevenue) : 'Add revenue'}</span></div>
          <div className={row}><span className={th}>Total energy consumed (GJ, fuels and electricity)</span><span className={td}>{Math.round(t.gj).toLocaleString()}</span></div>
          <div className={row}><span className={th}>Energy per million {r.org.currency} of turnover (GJ)</span><span className={td}>{r.org.revenue ? Math.round((t.gj / r.org.revenue) * 1e6).toLocaleString() : 'Add revenue'}</span></div>
          <div className={row}><span className={th}>Independent assessment by an external agency</span><span className={td}>{v && v.intact && !v.changed ? `Yes: ${v.firm}` : 'No'}</span></div>
        </div>
      </section>

      <section aria-labelledby="r-esrs">
        <h3 id="r-esrs" className={h3}>CSRD, ESRS E1 (Europe): climate</h3>
        <div className="mt-3 max-w-2xl">
          <div className={row}><span className={th}>E1-6 Gross Scope 1 (tCO₂e)</span><span className={td}>{tonnes(t.scope[1])}</span></div>
          <div className={row}><span className={th}>E1-6 Gross Scope 2, location / market (tCO₂e)</span><span className={td}>{tonnes(r.scope2.location)} / {tonnes(r.scope2.market)}</span></div>
          <div className={row}><span className={th}>E1-6 Gross Scope 3 (tCO₂e)</span><span className={td}>{tonnes(t.scope[3])}</span></div>
          <div className={row}><span className={th}>E1-6 Total, per million {r.org.currency} of net revenue</span><span className={td}>{r.intensity.perMillionRevenue !== null ? tonnes(r.intensity.perMillionRevenue) : 'Add revenue'}</span></div>
          <div className={row}><span className={th}>E1-5 Energy consumption (MWh)</span><span className={td}>{Math.round(t.gj / 3.6).toLocaleString()}</span></div>
          <div className={row}><span className={th}>E1-4 Target</span><span className={td}>{r.target ? `−${r.target.pct}% by ${r.target.targetYear} from ${r.target.baseYear}` : 'None set'}</span></div>
          <div className={row}><span className={th}>E1-3 Planned actions (this year’s cut)</span><span className={td}>{r.plan.totalKg ? `−${tonnes(r.plan.totalKg)} a year` : 'None planned'}</span></div>
          <div className={row}><span className={th}>E1-7 Removals and carbon credits (not netted)</span><span className={td}>{(r.credits.removalT + r.credits.offsetT).toLocaleString()} t</span></div>
          <div className={row}><span className={th}>E1-8 Internal carbon price</span><span className={td}>{r.org.carbonPrice ? `${r.org.carbonPrice.toLocaleString()} ${r.org.currency} a tonne` : 'None'}</span></div>
        </div>
      </section>

      {sites.length > 0 && (
        <section aria-labelledby="r-sites">
          <h3 id="r-sites" className={h3}>By site</h3>
          <div className="mt-3 max-w-2xl">{sites.map(([s, kg]) => <div key={s} className={row}><span className={th} translate="no">{s}</span><span className={td}>{tonnes(kg)}</span></div>)}</div>
        </section>
      )}

      <section aria-labelledby="r-credits">
        <h3 id="r-credits" className={h3}>Certificates, offsets and removals (reported apart)</h3>
        <div className="mt-3 max-w-2xl">
          <div className={row}><span className={th}>Energy certificates against renewable-tariff electricity</span><span className={td}>{r.credits.recMwh.toLocaleString()} of {r.credits.greenMwh.toLocaleString()} MWh{r.credits.backed ? '' : ' (not fully backed)'}</span></div>
          <div className={row}><span className={th}>Removals</span><span className={td}>{r.credits.removalT.toLocaleString()} t</span></div>
          <div className={row}><span className={th}>Offsets</span><span className={td}>{r.credits.offsetT.toLocaleString()} t</span></div>
          <div className={row}><span className={th}>Of which retired in the company’s name</span><span className={td}>{r.credits.retiredT.toLocaleString()} t</span></div>
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Never subtracted from the totals above (GHG Protocol; SBTi).</p>
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
        <p className="mt-1">Made with UniVerse Green on {new Date(r.generatedAt).toLocaleDateString()}. Factors are published averages (DESNZ/DEFRA 2024, India’s CEA, US EPA, IEA and Ember), rounded, unless a line gives its own.</p>
      </section>
    </article>
  );
}
