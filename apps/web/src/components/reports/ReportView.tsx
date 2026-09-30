'use client';

import { BadgeCheck, Building2, CalendarRange, Clock, FileCheck2, Globe2, ShieldAlert, ShieldCheck, Users } from 'lucide-react';

export interface ReportData {
  title: string; issuer: string; organization: string | null; period: { from: string; to: string }; generatedAt: string;
  totals: { verifiedHours: number; peopleReached: number; credentials: number; students: number; organizations: number };
  byOrganization: { name: string; hours: number; people: number; credentials: number; students: number }[];
  byMonth: { month: string; hours: number; credentials: number }[];
  byProject: { project: string; organization: string; hours: number; people: number; credentials: number }[];
  sdgs: { goal: number; credentials: number }[];
  evidence: { count: number; root: string };
  method: string;
}

const SDG_NAMES: Record<number, string> = {
  1: 'No poverty', 2: 'Zero hunger', 3: 'Good health and well-being', 4: 'Quality education', 5: 'Gender equality', 6: 'Clean water and sanitation',
  7: 'Affordable and clean energy', 8: 'Decent work and economic growth', 9: 'Industry, innovation and infrastructure', 10: 'Reduced inequalities',
  11: 'Sustainable cities and communities', 12: 'Responsible consumption and production', 13: 'Climate action', 14: 'Life below water', 15: 'Life on land',
  16: 'Peace, justice and strong institutions', 17: 'Partnerships for the goals',
};
const fmtMonth = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** The figures of an impact report (used for the admin preview and the public report page). */
export function ReportView({ d, verification }: { d: ReportData; verification?: { verified: boolean; signatureValid: boolean; matches: boolean } }) {
  const maxMonth = Math.max(1, ...d.byMonth.map((m) => m.hours));
  return (
    <div className="space-y-5 print:space-y-4">
      <header className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-7 print:border-zinc-300">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600">Verified impact report</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white">{d.title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300 flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><Building2 className="w-4 h-4" /> {d.organization ?? 'All partner organisations'}</span>
          <span className="inline-flex items-center gap-1.5"><CalendarRange className="w-4 h-4" /> {d.period.from} – {d.period.to}</span>
        </p>
        {verification && (
          verification.verified ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><ShieldCheck className="w-4 h-4" /> Signature valid — figures unchanged since {new Date(d.generatedAt).toLocaleDateString()}</p>
          ) : (
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-700 dark:text-rose-300"><ShieldAlert className="w-4 h-4" /> {verification.signatureValid ? 'The figures don’t match the signed snapshot' : 'The signature couldn’t be verified'}</p>
          )
        )}
        <dl className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { icon: Clock, label: 'Verified hours', value: d.totals.verifiedHours },
            { icon: Users, label: 'People reached', value: d.totals.peopleReached },
            { icon: FileCheck2, label: 'Verified credentials', value: d.totals.credentials },
            { icon: BadgeCheck, label: 'Students involved', value: d.totals.students },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/[0.06] p-3">
              <dt className="text-[11px] text-zinc-500 flex items-center gap-1.5"><s.icon className="w-3.5 h-3.5" /> {s.label}</dt>
              <dd className="text-2xl font-black text-zinc-900 dark:text-white">{s.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </header>

      {d.byMonth.length > 0 && (
        <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 break-inside-avoid">
          <h2 className="font-bold text-zinc-900 dark:text-white">Verified hours by month</h2>
          <div className="mt-4 flex items-end gap-1.5 h-40" role="img" aria-label={`Verified hours by month: ${d.byMonth.map((m) => `${fmtMonth(m.month)} ${m.hours}`).join(', ')}`}>
            {d.byMonth.map((m) => (
              <div key={m.month} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                <span className="text-[10px] text-zinc-500">{m.hours}</span>
                <div className="w-full max-w-10 rounded-t-md bg-emerald-500/80" style={{ height: `${Math.max(3, (m.hours / maxMonth) * 120)}px` }} />
                <span className="text-[10px] text-zinc-500 truncate w-full text-center">{fmtMonth(m.month)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 break-inside-avoid">
        <h2 className="font-bold text-zinc-900 dark:text-white">By organisation</h2>
        {d.byOrganization.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No verified credentials in this period.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm min-w-[28rem]">
              <thead><tr className="text-left text-xs text-zinc-500"><th className="py-2 font-semibold">Organisation</th><th className="py-2 font-semibold text-right">Hours</th><th className="py-2 font-semibold text-right">People</th><th className="py-2 font-semibold text-right">Credentials</th><th className="py-2 font-semibold text-right">Students</th></tr></thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                {d.byOrganization.map((o) => <tr key={o.name} className="text-zinc-800 dark:text-zinc-200"><td className="py-2 pr-3">{o.name}</td><td className="py-2 text-right tabular-nums">{o.hours}</td><td className="py-2 text-right tabular-nums">{o.people}</td><td className="py-2 text-right tabular-nums">{o.credentials}</td><td className="py-2 text-right tabular-nums">{o.students}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {d.byProject.length > 0 && (
        <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 break-inside-avoid">
          <h2 className="font-bold text-zinc-900 dark:text-white">Projects</h2>
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {d.byProject.map((p) => (
              <li key={p.project + p.organization} className="py-2.5 flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="flex-1 min-w-[12rem] text-zinc-800 dark:text-zinc-200">{p.project} <span className="text-zinc-500">· {p.organization}</span></span>
                <span className="text-xs text-zinc-500 tabular-nums">{p.hours} h · {p.people} people · {p.credentials} credential{p.credentials === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.sdgs.length > 0 && (
        <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 break-inside-avoid">
          <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Globe2 className="w-5 h-5 text-sky-500" /> UN Sustainable Development Goals</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {d.sdgs.map((s) => <li key={s.goal} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300">SDG {s.goal} · {SDG_NAMES[s.goal]} · {s.credentials}</li>)}
          </ul>
        </section>
      )}

      <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 text-sm text-zinc-600 dark:text-zinc-300 space-y-3 break-inside-avoid">
        <h2 className="font-bold text-zinc-900 dark:text-white">Method and use in sustainability reporting</h2>
        <p>{d.method}</p>
        <p>These figures can support the social disclosures in a sustainability statement — for example community engagement under ESRS S3 (Affected communities) or entity-specific metrics under the CSRD — and the evidence can be sampled by your auditor. This report is not itself an assurance engagement.</p>
        <p className="text-xs text-zinc-500 break-all">Evidence: {d.evidence.count} credential fingerprints · root {d.evidence.root}</p>
        <p className="text-xs text-zinc-500">Issued by {d.issuer} · generated {new Date(d.generatedAt).toLocaleString()}</p>
      </section>
    </div>
  );
}
