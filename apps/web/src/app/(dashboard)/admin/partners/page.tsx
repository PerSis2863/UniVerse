'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from '@/components/ui/Link';
import { toast } from 'sonner';
import { Handshake, Loader2, Plus, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { fetcher } from '@/lib/fetcher';
import { api } from '@/lib/api';

type Partner = { id: string; name: string; type: string };
type Partnership = { id: string; title: string; description: string | null; startDate: string | null; endDate: string | null; isActive: boolean; partner: Partner; company: { name: string } | null };

const input = 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : null);

export default function SponsorPortalPage() {
  const { data: partnerships, isLoading, mutate } = useSWR<Partnership[]>('/partners/partnerships', fetcher);
  const { data: partners } = useSWR<Partner[]>('/partners', fetcher);
  const [form, setForm] = useState<{ partnerId: string; title: string; description: string; startDate: string; endDate: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = Array.isArray(partnerships) ? partnerships : [];

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
        rightNode={<button onClick={() => setForm({ partnerId: partners?.[0]?.id ?? '', title: '', description: '', startDate: '', endDate: '' })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"><Plus className="w-4 h-4" /> New partnership</button>} />
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
                  <button onClick={save} disabled={busy || !form.title.trim()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
                </>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="h-40 rounded-3xl bg-zinc-200/60 dark:bg-white/[0.04] animate-pulse" />
          ) : list.length === 0 ? (
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
              {list.map((p) => (
                <div key={p.id} className="p-5 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-900 dark:text-white">{p.title}</p>
                    <p className="text-xs text-zinc-500">{p.partner.name}{p.company ? ` · ${p.company.name}` : ''}{fmt(p.startDate) ? ` · ${fmt(p.startDate)}${fmt(p.endDate) ? ` – ${fmt(p.endDate)}` : ''}` : ''}</p>
                    {p.description && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1.5">{p.description}</p>}
                  </div>
                  <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${p.isActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-zinc-500/10 text-zinc-500'}`}>{p.isActive ? 'Active' : 'Ended'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
