'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Building2, Factory, Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { InstrumentBoard, type InstrumentCell } from '@/components/instruments/Board';
import { Facts, Meter, Spark } from '@/components/instruments/parts';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { CURRENCIES } from '@/lib/carbon-ledger';
import { Bar } from './Bar';
import { COUNTRIES, MONTHS, SCOPE_TEXT, catLabel, change, field, h3, icon, label, muted, pct, tonnes, type BizOrgRow, type BizOverview } from './shared';

// Green → Business (M269–M281): a company measures its carbon footprint the way the GHG Protocol counts it, and a
// consultancy does it for its clients. The overview, then a section each: the ledger (with imports and bills read by
// AI), suppliers (and Trace's passports), staff commuting, the reduction planner, certificates and offsets, independent
// verification, the report, and the team with its plan, auditor link and log. Each section loads only when opened. A
// verifier sees only what they review.

const wait = () => <div className="h-72 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />;
const SECTIONS = {
  ledger: dynamic(() => import('./BizLedger').then((m) => m.BizLedger), { loading: wait }),
  suppliers: dynamic(() => import('./BizSuppliers').then((m) => m.BizSuppliers), { loading: wait }),
  staff: dynamic(() => import('./BizStaff').then((m) => m.BizStaff), { loading: wait }),
  planner: dynamic(() => import('./BizPlanner').then((m) => m.BizPlanner), { loading: wait }),
  report: dynamic(() => import('./BizReport').then((m) => m.BizReportSection), { loading: wait }),
  credits: dynamic(() => import('./BizCredits').then((m) => m.BizCredits), { loading: wait }),
  verify: dynamic(() => import('./BizVerify').then((m) => m.BizVerify), { loading: wait }),
  team: dynamic(() => import('./BizLog').then((m) => m.BizLog), { loading: wait }),
  clients: dynamic(() => import('./BizClients').then((m) => m.BizClients), { loading: wait }),
};
type Section = 'overview' | keyof typeof SECTIONS;
const LABELS: Record<Section, string> = { overview: 'Overview', clients: 'Clients', ledger: 'Ledger', suppliers: 'Suppliers', staff: 'Staff', planner: 'Planner', credits: 'Certificates & offsets', verify: 'Verify', report: 'Report', team: 'Team & plan' };
const PICK = 'uv-green-biz';

export function GreenBusiness() {
  const { data, mutate } = useSWR<{ orgs: BizOrgRow[] }>('/green/biz', fetcher);
  // The company chosen last time on this device (the first render shows the loading block, so no mismatch).
  const [chosen, setChosen] = useState<string | null>(() => { try { return typeof window === 'undefined' ? null : localStorage.getItem(PICK); } catch { return null; } });
  const [adding, setAdding] = useState(false);
  const orgs = data?.orgs ?? [];
  const row = orgs.find((o) => o.id === chosen) ?? orgs[0];
  const choose = (id: string) => { setChosen(id); try { localStorage.setItem(PICK, id); } catch { /* fine */ } };

  if (!data) return wait();
  if (!orgs.length || adding) return <NewOrg first={!orgs.length} onDone={async (id) => { await mutate(); if (id) choose(id); setAdding(false); }} onCancel={orgs.length ? () => setAdding(false) : undefined} />;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${label} min-w-[14rem]`}>Company
          <select value={row.id} onChange={(e) => choose(e.target.value)} className={field}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}{o.kind === 'consultancy' ? ' (consultancy)' : o.consultancy ? ` · client of ${o.consultancy}` : ''}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setAdding(true)} className="btn-secondary inline-flex items-center gap-1.5"><Plus className="h-4 w-4" aria-hidden />New company</button>
      </div>
      <Company key={row.id} row={row} onChanged={() => void mutate()} onPick={choose} />
    </div>
  );
}

function Company({ row, onChanged, onPick }: { row: BizOrgRow; onChanged: () => void; onPick: (id: string) => void }) {
  const sp = useSearchParams(), router = useRouter(), path = usePathname();
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, mutate } = useSWR<BizOverview>(`/green/biz/${row.id}?year=${year}`, fetcher, { keepPreviousData: true });
  const sections: Section[] = row.role === 'verifier' ? ['verify', 'overview', 'ledger', 'report']
    : [...(row.kind === 'consultancy' ? (['clients'] as const) : []), 'overview', 'ledger', 'suppliers', 'staff', 'planner', 'credits', 'verify', 'report', 'team'];
  const raw = sp.get('b') as Section | null, section: Section = raw && sections.includes(raw) ? raw : sections[0];
  const go = (s: Section) => { const q = new URLSearchParams(sp.toString()); q.set('b', s); router.replace(`${path}?${q}`, { scroll: false }); };
  const years = [...new Set([new Date().getFullYear(), ...(data?.years ?? [])])].sort((a, b) => b - a);
  const refresh = () => { void mutate(); onChanged(); };
  const View = section === 'overview' ? null : SECTIONS[section];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented className="max-w-full overflow-x-auto" label="Section" value={section} onChange={go} segments={sections.map((s) => ({ value: s, label: LABELS[s] }))} />
        <label className="ms-auto flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/[0.05] dark:text-white">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </label>
      </div>
      {!data ? wait() : View ? <View org={data.org} role={data.role} year={year} overview={data} onChanged={refresh} onPick={onPick} /> : <Overview data={data} go={go} />}
    </div>
  );
}

function Overview({ data, go }: { data: BizOverview; go: (s: Section) => void }) {
  const t = data.totals, b = data.before, d = change(t.kg, b.kg);
  const months = MONTHS(data.year).map((m) => (t.byMonth[m] ?? 0) / 1000);
  const top = Object.entries(t.byCategory).sort((x, y) => y[1] - x[1]).slice(0, 6);
  const measured = pct(t.quality.kg.measured ?? 0, t.kg), sites = Object.entries(t.bySite).sort((x, y) => y[1] - x[1]);
  const cells: InstrumentCell[] = [
    {
      id: 'total', label: `Footprint ${data.year}`, value: t.kg / 1000, digits: 1, unit: 't CO₂e',
      note: `± ${tonnes(t.quality.uncertaintyKg)} · ${d === null ? 'no year before' : `${d <= 0 ? '↓' : '↑'} ${Math.abs(d)}% on ${data.year - 1}`}`,
      body: <Spark values={months} />,
      detail: { title: `${data.org.name}: tonnes CO₂e a month`, description: 'Every scope, by the month each line covers, with the worked-out upstream.', series: months, labels: MONTHS(data.year).map((m) => m.slice(5)), before: MONTHS(data.year - 1).map((m) => (b.byMonth[m] ?? 0) / 1000) },
    },
    ...([1, 2, 3] as const).map((s) => ({
      id: `s${s}`, label: SCOPE_TEXT[s].title, value: t.scope[s] / 1000, digits: 1, unit: 't',
      note: s === 2 ? `Market-based; ${tonnes(t.scope2.location)} by the grid` : SCOPE_TEXT[s].what,
      body: <Meter pct={pct(t.scope[s], t.kg)} />,
    })),
    {
      id: 'quality', label: 'Data quality', value: t.quality.score, digits: 1, unit: 'of 5 (1 best)', warn: t.quality.score > 3.5,
      note: `${measured}% from meters and invoices`,
      body: <Meter pct={measured} />,
    },
    {
      id: 'intensity', label: 'Per person', value: data.org.employees ? t.kg / 1000 / data.org.employees : 0, digits: 2, unit: 't each',
      note: data.org.employees ? `${data.org.employees.toLocaleString()} staff` : 'Add your headcount in Report',
      // Six cells, two even rows: the data behind it sits here as facts.
      body: <Facts rows={[['Energy used', `${Math.round(t.gj).toLocaleString()} GJ`], ['Suppliers answered', `${data.counts.answered} of ${data.counts.suppliers}`], ['Staff commute answers', String(data.counts.commutes)], ...(data.org.carbonPrice ? [['Carbon cost', `${Math.round((t.kg / 1000) * data.org.carbonPrice).toLocaleString()} ${data.org.currency}`] as [string, string]] : [['Lines this year', String(data.counts.lines)] as [string, string]])]} />,
    },
  ];
  const linkBtn = 'font-semibold text-emerald-700 underline dark:text-emerald-300';
  return (
    <div className="space-y-6">
      {data.billing.on && !data.billing.pro && (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">Free plan: {data.counts.lines} of {data.billing.limits.lines} lines for {data.year}. AI bills, verification, the auditor’s link and Trace passports come with Pro. <button type="button" className="font-semibold underline" onClick={() => go('team')}>See plans</button></p>
      )}
      <InstrumentBoard icon={Factory} title={data.org.name} subtitle={data.consultancy ? `Managed by ${data.consultancy}` : 'GHG Protocol, scopes 1–3'} cells={cells} live={false} storageKey={`green-biz-${data.org.id}`} />
      {t.kg === 0 ? (
        <section className="panel p-5">
          <h3 className={h3}><Building2 className={icon} aria-hidden />Start with your bills</h3>
          <p className={`mt-2 ${muted}`}>Add a month of electricity, the fuel your vans used and last year’s flights. Each line shows the factor it used and where it comes from; you can type in your supplier’s own figure instead. The upstream of your fuel and power (scope 3, category 3) is worked out for you.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => go('ledger')}>Add the first lines</button>
            <button type="button" className="btn-secondary" onClick={() => go('suppliers')}>Ask your suppliers</button>
            <button type="button" className="btn-secondary" onClick={() => go('staff')}>Survey staff commuting</button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="panel p-5" aria-labelledby="biz-top">
            <h3 id="biz-top" className={h3}>Where it comes from</h3>
            <ul className="mt-3 space-y-2.5">
              {top.map(([cat, kg]) => (
                <li key={cat}>
                  <div className="flex justify-between gap-3 text-sm"><span className="text-zinc-700 dark:text-zinc-200">{catLabel(cat)}</span><span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{tonnes(kg)} · {pct(kg, t.kg)}%</span></div>
                  <Bar value={t.kg ? kg / t.kg : 0} />
                </li>
              ))}
            </ul>
            <p className={`mt-4 ${muted}`}>Plan cuts in <button type="button" className={linkBtn} onClick={() => go('planner')}>Planner</button>; have it checked in <button type="button" className={linkBtn} onClick={() => go('verify')}>Verify</button>; send it from <button type="button" className={linkBtn} onClick={() => go('report')}>Report</button>.</p>
          </section>
          <div className="space-y-6">
            <Benchmark orgId={data.org.id} year={data.year} industry={data.org.industry} />
            {sites.length > 0 && (
              <section className="panel p-5" aria-labelledby="biz-sites">
                <h3 id="biz-sites" className={h3}>By site</h3>
                <ul className="mt-3 space-y-2.5">{sites.map(([site, kg]) => <li key={site}><div className="flex justify-between gap-3 text-sm"><span className="text-zinc-700 dark:text-zinc-200" translate="no">{site}</span><span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{tonnes(kg)}</span></div><Bar value={t.kg ? kg / t.kg : 0} tone="bg-sky-600" /></li>)}</ul>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type Quart = { p25: number; median: number; p75: number; mine: number | null; rank: number | null };
/** M279: the company against others in its industry (quartiles, five at least), never a name or a number of theirs. */
function Benchmark({ orgId, year, industry }: { orgId: string; year: number; industry: string | null }) {
  const { data } = useSWR<{ industry: string | null; peers: number; enough: boolean; perPerson?: Quart | null; perMusd?: Quart | null }>(`/green/biz/${orgId}/benchmark?year=${year}`, fetcher, { keepPreviousData: true });
  const row = (title: string, q: Quart | null | undefined, unit: string) => q && (
    <div className="mt-3">
      <div className="flex justify-between gap-3 text-sm"><span className="text-zinc-700 dark:text-zinc-200">{title}</span><span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{q.mine === null ? '–' : `${q.mine} ${unit}`}</span></div>
      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">Middle half {q.p25}–{q.p75} {unit}, median {q.median}{q.rank !== null ? ` · ${q.rank <= 50 ? `lower than ${100 - q.rank}%` : `higher than ${q.rank}%`} of them` : ''}</p>
      {q.rank !== null && <Bar value={q.rank / 100} tone={q.rank <= 50 ? 'bg-emerald-600' : 'bg-amber-500'} />}
    </div>
  );
  return (
    <section className="panel p-5" aria-labelledby="biz-bench">
      <h3 id="biz-bench" className={h3}>Against similar companies</h3>
      {!industry ? <p className={`mt-2 ${muted}`}>Add your industry in Report to compare with others.</p>
        : !data ? <div className="mt-3 h-16 rounded-xl skeleton" />
        : !data.enough ? <p className={`mt-2 ${muted}`}>{data.peers} other {data.peers === 1 ? 'company' : 'companies'} in “{industry}” {data.peers === 1 ? 'has' : 'have'} data for {year}: comparisons show from five, so nobody can be picked out.</p>
        : <>{<p className={`mt-1 ${muted}`}>{data.peers} companies in “{industry}”, {year}.</p>}{row('Tonnes per person', data.perPerson, 't')}{row('Tonnes per million US$ of revenue', data.perMusd, 't')}</>}
    </section>
  );
}

/** A new company or consultancy (or, from a consultancy's Clients, a client). */
export function NewOrg({ first, consultancyId, onDone, onCancel }: { first?: boolean; consultancyId?: string; onDone: (id?: string) => void | Promise<void>; onCancel?: () => void }) {
  const [f, setF] = useState({ name: '', kind: 'company', country: 'IN', industry: '', employees: '', revenue: '', currency: 'INR' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api.post<{ id: string }>('/green/biz', { ...f, kind: consultancyId ? 'company' : f.kind, consultancyId, employees: f.employees || null, revenue: f.revenue || null });
      toast.success(consultancyId ? 'Client added.' : 'Ready: add your first lines.');
      await onDone(r.data.id);
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t save that.')); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void save(e)} className="panel p-5 space-y-4" aria-labelledby="biz-new">
      <div>
        <h3 id="biz-new" className={h3}><Factory className={icon} aria-hidden />{consultancyId ? 'A new client' : first ? 'Measure your company’s carbon footprint' : 'A new company'}</h3>
        {first && <p className={`mt-2 max-w-3xl ${muted}`}>Scope 1, 2 and 3, the way the GHG Protocol counts it: your fuel and electricity, travel and freight, what you buy and what your suppliers report, how your staff get to work. Then a plan to cut it, and a report with every factor’s source and a log an auditor can check. Consultancies can run it for their clients.</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={label}>Name<input required maxLength={80} value={f.name} onChange={set('name')} className={field} /></label>
        {!consultancyId && <label className={label}>This is<select value={f.kind} onChange={set('kind')} className={field}><option value="company">A company measuring itself</option><option value="consultancy">A consultancy with clients</option></select></label>}
        <label className={label}>Country (its grid electricity)<select value={f.country} onChange={set('country')} className={field}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
        <label className={label}>Industry<input maxLength={60} value={f.industry} onChange={set('industry')} placeholder="e.g. Textiles" className={field} /></label>
        <label className={label}>Staff<input type="number" min={0} inputMode="numeric" value={f.employees} onChange={set('employees')} className={field} /></label>
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <label className={label}>Yearly revenue<input type="number" min={0} inputMode="decimal" value={f.revenue} onChange={set('revenue')} className={field} /></label>
          <label className={label}>Currency<select value={f.currency} onChange={set('currency')} className={field}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !f.name.trim()} className="btn-primary">{consultancyId ? 'Add client' : 'Start'}</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>}
      </div>
    </form>
  );
}
