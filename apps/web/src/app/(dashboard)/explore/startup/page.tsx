'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Briefcase, Check, Loader2, Plus, Rocket, Search, Sparkles, UserCheck, Users, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { safeHref } from '@/lib/safe-href';
import { cn } from '@/lib/utils';
import { type Applicant, type ExploreState, type Opening, sampleApplicantsFor, uid, useExplore } from '../explore-store';
import { Chip, Empty, PreviewBanner, Tabs, card, field } from '../explore-ui';

// Explore as a Startup: what a founder does on UniVerse, played out in a private preview.

type Tab = 'overview' | 'roles' | 'applicants' | 'talent' | 'startups';
const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function ExploreStartup() {
  const { state, update, reset, loaded } = useExplore();
  const s = state.startup;
  const [tab, setTab] = useState<Tab>('overview');
  const newApplicants = s.applicants.filter((a) => a.status === 'NEW').length;

  return (
    <>
      <Topbar title="Explore as a Startup" subtitle="Post roles, meet applicants and find student talent" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <PreviewBanner mode="Startup" onReset={() => { reset(); toast.success('Preview reset'); }} />
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'overview', label: 'Your startup' },
              { id: 'roles', label: 'Open roles', count: s.openings.length },
              { id: 'applicants', label: 'Applicants', count: newApplicants },
              { id: 'talent', label: 'Find talent' },
              { id: 'startups', label: 'Startups on UniVerse' },
            ]}
          />
          {!loaded ? (
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          ) : tab === 'overview' ? (
            <Overview s={s} update={update} setTab={setTab} />
          ) : tab === 'roles' ? (
            <Roles s={s} update={update} setTab={setTab} />
          ) : tab === 'applicants' ? (
            <Applicants s={s} update={update} />
          ) : tab === 'talent' ? (
            <Talent />
          ) : (
            <RealStartups />
          )}
        </div>
      </div>
    </>
  );
}

type Props = { s: ExploreState['startup']; update: ReturnType<typeof useExplore>['update']; setTab: (t: Tab) => void };

function Overview({ s, update, setTab }: Props) {
  const [draft, setDraft] = useState({ name: s.name, tagline: s.tagline, sector: s.sector, stage: s.stage, website: s.website });
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
      <form
        className={cn(card, 'p-5 sm:p-6 space-y-4')}
        onSubmit={(e) => {
          e.preventDefault();
          update((st) => ({ ...st, startup: { ...st.startup, ...draft } }));
          toast.success('Startup profile saved (preview)');
        }}
      >
        <h2 className="font-semibold text-zinc-900 dark:text-white">Startup profile</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="space-y-1.5 text-sm"><span className="font-medium text-zinc-700 dark:text-zinc-300">Name</span><input className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium text-zinc-700 dark:text-zinc-300">Sector</span><input className={field} value={draft.sector} onChange={(e) => setDraft({ ...draft, sector: e.target.value })} maxLength={60} /></label>
          <label className="space-y-1.5 text-sm sm:col-span-2"><span className="font-medium text-zinc-700 dark:text-zinc-300">Tagline</span><input className={field} value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} maxLength={140} /></label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Stage</span>
            <select className={field} value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value })}>
              {['Idea', 'MVP', 'Seed', 'Growth'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm"><span className="font-medium text-zinc-700 dark:text-zinc-300">Website</span><input className={field} value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="https://" maxLength={200} /></label>
        </div>
        <button className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">Save profile</button>
      </form>

      <div className="space-y-4">
        <div className={cn(card, 'p-5')}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-500 flex items-center justify-center text-white font-bold text-lg">{(s.name || 'S').charAt(0)}</div>
          <p className="mt-3 font-bold text-zinc-900 dark:text-white">{s.name}</p>
          <p className="text-sm text-zinc-500">{s.tagline}</p>
          <div className="mt-3 flex flex-wrap gap-1.5"><Chip>{s.sector}</Chip><Chip>{s.stage}</Chip></div>
          <p className="mt-3 text-xs text-zinc-400">This is how students would see your startup.</p>
        </div>
        <div className={cn(card, 'p-5 grid grid-cols-3 text-center')}>
          <Stat n={s.openings.length} label="Roles" />
          <Stat n={s.applicants.length} label="Applicants" />
          <Stat n={s.applicants.filter((a) => a.status === 'HIRED').length} label="Hired" />
        </div>
        <button onClick={() => setTab('roles')} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-200"><Plus className="w-4 h-4" /> Post a role</button>
      </div>
    </div>
  );
}

function Roles({ s, update, setTab }: Props) {
  const [f, setF] = useState({ title: '', type: 'Internship', pay: '', skills: '', description: '' });
  const post = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return toast.error('Give the role a title');
    const opening: Opening = { id: uid(), title: f.title.trim(), type: f.type, pay: f.pay.trim() || 'Unpaid', skills: f.skills.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8), description: f.description.trim(), createdAt: new Date().toISOString() };
    update((st) => ({ ...st, startup: { ...st.startup, openings: [opening, ...st.startup.openings], applicants: [...sampleApplicantsFor(opening), ...st.startup.applicants] } }));
    setF({ title: '', type: 'Internship', pay: '', skills: '', description: '' });
    toast.success('Role posted. Three sample applicants have arrived in Applicants.');
  };
  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
      <form onSubmit={post} className={cn(card, 'p-5 space-y-3')}>
        <h2 className="font-semibold text-zinc-900 dark:text-white">Post a role</h2>
        <input className={field} placeholder="Role title, e.g. Frontend intern" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={100} aria-label="Role title" />
        <div className="grid grid-cols-2 gap-3">
          <select className={field} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Type">
            {['Internship', 'Part-time', 'Freelance project', 'Co-founder'].map((x) => <option key={x}>{x}</option>)}
          </select>
          <input className={field} placeholder="Pay, e.g. ₹10k/month" value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value })} maxLength={40} aria-label="Pay" />
        </div>
        <input className={field} placeholder="Skills, separated by commas" value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} maxLength={200} aria-label="Skills" />
        <textarea className={cn(field, 'min-h-[90px]')} placeholder="What will they work on?" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} aria-label="Description" />
        <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold"><Plus className="w-4 h-4" /> Post role</button>
      </form>
      {s.openings.length === 0 ? (
        <Empty icon={Briefcase} title="No roles yet" text="Post a role to see how students apply." />
      ) : (
        <ul className="space-y-3">
          {s.openings.map((o) => {
            const count = s.applicants.filter((a) => a.openingId === o.id).length;
            return (
              <li key={o.id} className={cn(card, 'p-5')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-white">{o.title}</p>
                    <p className="text-xs text-zinc-500">{o.type} · {o.pay} · posted {formatDistanceToNow(new Date(o.createdAt), { addSuffix: true })}</p>
                  </div>
                  <button onClick={() => update((st) => ({ ...st, startup: { ...st.startup, openings: st.startup.openings.filter((x) => x.id !== o.id), applicants: st.startup.applicants.filter((a) => a.openingId !== o.id) } }))} className="text-xs text-zinc-400 hover:text-rose-500">Close role</button>
                </div>
                {o.description && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{o.description}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">{o.skills.map((k) => <Chip key={k}>{k}</Chip>)}</div>
                <button onClick={() => setTab('applicants')} className="mt-3 text-sm font-semibold text-indigo-500">{count} applicant{count === 1 ? '' : 's'} →</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Applicants({ s, update }: Omit<Props, 'setTab'>) {
  const setStatus = (id: string, status: Applicant['status']) => update((st) => ({ ...st, startup: { ...st.startup, applicants: st.startup.applicants.map((a) => (a.id === id ? { ...a, status } : a)) } }));
  if (s.applicants.length === 0) return <Empty icon={Users} title="No applicants yet" text="Post a role and sample applicants will show up here." />;
  return (
    <ul className="grid md:grid-cols-2 gap-4">
      {s.applicants.map((a) => {
        const role = s.openings.find((o) => o.id === a.openingId);
        return (
          <li key={a.id} className={cn(card, 'p-5', a.status === 'DECLINED' && 'opacity-60')}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center font-bold text-indigo-500">{a.name.charAt(0)}</div>
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-white">{a.name}</p>
                  <p className="text-xs text-zinc-500">{a.headline} · for {role?.title ?? 'a role'}</p>
                </div>
              </div>
              <Chip>{{ NEW: 'New', SHORTLISTED: 'Shortlisted', DECLINED: 'Declined', HIRED: 'Hired' }[a.status]}</Chip>
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">“{a.note}”</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{a.skills.map((k) => <Chip key={k}>{k}</Chip>)}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {a.status === 'NEW' && <button onClick={() => setStatus(a.id, 'SHORTLISTED')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold"><Check className="w-3.5 h-3.5" /> Shortlist</button>}
              {a.status === 'SHORTLISTED' && <button onClick={() => { setStatus(a.id, 'HIRED'); toast.success(`${a.name} hired (preview)`); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"><UserCheck className="w-3.5 h-3.5" /> Hire</button>}
              {(a.status === 'NEW' || a.status === 'SHORTLISTED') && <button onClick={() => setStatus(a.id, 'DECLINED')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 text-xs font-semibold text-zinc-600 dark:text-zinc-300"><X className="w-3.5 h-3.5" /> Decline</button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="text-xl font-bold text-zinc-900 dark:text-white">{n}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

/** Real students on UniVerse (name, department, year only), as a startup would browse them. */
function Talent() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useSWR<{ id: string; name: string; avatar: string | null; studentProfile: { department: string | null; year: number } | null }[]>(
    `/users/directory${q.trim().length >= 2 ? `?search=${encodeURIComponent(q.trim())}` : ''}`,
    fetcher,
  );
  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input className={cn(field, 'pl-9')} placeholder="Search students by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
      </div>
      <p className="text-xs text-zinc-500">Real students on UniVerse. In the preview, invitations aren&apos;t sent.</p>
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      ) : !data?.length ? (
        <Empty icon={Users} title="No students found" text="Try another name." />
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.slice(0, 30).map((u) => (
            <li key={u.id} className={cn(card, 'p-4 flex items-center gap-3')}>
              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center font-bold text-zinc-600 dark:text-zinc-300">{u.name.charAt(0)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{u.name}</p>
                <p className="text-xs text-zinc-500 truncate">{[u.studentProfile?.department, u.studentProfile?.year ? `Year ${u.studentProfile.year}` : null].filter(Boolean).join(' · ') || 'Student'}</p>
              </div>
              <button onClick={() => toast.success(`Invitation to ${u.name} not sent: this is a preview`)} className="text-xs font-semibold text-indigo-500 shrink-0">Invite</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The real startups on the platform, for inspiration. */
function RealStartups() {
  const { data, isLoading } = useSWR<{ id: string; name: string; description: string | null; sector: string | null; stage: string | null; websiteUrl: string | null; _count?: { applications: number } }[]>('/impact/startups', fetcher);
  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />;
  if (!data?.length) return <Empty icon={Rocket} title="No startups yet" text="Startups that join UniVerse will appear here." />;
  return (
    <ul className="grid md:grid-cols-2 gap-4">
      {data.map((x) => (
        <li key={x.id} className={cn(card, 'p-5')}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-indigo-500/20 flex items-center justify-center"><Sparkles className="w-5 h-5 text-fuchsia-500" /></div>
            <div className="min-w-0">
              <p className="font-semibold text-zinc-900 dark:text-white truncate">{x.name}</p>
              <p className="text-xs text-zinc-500">{[x.sector, x.stage].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          {x.description && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300 line-clamp-3">{x.description}</p>}
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
            <span>{x._count?.applications ?? 0} applications</span>
            {x.websiteUrl && <a href={safeHref(x.websiteUrl)} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-500">Website →</a>}
          </div>
        </li>
      ))}
    </ul>
  );
}
