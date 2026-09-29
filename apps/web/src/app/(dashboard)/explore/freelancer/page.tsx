'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Bookmark, BookmarkCheck, Briefcase, Globe, Loader2, Rocket, Search, Send, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { type ExploreState, type Proposal, uid, useExplore } from '../explore-store';
import { Chip, Empty, PreviewBanner, Tabs, card, field } from '../explore-ui';

// Explore as a Freelancer: browse the real projects, internships and startups on UniVerse and
// practise sending proposals. Proposals stay in this preview; nobody receives them.

type Tab = 'work' | 'proposals' | 'profile';
type Update = ReturnType<typeof useExplore>['update'];
interface Gig { id: string; title: string; client: string; kind: 'Internship' | 'NGO project' | 'Startup'; detail: string; skills: string[]; pay?: string | null }

const fetcher = (url: string) => api.get(url).then((r) => r.data);
const STATUS_LABEL: Record<Proposal['status'], string> = { SENT: 'Sent', VIEWED: 'Viewed by client', SHORTLISTED: 'Shortlisted', HIRED: 'Hired' };
const NEXT: Record<Proposal['status'], Proposal['status'] | null> = { SENT: 'VIEWED', VIEWED: 'SHORTLISTED', SHORTLISTED: 'HIRED', HIRED: null };

export default function ExploreFreelancer() {
  const { state, update, reset, loaded } = useExplore();
  const [tab, setTab] = useState<Tab>('work');
  const f = state.freelancer;
  return (
    <>
      <Topbar title="Explore as a Freelancer" subtitle="Find projects, send proposals and build your profile" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <PreviewBanner mode="Freelancer" onReset={() => { reset(); toast.success('Preview reset'); }} />
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'work', label: 'Find work' }, { id: 'proposals', label: 'My proposals', count: f.proposals.length }, { id: 'profile', label: 'Profile' }]} />
          {!loaded ? <Loader2 className="w-5 h-5 animate-spin text-zinc-400" /> : tab === 'work' ? <FindWork f={f} update={update} onSent={() => setTab('proposals')} /> : tab === 'proposals' ? <Proposals f={f} update={update} /> : <Profile f={f} update={update} />}
        </div>
      </div>
    </>
  );
}

function FindWork({ f, update, onSent }: { f: ExploreState['freelancer']; update: Update; onSent: () => void }) {
  const { data: internships, isLoading: l1 } = useSWR<{ id: string; title: string; description: string; location: string | null; salary: string | null; isPaid: boolean; skills: unknown; company?: { name: string } }[]>('/internships', fetcher);
  const { data: projects, isLoading: l2 } = useSWR<{ id: string; name: string; description: string | null; location: string | null; ngo?: { name: string } }[]>('/impact/ngo-projects', fetcher);
  const { data: startups, isLoading: l3 } = useSWR<{ id: string; name: string; description: string | null; sector: string | null; stage: string | null }[]>('/impact/startups', fetcher);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | Gig['kind']>('');
  const [open, setOpen] = useState<Gig | null>(null);

  const gigs = useMemo<Gig[]>(() => [
    ...(internships ?? []).map((i) => ({ id: `i-${i.id}`, title: i.title, client: i.company?.name ?? 'Company', kind: 'Internship' as const, detail: i.description, skills: Array.isArray(i.skills) ? (i.skills as string[]).slice(0, 5) : [], pay: i.isPaid ? i.salary || 'Paid' : 'Unpaid' })),
    ...(projects ?? []).map((p) => ({ id: `p-${p.id}`, title: p.name, client: p.ngo?.name ?? 'NGO', kind: 'NGO project' as const, detail: p.description ?? '', skills: [], pay: 'Volunteer' })),
    ...(startups ?? []).map((s) => ({ id: `s-${s.id}`, title: `Work with ${s.name}`, client: s.name, kind: 'Startup' as const, detail: s.description ?? '', skills: [s.sector, s.stage].filter(Boolean) as string[], pay: null })),
  ], [internships, projects, startups]);

  const shown = gigs.filter((g) => (!kind || g.kind === kind) && (!q.trim() || `${g.title} ${g.client} ${g.detail}`.toLowerCase().includes(q.trim().toLowerCase())));
  const sentIds = new Set(f.proposals.map((p) => p.gigId));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input className={cn(field, 'pl-9')} placeholder="Search projects, internships and startups" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search work" />
        </div>
        <select className={cn(field, 'sm:w-48')} value={kind} onChange={(e) => setKind(e.target.value as '' | Gig['kind'])} aria-label="Type of work">
          <option value="">All kinds</option>
          <option>Internship</option>
          <option>NGO project</option>
          <option>Startup</option>
        </select>
      </div>
      <p className="text-xs text-zinc-500">These are real listings on UniVerse. In the preview, proposals aren&apos;t sent.</p>
      {l1 || l2 || l3 ? (
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      ) : shown.length === 0 ? (
        <Empty icon={Briefcase} title="Nothing matches" text="Try another search." />
      ) : (
        <ul className="grid md:grid-cols-2 gap-4">
          {shown.slice(0, 40).map((g) => {
            const Icon = g.kind === 'Internship' ? Briefcase : g.kind === 'NGO project' ? Globe : Rocket;
            const saved = f.saved.includes(g.id);
            return (
              <li key={g.id} className={cn(card, 'p-5 flex flex-col')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 dark:text-white">{g.title}</p>
                    <p className="text-xs text-zinc-500 inline-flex items-center gap-1"><Icon className="w-3 h-3" /> {g.kind} · {g.client}{g.pay ? ` · ${g.pay}` : ''}</p>
                  </div>
                  <button aria-label={saved ? 'Unsave' : 'Save'} onClick={() => update((st) => ({ ...st, freelancer: { ...st.freelancer, saved: saved ? st.freelancer.saved.filter((x) => x !== g.id) : [...st.freelancer.saved, g.id] } }))} className="text-zinc-400 hover:text-indigo-500">
                    {saved ? <BookmarkCheck className="w-4 h-4 text-indigo-500" /> : <Bookmark className="w-4 h-4" />}
                  </button>
                </div>
                {g.detail && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 line-clamp-3">{g.detail}</p>}
                {g.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{g.skills.map((k) => <Chip key={k}>{k}</Chip>)}</div>}
                <div className="mt-auto pt-4">
                  {sentIds.has(g.id) ? (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Proposal sent (preview)</span>
                  ) : (
                    <button onClick={() => setOpen(g)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold"><Send className="w-3.5 h-3.5" /> Send proposal</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {open && <ProposalDialog gig={open} rate={f.rate} onClose={() => setOpen(null)} onSend={(p) => { update((st) => ({ ...st, freelancer: { ...st.freelancer, proposals: [p, ...st.freelancer.proposals] } })); setOpen(null); toast.success('Proposal saved in your preview'); onSent(); }} />}
    </div>
  );
}

function ProposalDialog({ gig, rate, onClose, onSend }: { gig: Gig; rate: string; onClose: () => void; onSend: (p: Proposal) => void }) {
  const [message, setMessage] = useState('');
  const [price, setPrice] = useState(rate);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Send proposal">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!message.trim()) return toast.error('Write a short message');
          onSend({ id: uid(), gigId: gig.id, gigTitle: gig.title, client: gig.client, rate: price.trim() || rate, message: message.trim(), sentAt: new Date().toISOString(), status: 'SENT' });
        }}
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-zinc-900 dark:text-white">Proposal for {gig.title}</h2>
            <p className="text-xs text-zinc-500">{gig.client} · preview only, not sent</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400"><X className="w-5 h-5" /></button>
        </div>
        <textarea autoFocus className={cn(field, 'min-h-[120px]')} placeholder="Why you're a good fit, and how you'd approach it" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1500} aria-label="Message" />
        <input className={field} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Your rate" maxLength={40} aria-label="Rate" />
        <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold"><Send className="w-4 h-4" /> Send proposal</button>
      </form>
    </div>
  );
}

function Proposals({ f, update }: { f: ExploreState['freelancer']; update: Update }) {
  if (f.proposals.length === 0) return <Empty icon={Send} title="No proposals yet" text="Send one from Find work to see how clients respond." />;
  const advance = (id: string) => update((st) => ({ ...st, freelancer: { ...st.freelancer, proposals: st.freelancer.proposals.map((p) => (p.id === id && NEXT[p.status] ? { ...p, status: NEXT[p.status]! } : p)) } }));
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">In the real flow the client moves your proposal along. Here you can step through it to see each stage.</p>
      <ul className="space-y-3">
        {f.proposals.map((p) => {
          const steps: Proposal['status'][] = ['SENT', 'VIEWED', 'SHORTLISTED', 'HIRED'];
          const at = steps.indexOf(p.status);
          return (
            <li key={p.id} className={cn(card, 'p-5')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-white">{p.gigTitle}</p>
                  <p className="text-xs text-zinc-500">{p.client} · {p.rate} · sent {formatDistanceToNow(new Date(p.sentAt), { addSuffix: true })}</p>
                </div>
                <Chip>{STATUS_LABEL[p.status]}</Chip>
              </div>
              <ol className="mt-3 flex gap-1.5" aria-label="Proposal progress">
                {steps.map((st, i) => <li key={st} className={cn('h-1.5 flex-1 rounded-full', i <= at ? (p.status === 'HIRED' ? 'bg-emerald-500' : 'bg-indigo-500') : 'bg-zinc-200 dark:bg-white/10')} />)}
              </ol>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300 line-clamp-2">{p.message}</p>
              <div className="mt-3 flex gap-3">
                {NEXT[p.status] && <button onClick={() => advance(p.id)} className="text-xs font-semibold text-indigo-500">Simulate: {STATUS_LABEL[NEXT[p.status]!]} →</button>}
                <button onClick={() => update((st) => ({ ...st, freelancer: { ...st.freelancer, proposals: st.freelancer.proposals.filter((x) => x.id !== p.id) } }))} className="text-xs text-zinc-400 hover:text-rose-500">Withdraw</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Profile({ f, update }: { f: ExploreState['freelancer']; update: Update }) {
  const [d, setD] = useState({ headline: f.headline, rate: f.rate, skills: f.skills.join(', '), about: f.about, available: f.available });
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update((st) => ({ ...st, freelancer: { ...st.freelancer, headline: d.headline.trim(), rate: d.rate.trim(), about: d.about.trim(), available: d.available, skills: d.skills.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12) } }));
          toast.success('Profile saved (preview)');
        }}
        className={cn(card, 'p-5 sm:p-6 space-y-4')}
      >
        <h2 className="font-semibold text-zinc-900 dark:text-white">Freelancer profile</h2>
        <label className="block space-y-1.5 text-sm"><span className="font-medium text-zinc-700 dark:text-zinc-300">Headline</span><input className={field} value={d.headline} onChange={(e) => setD({ ...d, headline: e.target.value })} maxLength={100} /></label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5 text-sm"><span className="font-medium text-zinc-700 dark:text-zinc-300">Rate</span><input className={field} value={d.rate} onChange={(e) => setD({ ...d, rate: e.target.value })} maxLength={40} /></label>
          <label className="block space-y-1.5 text-sm"><span className="font-medium text-zinc-700 dark:text-zinc-300">Skills</span><input className={field} value={d.skills} onChange={(e) => setD({ ...d, skills: e.target.value })} maxLength={200} placeholder="Comma separated" /></label>
        </div>
        <label className="block space-y-1.5 text-sm"><span className="font-medium text-zinc-700 dark:text-zinc-300">About you</span><textarea className={cn(field, 'min-h-[100px]')} value={d.about} onChange={(e) => setD({ ...d, about: e.target.value })} maxLength={1000} /></label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={d.available} onChange={(e) => setD({ ...d, available: e.target.checked })} /> Available for new work</label>
        <button className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">Save profile</button>
      </form>
      <div className={cn(card, 'p-5')}>
        <p className="font-bold text-zinc-900 dark:text-white">{f.headline || 'Your headline'}</p>
        <p className="text-sm text-zinc-500">{f.rate}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{f.skills.map((k) => <Chip key={k}>{k}</Chip>)}</div>
        {f.about && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{f.about}</p>}
        <p className={cn('mt-3 text-xs font-semibold', f.available ? 'text-emerald-500' : 'text-zinc-400')}>{f.available ? '● Available for work' : 'Not taking work'}</p>
        <p className="mt-3 text-xs text-zinc-400">This is how clients would see you.</p>
      </div>
    </div>
  );
}
