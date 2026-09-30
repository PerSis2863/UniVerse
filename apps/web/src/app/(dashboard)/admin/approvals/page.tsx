'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle, ArrowLeft, UserPlus, CheckSquare, Square, BadgeCheck, Building2, CheckCircle2, Clock, Globe, Inbox, Loader2, Mail, MessageSquareWarning, Paperclip, Phone, Search, UserCheck, X, XCircle, GraduationCap } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { safeHref } from '@/lib/safe-href';
import { cn } from '@/lib/utils';
import { confirmDialog } from '@/components/ui/Dialogs';
import { InviteDialog } from './invite';

// Admin → Approvals: review applications to become a teacher or NGO representative.
// Approving grants the role; declining and "ask for more info" send the applicant your message.

type Status = 'PENDING' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
interface Applicant { id: string; name: string; email: string; avatar: string | null; role: string; status: string; createdAt: string; phone: string | null }
interface HistoryEvent { at: string; byName?: string | null; type: string; note?: string | null }
interface Application {
  id: string; status: Status | 'DRAFT'; source: string; requestedRole: 'STUDENT' | 'TEACHER' | 'ADMIN';
  institution: string | null; department: string | null; position: string | null; staffId: string | null; workEmail: string | null; phone: string | null;
  subjects: string | null; experienceYears: number | null; profileUrl: string | null; message: string | null; proofUrl: string | null; proofName: string | null;
  adminNote: string | null; submittedAt: string | null; reviewedAt: string | null; createdAt: string;
  user: Applicant; reviewedBy?: { id: string; name: string } | null; history: HistoryEvent[];
}
interface Detail extends Application { previous: { id: string; status: string; submittedAt: string | null; adminNote: string | null }[]; checks: { ok: boolean; text: string }[] }
interface List { items: Application[]; counts: Partial<Record<Status | 'DRAFT', number>> }

const TABS: { id: Status; label: string }[] = [
  { id: 'PENDING', label: 'Waiting' },
  { id: 'NEEDS_INFO', label: 'Asked for info' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Declined' },
  { id: 'WITHDRAWN', label: 'Withdrawn' },
];
const ROLE = { STUDENT: { label: 'Student verification', icon: GraduationCap }, TEACHER: { label: 'Staff', icon: Building2 }, ADMIN: { label: 'Organization', icon: Globe } } as const;
const EVENT_LABEL: Record<string, string> = {
  created: 'Started', submitted: 'Sent for review', updated: 'Details updated', info_requested: 'More information requested', info_provided: 'Applicant answered',
  approved: 'Approved', rejected: 'Declined', withdrawn: 'Withdrawn by applicant', invited: 'Approved from an invitation',
};
const fetcher = (url: string) => api.get(url).then((r) => r.data);
const errorMessage = (e: unknown) => {
  const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || (e as Error)?.message || 'Something went wrong';
};

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Status>('PENDING');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  // Opened from a notification: /admin/approvals?id=… (the page only renders in the browser)
  const [selected, setSelected] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('id')));
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const listKey = `/applications?status=${tab}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`;
  const { data, isLoading, error, mutate } = useSWR<List>(listKey, fetcher);
  // Several at once (e.g. a class of students): tick them, then "Approve selected".
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [approving, setApproving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const canPick = tab === 'PENDING' || tab === 'NEEDS_INFO';
  const shown = data?.items ?? [];
  const allPicked = shown.length > 0 && shown.every((a) => picked.has(a.id));
  const toggle = (id: string) => setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const approvePicked = async () => {
    const ids = [...picked].filter((id) => shown.some((a) => a.id === id));
    if (!ids.length) return;
    if (!(await confirmDialog({ title: `Approve ${ids.length} application${ids.length === 1 ? '' : 's'}?`, message: 'Each person gets the access they asked for and a notification.', confirmLabel: 'Approve' }))) return;
    setApproving(true);
    try {
      let done = 0; const failed: string[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data: r } = await api.post<{ approved: number; failed: { id: string; reason: string }[] }>('/applications/approve-many', { ids: ids.slice(i, i + 100) });
        done += r.approved; failed.push(...r.failed.map((f) => f.reason));
      }
      if (done) toast.success(`${done} approved`);
      if (failed.length) toast.error(`${failed.length} not approved: ${[...new Set(failed)].slice(0, 2).join(' ')}`);
      setPicked(new Set());
      await mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setApproving(false);
    }
  };

  const switchTab = (t: Status) => { setTab(t); setPicked(new Set()); };

  const select = (id: string | null) => {
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('id', id);
    else url.searchParams.delete('id');
    window.history.replaceState(null, '', url);
  };

  return (
    <>
      <Topbar title="Approvals" subtitle="Students, staff and organizations waiting for a decision" />
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,380px)_1fr] gap-6 items-start">
          {/* List */}
          <section className={cn('space-y-4', selected && 'hidden lg:block')}>
            <button onClick={() => setInviting(true)} className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold">
              <UserPlus className="w-4 h-4" /> Invite people (no review needed)
            </button>
            <div className="flex flex-wrap gap-1">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => switchTab(t.id)}
                  className={cn('shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors', tab === t.id ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
                  {t.label}
                  {!!data?.counts[t.id] && <span className={cn('ml-1.5', t.id === 'PENDING' && tab !== t.id && 'text-indigo-500')}>{data.counts[t.id]}</span>}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or institution" aria-label="Search applications"
                className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 pl-9 pr-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
            </div>
            {canPick && shown.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setPicked(allPicked ? new Set() : new Set(shown.map((a) => a.id)))} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  {allPicked ? <CheckSquare className="w-4 h-4 text-indigo-500" /> : <Square className="w-4 h-4" />} {allPicked ? 'Clear selection' : `Select all ${shown.length}`}
                </button>
                {picked.size > 0 && (
                  <button onClick={approvePicked} disabled={approving} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-60">
                    {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Approve {picked.size}
                  </button>
                )}
              </div>
            )}
            <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 overflow-hidden">
              {isLoading ? (
                <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
              ) : error ? (
                <p className="p-10 text-center text-sm text-rose-500">Could not load applications.</p>
              ) : !data?.items.length ? (
                <div className="p-10 text-center">
                  <Inbox className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600" />
                  <p className="mt-2 text-sm text-zinc-500">{tab === 'PENDING' ? 'Nothing waiting. Nice.' : 'No applications here.'}</p>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                  {data.items.map((a) => {
                    const Icon = ROLE[a.requestedRole]?.icon ?? Building2;
                    const when = a.status === 'PENDING' || a.status === 'NEEDS_INFO' ? a.submittedAt : a.reviewedAt;
                    return (
                      <li key={a.id} className="flex items-stretch">
                        {canPick && (
                          <button onClick={() => toggle(a.id)} aria-pressed={picked.has(a.id)} aria-label={`Select ${a.user.name}`} className="pl-3 pr-1 flex items-center text-zinc-400 hover:text-indigo-500">
                            {picked.has(a.id) ? <CheckSquare className="w-4 h-4 text-indigo-500" /> : <Square className="w-4 h-4" />}
                          </button>
                        )}
                        <button onClick={() => select(a.id)} className={cn('flex-1 min-w-0 text-left p-4 flex gap-3 hover:bg-zinc-50 dark:hover:bg-white/[0.03]', selected === a.id && 'bg-indigo-500/[0.06]')}>
                          <div className="w-9 h-9 shrink-0 rounded-full bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center text-sm font-bold text-zinc-600 dark:text-zinc-300">{a.user.name.charAt(0).toUpperCase()}</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{a.user.name}</p>
                            <p className="text-xs text-zinc-500 truncate">{[a.position, a.institution].filter(Boolean).join(' · ') || a.user.email}</p>
                            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-400">
                              <span className={cn('inline-flex items-center gap-1 font-semibold', a.requestedRole === 'ADMIN' ? 'text-amber-500' : 'text-indigo-500')}><Icon className="w-3 h-3" />{ROLE[a.requestedRole]?.label}</span>
                              {when && <span>· {formatDistanceToNow(new Date(when), { addSuffix: true })}</span>}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              Tip: for a whole class, use Invite people with their school email addresses. They&apos;re verified as soon as they sign up with that address, with nothing to approve here.
            </p>
          </section>

          {/* Detail */}
          <section className={cn(!selected && 'hidden lg:block')}>
            {selected ? (
              <ApplicationDetail key={selected} id={selected} onBack={() => select(null)} onDecided={() => void mutate()} />
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 p-12 text-center text-sm text-zinc-500">Select an application to review it.</div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function ApplicationDetail({ id, onBack, onDecided }: { id: string; onBack: () => void; onDecided: () => void }) {
  const { data: a, isLoading, error, mutate } = useSWR<Detail>(`/applications/${id}`, fetcher);
  const [action, setAction] = useState<null | 'approve' | 'reject' | 'info'>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  if (isLoading) return <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>;
  if (error || !a) return <p className="p-12 text-center text-sm text-rose-500">Could not load this application.</p>;

  const open = a.status === 'PENDING' || a.status === 'NEEDS_INFO';
  const RoleIcon = ROLE[a.requestedRole]?.icon ?? Building2;

  const decide = async () => {
    const path = action === 'approve' ? 'approve' : action === 'reject' ? 'reject' : 'request-info';
    const payload = action === 'approve' ? { note: text } : action === 'reject' ? { reason: text } : { message: text };
    setBusy(true);
    try {
      await api.post(`/applications/${a.id}/${path}`, payload);
      toast.success(action === 'approve' ? `${a.user.name} is now a ${ROLE[a.requestedRole].label.toLowerCase()}` : action === 'reject' ? 'Application declined' : 'Question sent to the applicant');
      setAction(null);
      setText('');
      await mutate();
      onDecided();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, React.ReactNode][] = [
    [a.requestedRole === 'ADMIN' ? 'Organization' : a.requestedRole === 'STUDENT' ? 'University or school' : 'Institution', a.institution],
    ['Department', a.department],
    ['Position', a.position],
    ['Staff ID', a.staffId],
    ['Work email', a.workEmail && <a href={`mailto:${a.workEmail}`} className="text-indigo-500 break-all">{a.workEmail}</a>],
    ['Phone', a.phone && <a href={`tel:${a.phone}`} className="text-indigo-500">{a.phone}</a>],
    ['Subjects', a.subjects],
    ['Experience', a.experienceYears != null ? `${a.experienceYears} year${a.experienceYears === 1 ? '' : 's'}` : null],
    ['Profile', a.profileUrl && <a href={safeHref(a.profileUrl)} target="_blank" rel="noopener noreferrer" className="text-indigo-500 break-all">{a.profileUrl}</a>],
    ['Document', a.proofUrl && <a href={safeHref(a.proofUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-500"><Paperclip className="w-3.5 h-3.5" />{a.proofName || 'Open document'}</a>],
  ];

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="lg:hidden inline-flex items-center gap-1.5 text-sm text-zinc-500"><ArrowLeft className="w-4 h-4" /> All applications</button>

      {/* Applicant */}
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div className="flex gap-3 min-w-0">
            <div className="w-12 h-12 shrink-0 rounded-full bg-indigo-500/10 flex items-center justify-center text-lg font-bold text-indigo-500">{a.user.name.charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white truncate">{a.user.name}</h2>
              <p className="text-sm text-zinc-500 inline-flex items-center gap-1.5 break-all"><Mail className="w-3.5 h-3.5 shrink-0" />{a.user.email}</p>
              {a.user.phone && <p className="text-sm text-zinc-500 inline-flex items-center gap-1.5 ml-3"><Phone className="w-3.5 h-3.5" />{a.user.phone}</p>}
              <p className="text-xs text-zinc-400 mt-1">Joined {format(new Date(a.user.createdAt), 'd MMM yyyy')} · {a.source === 'SIGNUP' ? 'chose this role when signing up' : 'applied from a student account'}</p>
            </div>
          </div>
          <div className="text-right">
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold', a.requestedRole === 'ADMIN' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400')}>
              <RoleIcon className="w-3.5 h-3.5" /> {ROLE[a.requestedRole]?.label}
            </span>
            <StatusBadge status={a.status} />
          </div>
        </div>
        {a.requestedRole === 'ADMIN' && (
          <p className="mt-4 flex gap-2 text-sm text-amber-600 dark:text-amber-400"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Approving gives this person full admin access, the same as yours.</p>
        )}
      </div>

      {/* Checks */}
      {!!a.checks?.length && (
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-5">
          <h3 className="font-semibold text-zinc-900 dark:text-white mb-3">Quick checks</h3>
          <ul className="grid sm:grid-cols-2 gap-2">
            {a.checks.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm">
                {c.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />}
                <span className="text-zinc-700 dark:text-zinc-300">{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Details */}
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-5">
        <h3 className="font-semibold text-zinc-900 dark:text-white mb-3">What they told us</h3>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-zinc-500">{k}</dt>
              <dd className="text-zinc-900 dark:text-zinc-100 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {a.message && <p className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.05] text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">{a.message}</p>}
      </div>

      {/* Decision */}
      {open ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-5 space-y-4">
          <h3 className="font-semibold text-zinc-900 dark:text-white">Decision</h3>
          {a.status === 'NEEDS_INFO' && a.adminNote && (
            <p className="text-sm text-amber-600 dark:text-amber-400 flex gap-2"><MessageSquareWarning className="w-4 h-4 shrink-0 mt-0.5" /> Waiting for the applicant to answer: “{a.adminNote}”</p>
          )}
          {!action ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setAction('approve')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold"><UserCheck className="w-4 h-4" /> Approve</button>
              <button onClick={() => setAction('info')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-200"><MessageSquareWarning className="w-4 h-4" /> Ask for more info</button>
              <button onClick={() => setAction('reject')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-500/30 text-sm font-semibold text-rose-600 dark:text-rose-400"><XCircle className="w-4 h-4" /> Decline</button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {action === 'approve' ? 'Note to the applicant (optional)' : action === 'reject' ? 'Why? The applicant will see this' : 'What do you need? The applicant will see this'}
              </label>
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
                placeholder={action === 'approve' ? 'e.g. Welcome aboard!' : action === 'reject' ? 'e.g. We could not confirm you work at this institution.' : 'e.g. Please upload your staff ID card.'}
                className="w-full min-h-[90px] rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
              <div className="flex flex-wrap gap-2">
                <button onClick={decide} disabled={busy || (action !== 'approve' && !text.trim())}
                  className={cn('inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50', action === 'approve' ? 'bg-emerald-600' : action === 'reject' ? 'bg-rose-600' : 'bg-indigo-600')}>
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {action === 'approve' ? `Approve as ${ROLE[a.requestedRole].label.toLowerCase()}` : action === 'reject' ? 'Decline application' : 'Send question'}
                </button>
                <button onClick={() => { setAction(null); setText(''); }} className="inline-flex items-center gap-1 px-3 py-2.5 text-sm text-zinc-500"><X className="w-4 h-4" /> Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        (a.status === 'APPROVED' || a.status === 'REJECTED') && (
          <div className={cn('rounded-2xl border p-5 text-sm', a.status === 'APPROVED' ? 'border-emerald-500/30 bg-emerald-500/[0.07]' : 'border-rose-500/30 bg-rose-500/[0.07]')}>
            <p className="font-semibold text-zinc-900 dark:text-white inline-flex items-center gap-2">
              {a.status === 'APPROVED' ? <BadgeCheck className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
              {a.status === 'APPROVED' ? 'Approved' : 'Declined'}{a.reviewedBy ? ` by ${a.reviewedBy.name}` : ''}{a.reviewedAt ? ` on ${format(new Date(a.reviewedAt), 'd MMM yyyy')}` : ''}
            </p>
            {a.adminNote && <p className="mt-1 text-zinc-600 dark:text-zinc-300">“{a.adminNote}”</p>}
            {a.status === 'APPROVED' && <p className="mt-2 text-zinc-500">To remove their access, suspend the account in Users.</p>}
          </div>
        )
      )}

      {/* Previous applications */}
      {!!a.previous?.length && (
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-5">
          <h3 className="font-semibold text-zinc-900 dark:text-white mb-3">Earlier applications</h3>
          <ul className="space-y-2 text-sm">
            {a.previous.map((p) => (
              <li key={p.id} className="flex flex-wrap gap-2 items-baseline">
                <StatusBadge status={p.status} inline />
                <span className="text-zinc-500">{p.submittedAt ? format(new Date(p.submittedAt), 'd MMM yyyy') : ''}</span>
                {p.adminNote && <span className="text-zinc-600 dark:text-zinc-300">“{p.adminNote}”</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* History */}
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-5">
        <h3 className="font-semibold text-zinc-900 dark:text-white mb-3">History</h3>
        <ol className="space-y-3">
          {[...(a.history ?? [])].reverse().map((e, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <Clock className="w-4 h-4 mt-0.5 shrink-0 text-zinc-400" />
              <div className="min-w-0">
                <p className="text-zinc-900 dark:text-white">{EVENT_LABEL[e.type] ?? e.type}{e.byName ? <span className="text-zinc-500"> · {e.byName}</span> : null}</p>
                {e.note && <p className="text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">“{e.note}”</p>}
                <p className="text-xs text-zinc-400">{format(new Date(e.at), 'd MMM yyyy, HH:mm')}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function StatusBadge({ status, inline }: { status: string; inline?: boolean }) {
  const map: Record<string, [string, string]> = {
    DRAFT: ['Not sent yet', 'bg-zinc-500/10 text-zinc-500'],
    PENDING: ['Waiting', 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'],
    NEEDS_INFO: ['Asked for info', 'bg-amber-500/10 text-amber-600 dark:text-amber-400'],
    APPROVED: ['Approved', 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'],
    REJECTED: ['Declined', 'bg-rose-500/10 text-rose-600 dark:text-rose-400'],
    WITHDRAWN: ['Withdrawn', 'bg-zinc-500/10 text-zinc-500'],
  };
  const [label, cls] = map[status] ?? [status, 'bg-zinc-500/10 text-zinc-500'];
  return <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', cls, !inline && 'block mt-2 w-fit ml-auto')}>{label}</span>;
}
