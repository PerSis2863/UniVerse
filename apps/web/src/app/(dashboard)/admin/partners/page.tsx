'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from '@/components/ui/Link';
import { toast } from 'sonner';
import { ExternalLink, Handshake, Loader2, Plus, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { fetcher } from '@/lib/fetcher';
import { api } from '@/lib/api';
import { safeHref } from '@/lib/safe-href';
import { SearchBox, matchesQuery, fmtDate, shownSummary } from '@/components/impact/AdminPeople';

type Partner = { id: string; name: string; type: string; country?: string | null; websiteUrl?: string | null };
type Partnership = {
  id: string; title: string; description: string | null; startDate: string | null; endDate: string | null; isActive: boolean; createdAt?: string;
  partner: Partner; company: { name: string; sector?: string | null; location?: string | null; websiteUrl?: string | null } | null;
};
const TYPE_LABEL: Record<string, string> = { ACADEMIC: 'University / college', NGO: 'NGO / non-profit', CORPORATE: 'Company', GOVERNMENT: 'Government body' };

const input = 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';

export default function SponsorPortalPage() {
  const { data: partnerships, isLoading, mutate } = useSWR<Partnership[]>('/partners/partnerships', fetcher);
  const { data: partners } = useSWR<Partner[]>('/partners', fetcher);
  const [form, setForm] = useState<{ partnerId: string; title: string; description: string; startDate: string; endDate: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const all = useMemo(() => (Array.isArray(partnerships) ? partnerships : []), [partnerships]);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'active' | 'ended'>('all');
  const list = useMemo(
    () => all.filter((p) =>
      (show === 'all' || (show === 'active' ? p.isActive : !p.isActive)) &&
      matchesQuery(q, p.title, p.description, p.partner?.name, TYPE_LABEL[p.partner?.type] ?? p.partner?.type, p.partner?.country, p.company?.name, p.company?.sector, p.company?.location, p.isActive ? 'active' : 'ended')),
    [all, q, show],
  );
  const activeCount = all.filter((p) => p.isActive).length;

  const save = async () => {
    if (!form?.partnerId || !form.title.trim()) return;
    setBusy(true);
    try {
      await api.post('/partners/partnerships', {
        partnerId: form.partnerId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      });
      toast.success('Partnership added');
      setForm(null);
      mutate();
    } catch {
      toast.error('Could not save the partnership.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Topbar title="Sponsor & Partner Portal" subtitle="Sponsorships and agreements with your partner organizations"
        rightNode={<button onClick={() => setForm({ partnerId: partners?.[0]?.id ?? '', title: '', description: '', startDate: '', endDate: '' })} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> New partnership</button>} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          {form && (
            <div className="rounded-3xl border border-indigo-200/60 dark:border-indigo-400/20 bg-indigo-50/50 dark:bg-indigo-500/[0.05] p-5 space-y-3">
              <div className="flex items-center justify-between"><p className="font-bold text-zinc-900 dark:text-white">New partnership</p><button onClick={() => setForm(null)} aria-label="Cancel"><X className="w-4 h-4 text-zinc-500" /></button></div>
              {!partners?.length ? (
                <p className="text-sm text-zinc-500">Add a partner organization first on <Link href="/admin/partnerships" className="text-indigo-500 font-semibold">Partner Institutions</Link>.</p>
              ) : (
                <>
                  <select className={input} value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input className={input} placeholder="Title, e.g. 2026 Scholarship Sponsorship" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  <textarea className={`${input} min-h-[80px]`} placeholder="What the partnership covers (optional)" value={form.description} maxLength={1000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-zinc-500">Start<input type="date" className={input} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
                    <label className="text-xs text-zinc-500">End<input type="date" className={input} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
                  </div>
                  <button onClick={save} disabled={busy || !form.title.trim()} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
                </>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="h-40 rounded-3xl skeleton" />
          ) : all.length === 0 ? (
            <FeatureGuide
              icon={Handshake}
              title="Track every sponsorship and agreement"
              description="Record what each partner organization supports — scholarships, events, internships or projects — with start and end dates, all in one place."
              steps={['Add partner organizations under Partner Institutions', 'Create a partnership with its title and dates', 'Keep track of what is active and what is ending']}
              example={<div><ExampleRow title="Merit Scholarship Fund" meta="Acme Foundation · Jan–Dec 2026" right="Active" /><ExampleRow title="Hackathon Sponsorship" meta="Greenline Energy · Nov 2026" right="Active" accent="from-emerald-500 to-teal-500" /></div>}
              action={{ label: 'New partnership', onClick: () => setForm({ partnerId: partners?.[0]?.id ?? '', title: '', description: '', startDate: '', endDate: '' }) }}
            />
          ) : (
            <div className="space-y-3">
              <SearchBox value={q} onChange={setQ} placeholder="Search partnerships, partners, companies or countries…" summary={shownSummary(list.length, all.length, 'partnership')} />
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
                {([['all', `All (${all.length})`], ['active', `Active (${activeCount})`], ['ended', `Ended (${all.length - activeCount})`]] as const).map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={show === k} onClick={() => setShow(k)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${show === k ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.05]'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {list.length === 0 && <p className="p-6 text-center text-sm text-zinc-500">No partnerships match{q ? ` “${q}”` : ' this filter'}.</p>}
              {list.map((p) => {
                const period = fmtDate(p.startDate) ? `${fmtDate(p.startDate)}${fmtDate(p.endDate) ? ` – ${fmtDate(p.endDate)}` : ' – open-ended'}` : fmtDate(p.endDate) ? `Until ${fmtDate(p.endDate)}` : null;
                return (
                  <div key={p.id} className="p-4 sm:p-5 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <p className="font-bold text-zinc-900 dark:text-white">{p.title}</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{p.partner?.name ?? 'Unknown partner'}</span>
                        {p.partner?.type ? ` · ${TYPE_LABEL[p.partner.type] ?? p.partner.type}` : ''}
                        {p.partner?.country ? ` · ${p.partner.country}` : ''}
                        {p.partner?.websiteUrl && (
                          <a href={safeHref(p.partner.websiteUrl)} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-indigo-500 hover:text-indigo-400">Website <ExternalLink className="w-3 h-3" /></a>
                        )}
                      </p>
                      {p.company && (
                        <p className="text-xs text-zinc-500">Company: <span className="text-zinc-700 dark:text-zinc-300">{p.company.name}</span>{[p.company.sector, p.company.location].filter(Boolean).length ? ` · ${[p.company.sector, p.company.location].filter(Boolean).join(' · ')}` : ''}</p>
                      )}
                      <p className="text-xs text-zinc-500">{[period, fmtDate(p.createdAt) ? `Recorded ${fmtDate(p.createdAt)}` : null].filter(Boolean).join(' · ') || 'No dates recorded'}</p>
                      {p.description && <p className="text-sm text-zinc-600 dark:text-zinc-400 pt-0.5">{p.description}</p>}
                    </div>
                    <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${p.isActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-zinc-500/10 text-zinc-500'}`}>{p.isActive ? 'Active' : 'Ended'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
