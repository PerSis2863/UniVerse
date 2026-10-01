'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Copy, Eye, EyeOff, ExternalLink, FileCheck2, Loader2, Sparkles } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { ReportView, type ReportData } from '@/components/reports/ReportView';
import { SearchBox, matchesQuery, RoleChip, fmtDate } from '@/components/impact/AdminPeople';

interface ListResp {
  reports: { id: string; slug: string; url: string; title: string; organization: string | null; periodStart: string; periodEnd: string; isPublic: boolean; views: number; createdAt: string; createdByName: string }[];
  organizations: { name: string; credentials: number }[];
  holders?: {
    id: string; title: string; organization: string; projectName: string; hoursCompleted: number; peopleImpacted: number;
    issuedAt: string; verifiedByName: string | null; user: { id: string; name: string; email: string; role: string } | null;
  }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ImpactReportsPage() {
  const { data, mutate } = useSWR<ListResp>('/api/impact-reports', authedJson);
  const year = new Date().getFullYear();
  const [form, setForm] = useState({ title: `Verified impact report ${year}`, organization: '', from: `${year}-01-01`, to: iso(new Date()) });
  const [preview, setPreview] = useState<ReportData | null>(null);
  const [busy, setBusy] = useState<'preview' | 'issue' | null>(null);
  const [q, setQ] = useState('');
  const reports = useMemo(() => (data?.reports ?? []).filter((r) => matchesQuery(q, r.title, r.organization ?? 'All organisations', r.createdByName, r.isPublic ? 'public' : 'withdrawn')), [data, q]);
  const holders = useMemo(() => (data?.holders ?? []).filter((h) => matchesQuery(q, h.user?.name, h.user?.email, h.title, h.organization, h.projectName, h.verifiedByName)), [data, q]);

  const run = async (kind: 'preview' | 'issue') => {
    setBusy(kind);
    try {
      if (kind === 'preview') setPreview(await authedJson<ReportData>(`/api/impact-reports?${new URLSearchParams({ preview: '1', ...form })}`));
      else {
        const r = await authedJson<{ url: string }>('/api/impact-reports', { method: 'POST', body: JSON.stringify(form) });
        await navigator.clipboard?.writeText(r.url).catch(() => {});
        toast.success('Report issued — link copied', { action: { label: 'Open', onClick: () => window.open(r.url, '_blank', 'noopener') } });
        setPreview(null); await mutate();
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const toggle = async (id: string, isPublic: boolean) => {
    try { await authedJson(`/api/impact-reports/${id}`, { method: 'PATCH', body: JSON.stringify({ isPublic }) }); toast.success(isPublic ? 'Report published again' : 'Report withdrawn — its link no longer works'); await mutate(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <Topbar title="Verified impact reports" subtitle="Signed reports of verified student impact for sponsors and partners (CSRD-ready)" />
      <div className="p-4 md:p-8 max-w-6xl mx-auto min-w-0 w-full space-y-6">
      <SearchBox
        value={q}
        onChange={setQ}
        placeholder="Search reports, organisations, students, emails or verifying admins…"
        summary={data && q ? `${reports.length} of ${data.reports.length} reports · ${holders.length} of ${data.holders?.length ?? 0} credential holders` : undefined}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] gap-6 items-start min-w-0 w-full">
        <aside className="space-y-4 lg:sticky lg:top-4">
          <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-3">
            <p className="font-bold text-zinc-900 dark:text-white">New report</p>
            <label className="block"><span className="text-xs font-semibold text-zinc-500">Title</span>
              <input value={form.title} maxLength={140} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" /></label>
            <label className="block"><span className="text-xs font-semibold text-zinc-500">Organisation (sponsor / partner)</span>
              <select value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} className="mt-1 w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-zinc-900 dark:text-white">
                <option value="">All organisations</option>
                {data?.organizations.map((o) => <option key={o.name} value={o.name}>{o.name} ({o.credentials})</option>)}
              </select></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-xs font-semibold text-zinc-500">From</span><input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className="mt-1 w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-2 py-2 text-sm text-zinc-900 dark:text-white" /></label>
              <label className="block"><span className="text-xs font-semibold text-zinc-500">To</span><input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className="mt-1 w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-2 py-2 text-sm text-zinc-900 dark:text-white" /></label>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => run('preview')} disabled={!!busy} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm font-semibold text-zinc-700 dark:text-zinc-200 disabled:opacity-60">{busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Preview</button>
              <button onClick={() => run('issue')} disabled={!!busy} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60">{busy === 'issue' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />} Issue & sign</button>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">Counts only verified, signed credentials. Issuing freezes the figures and signs them; the sponsor gets a link that shows whether anything was changed. No student names are included.</p>
          </section>

          <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
            <p className="font-bold text-zinc-900 dark:text-white">Issued reports</p>
            {!data ? <Loader2 className="mt-3 w-5 h-5 animate-spin text-indigo-400" /> : data.reports.length === 0 ? <p className="mt-2 text-sm text-zinc-500">None yet.</p> : reports.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No reports match “{q}”.</p> : (
              <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/[0.06]">
                {reports.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{r.title}</p>
                    <p className="text-[11px] text-zinc-500">{r.organization ?? 'All organisations'} · {r.periodStart.slice(0, 10)} – {r.periodEnd.slice(0, 10)} · {r.views} view{r.views === 1 ? '' : 's'}{r.isPublic ? '' : ' · withdrawn'}</p>
                    <p className="text-[11px] text-zinc-500">Issued by <span className="font-medium text-zinc-700 dark:text-zinc-300">{r.createdByName}</span>{fmtDate(r.createdAt) ? ` on ${fmtDate(r.createdAt)}` : ''}</p>
                    <div className="mt-1.5 flex gap-3">
                      {r.isPublic && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-indigo-500 inline-flex items-center gap-1">Open <ExternalLink className="w-3 h-3" /></a>}
                      {r.isPublic && <button onClick={() => navigator.clipboard.writeText(r.url).then(() => toast.success('Link copied'))} className="text-xs font-semibold text-zinc-500 inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Copy link</button>}
                      <button onClick={() => toggle(r.id, !r.isPublic)} className="text-xs font-semibold text-zinc-500 inline-flex items-center gap-1">{r.isPublic ? <><EyeOff className="w-3 h-3" /> Withdraw</> : <><Eye className="w-3 h-3" /> Publish</>}</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <div className="min-w-0">
          {preview ? <ReportView d={preview} /> : (
            <div className="rounded-3xl border border-dashed border-zinc-300 dark:border-white/15 p-10 text-center">
              <Sparkles className="w-10 h-10 mx-auto text-emerald-500" />
              <p className="mt-2 font-bold text-zinc-900 dark:text-white">Preview a report</p>
              <p className="text-sm text-zinc-500 max-w-md mx-auto">Pick a sponsor or partner and a period, then preview the figures before you issue and sign it.</p>
            </div>
          )}
        </div>
      </div>

      <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
        <div className="p-5 border-b border-zinc-100 dark:border-white/[0.06]">
          <p className="font-bold text-zinc-900 dark:text-white">Verified credential holders</p>
          <p className="text-xs text-zinc-500 mt-0.5">For your review only — issued reports never include names. The latest 100 signed, non-revoked credentials that feed the figures.</p>
        </div>
        {!data ? (
          <div className="p-6"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>
        ) : !data.holders ? (
          <p className="p-5 text-sm text-zinc-500">Credential holders could not be loaded.</p>
        ) : data.holders.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">No verified credentials have been issued yet.</p>
        ) : holders.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">No credential holders match “{q}”.</p>
        ) : (
          <>
            <ul className="md:hidden divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {holders.map((h) => (
                <li key={h.id} className="p-4 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">{h.user?.name ?? 'Deleted account'}</p>
                    <RoleChip role={h.user?.role} />
                  </div>
                  {h.user?.email && <p className="text-xs text-zinc-500 break-all">{h.user.email}</p>}
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">{h.title}</p>
                  <p className="text-[11px] text-zinc-500">{h.organization} — {h.projectName} · {h.hoursCompleted} h · {h.peopleImpacted.toLocaleString()} people</p>
                  <p className="text-[11px] text-zinc-500">{fmtDate(h.issuedAt) ?? '—'}{h.verifiedByName ? ` · verified by ${h.verifiedByName}` : ''}</p>
                </li>
              ))}
            </ul>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-500 bg-zinc-50 dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Student</th>
                    <th className="px-3 py-2.5 font-semibold">Credential</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Hours</th>
                    <th className="px-3 py-2.5 font-semibold text-right">People</th>
                    <th className="px-3 py-2.5 font-semibold">Issued</th>
                    <th className="px-5 py-2.5 font-semibold">Verified by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                  {holders.map((h) => (
                    <tr key={h.id} className="align-top">
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-zinc-900 dark:text-white">{h.user?.name ?? 'Deleted account'}</span><RoleChip role={h.user?.role} /></div>
                        {h.user?.email && <a href={`mailto:${h.user.email}`} className="text-xs text-zinc-500 hover:text-indigo-500">{h.user.email}</a>}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-zinc-800 dark:text-zinc-200">{h.title}</p>
                        <p className="text-xs text-zinc-500">{h.organization} — {h.projectName}</p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{h.hoursCompleted}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{h.peopleImpacted.toLocaleString()}</td>
                      <td className="px-3 py-3 text-xs text-zinc-500 whitespace-nowrap">{fmtDate(h.issuedAt) ?? '—'}</td>
                      <td className="px-5 py-3 text-xs text-zinc-600 dark:text-zinc-400">{h.verifiedByName ?? 'Not recorded'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      </div>
    </>
  );
}
