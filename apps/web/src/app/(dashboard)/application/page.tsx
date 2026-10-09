'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle, ArrowRight, BadgeCheck, Building2, CheckCircle2, Clock, FileText, Globe, GraduationCap, Loader2, LogOut, MessageSquareWarning,
  Paperclip, Send, ShieldCheck, Trash2, Undo2, Upload, XCircle,
} from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { confirmDialog } from '@/components/ui/Dialogs';
import { Combobox } from '@/components/ui/Combobox';
import { DEPARTMENTS, ORG_DEPARTMENTS, ORG_ROLES, PROGRAMMES, STAFF_POSITIONS, STUDY_YEARS, SUBJECTS } from '@/lib/options/academic';
import { homeCountry, loadUniversities } from '@/lib/options/universities';
import { api } from '@/lib/api';
import { authedFetch } from '@/lib/authed-fetch';
import { safeHref } from '@/lib/safe-href';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { awaitingApproval, type ApplicationStatus, type Role, type UserStatus } from '@/types';
import { TabPill } from '@/components/ui/Glide';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { homeFor } from '@/lib/role-home';

// Applying to become staff / mentor or an organisation (or, from sign-up, a verified student), and following the application.
// People who picked "teacher" when signing up land here until an admin decides; students can
// apply from Settings. The role is only granted when an admin approves (server-side).

type Requested = 'STUDENT' | 'TEACHER' | 'ADMIN';
interface HistoryEvent { at: string; byName?: string | null; type: string; note?: string | null }
interface Application {
  id: string;
  status: ApplicationStatus;
  source: string;
  requestedRole: Requested;
  institution: string | null;
  department: string | null;
  position: string | null;
  staffId: string | null;
  workEmail: string | null;
  phone: string | null;
  subjects: string | null;
  experienceYears: number | null;
  profileUrl: string | null;
  message: string | null;
  proofUrl: string | null;
  proofName: string | null;
  adminNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  history: HistoryEvent[];
}
interface Mine { application: Application | null; canApply: boolean; reapplyAfter: string | null }

type Form = Record<'institution' | 'department' | 'position' | 'staffId' | 'workEmail' | 'phone' | 'subjects' | 'profileUrl' | 'message' | 'experienceYears', string> & {
  requestedRole: Requested;
  proofUrl: string | null;
  proofName: string | null;
};

const ROLE_INFO: Record<Requested, { label: string; icon: typeof GraduationCap; blurb: string }> = {
  STUDENT: { label: 'Verified student', icon: GraduationCap, blurb: 'Confirm you study at a university or school to get your student account and verified student badge.' },
  TEACHER: { label: 'Staff / mentor', icon: Building2, blurb: 'Create courses, post grades and materials, run quizzes and take attendance.' },
  ADMIN: { label: 'Organisation', icon: Globe, blurb: 'Post projects and work with universities. This gives admin access, so it is reviewed carefully.' },
};

const EVENT_LABEL: Record<string, string> = {
  created: 'Application started',
  submitted: 'Sent for review',
  updated: 'Details updated',
  info_requested: 'An admin asked for more information',
  info_provided: 'You sent the extra information',
  approved: 'Approved',
  rejected: 'Not approved',
  withdrawn: 'Withdrawn',
  invited: 'Approved from an invitation',
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);
const input =
  'w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

const PROGRAMMES_AND_FIELDS = [...PROGRAMMES, ...DEPARTMENTS];

const toForm = (a: Application | null | undefined, fallbackRole: Requested): Form => ({
  requestedRole: a?.requestedRole ?? fallbackRole,
  institution: a?.institution ?? '',
  department: a?.department ?? '',
  position: a?.position ?? '',
  staffId: a?.staffId ?? '',
  workEmail: a?.workEmail ?? '',
  phone: a?.phone ?? '',
  subjects: a?.subjects ?? '',
  profileUrl: a?.profileUrl ?? '',
  message: a?.message ?? '',
  experienceYears: a?.experienceYears != null ? String(a.experienceYears) : '',
  proofUrl: a?.proofUrl ?? null,
  proofName: a?.proofName ?? null,
});

const errorMessage = (e: unknown) => {
  const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || (e as Error)?.message || 'Something went wrong';
};

export default function ApplicationPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const standalone = awaitingApproval(user);
  const { data, error, isLoading, mutate } = useSWR<Mine>('/applications/mine', fetcher, { revalidateOnFocus: true });

  const app = data?.application ?? null;
  const open = !!app && ['DRAFT', 'PENDING', 'NEEDS_INFO'].includes(app.status);
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState<Requested | null>(null);

  const refreshProfile = async () => {
    try {
      const { data: me } = await api.get('/users/me');
      if (user) setUser({ ...user, role: me.role as Role, status: (me.status || 'ACTIVE') as UserStatus, application: me.application ?? null });
      return me as { role: string };
    } catch {
      return null;
    }
  };

  // Firebase loads only to sign out (like the sidebar), not with the page.
  const firebaseSignOut = () => import('@/lib/firebase').then(({ auth }) => auth.signOut()).catch(() => {});

  const signOut = async () => {
    await firebaseSignOut();
    logout();
    router.push('/login');
  };

  const withdraw = async () => {
    const signup = app?.source === 'SIGNUP' && standalone;
    const yes = await confirmDialog({
      title: 'Withdraw your application?',
      message: signup ? 'Your account setup will be cancelled and you’ll be signed out. You can sign up again at any time.' : 'You can apply again later from Settings.',
      confirmLabel: 'Withdraw',
      destructive: true,
    });
    if (!yes) return;
    try {
      const { data: res } = await api.post<{ setupCancelled?: boolean }>('/applications/mine/withdraw');
      if (res?.setupCancelled) {
        // Back to the home page, signed out; the toast survives the navigation.
        toast.success('Your application was withdrawn successfully.');
        await firebaseSignOut();
        logout();
        router.replace('/');
        return;
      }
      await mutate();
      await refreshProfile();
      toast.success('Application withdrawn');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const continueAsStudent = async () => {
    await refreshProfile();
    router.push('/student');
  };

  const openDashboard = async () => {
    const me = await refreshProfile();
    router.push(homeFor(me ?? { role: 'STUDENT' }));
  };

  let body: React.ReactNode;
  if (isLoading) {
    body = <div className="py-24"><ContentSkeleton variant="list" /></div>;
  } else if (error) {
    body = <p className="py-24 text-center text-sm text-rose-500">Could not load your application. Please refresh.</p>;
  } else if (!app || (!open && data?.canApply && starting)) {
    // No application yet (or starting a new one after a closed one)
    body = starting || !data?.canApply ? (
      data?.canApply ? (
        <ApplicationForm initial={toForm(null, starting ?? 'TEACHER')} isNew onSaved={async () => { setStarting(null); await mutate(); await refreshProfile(); }} onCancel={() => setStarting(null)} />
      ) : (
        <Notice icon={ShieldCheck} tone="neutral" title="Your account already has staff access" text="Applications are for student accounts that want to join as staff / mentor or for an organisation." />
      )
    ) : (
      <Intro onPick={setStarting} />
    );
  } else if (open && (app.status === 'DRAFT' || app.status === 'NEEDS_INFO' || editing)) {
    body = (
      <div className="space-y-6">
        <StatusSteps status={app.status} />
        {app.status === 'NEEDS_INFO' && app.adminNote && (
          <Notice icon={MessageSquareWarning} tone="warning" title="An admin needs a bit more information" text={app.adminNote} />
        )}
        {app.status === 'DRAFT' && app.source === 'SIGNUP' && (
          <Notice
            icon={ShieldCheck}
            tone="info"
            title={`Your ${ROLE_INFO[app.requestedRole]?.label.toLowerCase() ?? 'staff'} account needs approval`}
            text={app.requestedRole === 'STUDENT'
              ? "To keep the community safe, an admin checks every account. Tell us where you study and how we can confirm it. It usually takes a day or two; we'll notify you by email and in the app."
              : "To keep students safe, an admin checks every staff account. Tell us where you work and how we can confirm it. It usually takes a day or two; we'll notify you by email and in the app."}
          />
        )}
        <ApplicationForm
          initial={toForm(app, app.requestedRole)}
          canChangeRole={app.status === 'DRAFT'}
          submitLabel={app.status === 'NEEDS_INFO' ? 'Send updated application' : app.status === 'PENDING' ? 'Save changes' : 'Send for review'}
          onSaved={async () => { setEditing(false); await mutate(); await refreshProfile(); }}
          onCancel={editing ? () => setEditing(false) : undefined}
        />
        <div className="flex justify-end">
          <button onClick={withdraw} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-rose-500"><Undo2 className="w-4 h-4" /> Withdraw application</button>
        </div>
        <History events={app.history} />
      </div>
    );
  } else {
    body = (
      <div className="space-y-6">
        <StatusSteps status={app.status} />
        {app.status === 'PENDING' && (
          <Notice
            icon={Clock}
            tone="info"
            title="Your application is being reviewed"
            text={`Sent ${app.submittedAt ? formatDistanceToNow(new Date(app.submittedAt), { addSuffix: true }) : ''}. An admin will check your details, and may contact you at your work email. We'll let you know by email and in the app as soon as there's a decision.`}
          />
        )}
        {app.status === 'APPROVED' && (
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 sm:p-8 text-white shadow-xl shadow-indigo-500/20">
            <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-fuchsia-300/20 blur-2xl" />
            <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="w-16 h-16 shrink-0 rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur flex items-center justify-center">
                <BadgeCheck className="w-9 h-9" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-[11px] font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approved{app.reviewedAt ? ` · ${format(new Date(app.reviewedAt), 'd MMM yyyy')}` : ''}
                </span>
                <h2 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight">You&apos;re approved!</h2>
                <p className="mt-1 text-sm text-white/85">Your account now has {ROLE_INFO[app.requestedRole]?.label.toLowerCase() ?? 'staff'} access.</p>
                {app.adminNote && <p className="mt-3 text-sm text-white/90 italic">“{app.adminNote}”</p>}
              </div>
              <button onClick={openDashboard} className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white text-indigo-700 text-sm font-bold shadow-lg hover:bg-indigo-50 transition-colors">
                Open your dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {app.status === 'REJECTED' && (
          <>
            <Notice icon={XCircle} tone="danger" title="Your application wasn't approved" text={app.adminNote || 'No reason was given.'} />
            <div className="flex flex-wrap gap-3">
              <button onClick={continueAsStudent} className="btn-primary">
                Continue as a student <ArrowRight className="w-4 h-4" />
              </button>
              {data?.canApply ? (
                <button onClick={() => setStarting(app.requestedRole)} className="btn-secondary">Apply again</button>
              ) : data?.reapplyAfter ? (
                <p className="self-center text-sm text-zinc-500">You can apply again on {format(new Date(data.reapplyAfter), 'd MMM yyyy')}.</p>
              ) : null}
            </div>
          </>
        )}
        {app.status === 'WITHDRAWN' && (
          <>
            <Notice icon={Undo2} tone="neutral" title="You withdrew your application" text="Your account works as a student account." />
            <div className="flex flex-wrap gap-3">
              <button onClick={continueAsStudent} className="btn-primary">Continue as a student <ArrowRight className="w-4 h-4" /></button>
              {data?.canApply && <button onClick={() => setStarting(app.requestedRole)} className="btn-secondary">Apply again</button>}
            </div>
          </>
        )}
        <Summary app={app} />
        {app.status === 'PENDING' && (
          <div className="flex flex-wrap justify-between gap-3">
            <button onClick={() => setEditing(true)} className="btn-secondary">Edit details</button>
            <button onClick={withdraw} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-rose-500"><Undo2 className="w-4 h-4" /> Withdraw application</button>
          </div>
        )}
        <History events={app.history} />
      </div>
    );
  }

  const shownRole = app && app.status !== 'WITHDRAWN' ? app.requestedRole : null;
  const studentApp = shownRole === 'STUDENT';
  const pageTitle = studentApp ? 'Student verification' : shownRole === 'ADMIN' ? 'Organisation application' : shownRole === 'TEACHER' ? 'Staff / mentor application' : 'Apply to UniVerse';
  const content = <div className="max-w-3xl mx-auto w-full">{body}</div>;

  if (standalone) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0d16]">
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-8 h-16 border-b border-zinc-200/70 dark:border-white/[0.06] bg-white/80 dark:bg-[#0a0d16]/80 backdrop-blur">
          <div className="flex items-center gap-2">
            <UniverseLogo className="w-8 h-8" />
            <span className="font-bold text-zinc-900 dark:text-white">{pageTitle}</span>
          </div>
          <button onClick={signOut} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><LogOut className="w-4 h-4" /> Sign out</button>
        </header>
        <main className="px-4 sm:px-8 py-8">{content}</main>
      </div>
    );
  }
  return (
    <>
      <Topbar title={pageTitle} subtitle={studentApp ? 'Confirm where you study to get your student account' : shownRole === 'ADMIN' ? 'Your organisation account on UniVerse Impact' : shownRole === 'TEACHER' ? 'Your staff / mentor account on UniVerse Impact' : 'Apply as staff / mentor or for an organisation on UniVerse'} />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">{content}</div>
    </>
  );
}

// ─── Pieces ────────────────────────────────────────────────────────────────────────────────────

function Intro({ onPick }: { onPick: (r: Requested) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Join as staff / mentor or for an organisation</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Staff accounts can see and change students&apos; work, so an admin checks every application. You keep your student account while you wait.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {(Object.keys(ROLE_INFO) as Requested[]).map((r) => {
          const Icon = ROLE_INFO[r].icon;
          return (
            <button key={r} onClick={() => onPick(r)} className="tone-panel text-left p-5 rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] hover:border-indigo-500/50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/10 transition-all">
              <RoleIcon icon={Icon} />
              <p className="mt-3 font-semibold text-zinc-900 dark:text-white">{ROLE_INFO[r].label}</p>
              <p className="mt-1 text-sm text-zinc-500">{ROLE_INFO[r].blurb}</p>
            </button>
          );
        })}
      </div>
      <ol className="grid sm:grid-cols-3 gap-3 text-sm">
        {['Tell us where you work and how to confirm it', 'An admin reviews it (usually within 1–2 days)', 'You get staff access, or a clear reason why not'].map((t, i) => (
          <li key={t} className="tone-panel flex gap-3 p-4 rounded-2xl border border-zinc-200/80 dark:border-white/[0.06]">
            <span className="w-6 h-6 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
            <span className="text-zinc-600 dark:text-zinc-300">{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoleIcon({ icon: Icon }: { icon: typeof GraduationCap }) {
  return (
    <span className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
      <Icon className="w-5 h-5 text-white" />
    </span>
  );
}

function StatusSteps({ status }: { status: ApplicationStatus }) {
  const steps = ['Your details', 'Sent', 'Admin review', 'Decision'];
  const at = status === 'DRAFT' ? 0 : status === 'PENDING' ? 2 : status === 'NEEDS_INFO' ? 2 : 3;
  const failed = status === 'REJECTED' || status === 'WITHDRAWN';
  return (
    <ol className="tone-panel flex items-start gap-2 p-4 rounded-2xl border border-zinc-200/80 dark:border-white/[0.06]" aria-label="Application progress">
      {steps.map((s, i) => {
        const done = i < at || (i === 3 && status === 'APPROVED');
        const current = i === at && !done;
        const bad = failed && i === 3;
        return (
          <li key={s} className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cn('w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold',
                bad ? 'bg-rose-500 text-white' : done ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white' : current ? (status === 'NEEDS_INFO' ? 'bg-amber-500 text-white' : 'ring-2 ring-indigo-500 text-indigo-500 bg-white dark:bg-transparent') : 'bg-zinc-200 dark:bg-white/10 text-zinc-400')}>
                {bad ? <XCircle className="w-3.5 h-3.5" /> : done ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </span>
              {i < steps.length - 1 && <span className={cn('flex-1 h-1 rounded-full', done && !bad ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500' : 'bg-zinc-200 dark:bg-white/10')} />}
            </div>
            <p className={cn('mt-1.5 text-[11px] font-semibold truncate', current || done ? 'text-zinc-900 dark:text-white' : 'text-zinc-400')}>
              {i === 2 && status === 'NEEDS_INFO' ? 'Waiting for you' : i === 3 && status === 'REJECTED' ? 'Not approved' : i === 3 && status === 'WITHDRAWN' ? 'Withdrawn' : s}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function Notice({ icon: Icon, tone, title, text }: { icon: typeof Clock; tone: 'info' | 'warning' | 'danger' | 'neutral'; title: string; text: string }) {
  const colors = {
    info: 'tone-panel border-indigo-500/25 text-indigo-500',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
    danger: 'border-rose-500/30 bg-rose-500/10 text-rose-500',
    neutral: 'border-zinc-200 dark:border-white/10 bg-zinc-100/70 dark:bg-white/[0.03] text-zinc-500',
  }[tone];
  return (
    <div className={cn('flex gap-3 p-4 sm:p-5 rounded-2xl border', colors)}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="font-semibold text-zinc-900 dark:text-white">{title}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  );
}

function Summary({ app }: { app: Application }) {
  const rows: [string, React.ReactNode][] = [
    ['Applying as', ROLE_INFO[app.requestedRole]?.label ?? app.requestedRole],
    [app.requestedRole === 'ADMIN' ? 'Organization' : app.requestedRole === 'STUDENT' ? 'University or school' : 'Institution', app.institution],
    ['Department', app.department],
    ['Position', app.position],
    ['Staff ID', app.staffId],
    ['Work email', app.workEmail],
    ['Phone', app.phone],
    ['Subjects', app.subjects],
    ['Experience', app.experienceYears != null ? `${app.experienceYears} year${app.experienceYears === 1 ? '' : 's'}` : null],
    ['Profile', app.profileUrl && <a href={safeHref(app.profileUrl)} target="_blank" rel="noopener noreferrer" className="text-indigo-500 break-all">{app.profileUrl}</a>],
    ['Document', app.proofUrl && <a href={safeHref(app.proofUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-500"><Paperclip className="w-3.5 h-3.5" />{app.proofName || 'Attachment'}</a>],
  ];
  const info = ROLE_INFO[app.requestedRole];
  return (
    <div className="tone-panel rounded-3xl border border-zinc-200/80 dark:border-white/[0.06] p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <RoleIcon icon={info?.icon ?? Building2} />
        <div className="min-w-0">
          <h3 className="font-bold text-zinc-900 dark:text-white">What you sent</h3>
          <p className="text-xs text-zinc-500">{info?.label ?? app.requestedRole} application{app.submittedAt ? ` · sent ${format(new Date(app.submittedAt), 'd MMM yyyy')}` : ''}</p>
        </div>
      </div>
      <dl className="grid sm:grid-cols-2 gap-2.5 text-sm">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="min-w-0 px-3.5 py-2.5 rounded-xl bg-white/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.05]">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-300">{k}</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {app.message && <p className="mt-3 px-3.5 py-3 rounded-xl bg-white/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.05] text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{app.message}</p>}
    </div>
  );
}

function History({ events }: { events: HistoryEvent[] }) {
  if (!events?.length) return null;
  return (
    <div className="tone-panel rounded-3xl border border-zinc-200/80 dark:border-white/[0.06] p-5 sm:p-6">
      <h3 className="font-bold text-zinc-900 dark:text-white mb-4">History</h3>
      <ol className="relative space-y-4 before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-gradient-to-b before:from-indigo-500/40 before:to-fuchsia-500/40">
        {[...events].reverse().map((e, i) => (
          <li key={i} className="relative flex gap-3">
            <span className={cn('mt-1 w-3 h-3 rounded-full shrink-0 ring-4 ring-white dark:ring-[#121830]', e.type === 'approved' || e.type === 'invited' ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500' : e.type === 'rejected' ? 'bg-rose-500' : e.type === 'info_requested' ? 'bg-amber-500' : 'bg-indigo-500')} />
            <div className="min-w-0">
              <p className="text-sm text-zinc-900 dark:text-white">{EVENT_LABEL[e.type] ?? e.type}</p>
              {e.note && <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">“{e.note}”</p>}
              <p className="text-xs text-zinc-400">{format(new Date(e.at), 'd MMM yyyy, HH:mm')}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Field({ label, hint, required, className, children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function ApplicationForm({
  initial, isNew, canChangeRole = true, submitLabel = 'Send for review', onSaved, onCancel,
}: {
  initial: Form; isNew?: boolean; canChangeRole?: boolean; submitLabel?: string; onSaved: () => Promise<void> | void; onCancel?: () => void;
}) {
  const [f, setF] = useState<Form>(initial);
  const [busy, setBusy] = useState<'save' | 'submit' | 'upload' | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const put = (k: keyof Form) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const ngo = f.requestedRole === 'ADMIN';
  const stu = f.requestedRole === 'STUDENT';
  const [country] = useState(homeCountry);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!f.institution.trim()) m.push(ngo ? 'organization' : stu ? 'university or school' : 'institution');
    if (!ngo && !f.department.trim()) m.push(stu ? 'programme' : 'department');
    if (!stu && !f.position.trim()) m.push(ngo ? 'your role' : 'position');
    if (ngo && !f.message.trim()) m.push('about your organization');
    if (stu && !f.proofUrl && !f.workEmail.trim()) m.push('your student card or enrolment certificate (or your university email)');
    if (!stu && !f.staffId.trim() && !f.workEmail.trim() && !f.proofUrl) m.push('a staff ID, work email or document');
    return m;
  }, [f, ngo, stu]);

  const upload = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) return toast.error('The document must be 4 MB or smaller.');
    setBusy('upload');
    try {
      const res = await authedFetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Upload failed');
      setF((p) => ({ ...p, proofUrl: body.url, proofName: file.name }));
      toast.success('Document attached');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async (submit: boolean) => {
    setBusy(submit ? 'submit' : 'save');
    try {
      const payload = { ...f, experienceYears: f.experienceYears === '' ? null : Number(f.experienceYears), submit };
      if (isNew) await api.post('/applications', payload);
      else await api.patch('/applications/mine', payload);
      toast.success(submit ? 'Application sent. We’ll let you know when an admin has reviewed it.' : 'Saved');
      await onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
      className="tone-panel space-y-6 rounded-3xl border border-zinc-200/80 dark:border-white/[0.06] p-5 sm:p-7"
    >
      {canChangeRole && (
        <fieldset>
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">I&apos;m applying as</legend>
          <div className="grid sm:grid-cols-3 gap-3">
            {(Object.keys(ROLE_INFO) as Requested[]).map((r) => {
              const Icon = ROLE_INFO[r].icon;
              const on = f.requestedRole === r;
              return (
                <button type="button" key={r} onClick={() => setF((p) => ({ ...p, requestedRole: r }))} aria-pressed={on}
                  className={cn('relative isolate flex items-center gap-3 p-3 rounded-xl border text-left text-sm transition-colors', on ? 'border-indigo-500' : 'border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-white/[0.02]')}>{on && <TabPill id="p-dashboard-application-page-0" variant="soft" />}
                  <Icon className={cn('w-5 h-5', on ? 'text-indigo-500' : 'text-zinc-400')} />
                  <span className="font-semibold text-zinc-900 dark:text-white">{ROLE_INFO[r].label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <section className="space-y-4">
        <h3 className="font-semibold text-zinc-900 dark:text-white">{ngo ? 'Your organization' : stu ? 'Where you study' : 'Where you teach'}</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={ngo ? 'Organization' : stu ? 'University or school' : 'Institution'} required hint={ngo ? undefined : 'Search 10,000+ universities worldwide, or type your own.'}>
            {ngo ? (
              <input className={input} value={f.institution} onChange={set('institution')} maxLength={150} placeholder="e.g. Green Earth Foundation" />
            ) : (
              <Combobox value={f.institution} onChange={put('institution')} options={loadUniversities} preferGroup={country} sizeHint="10,000+ universities" maxLength={150}
                placeholder={stu ? 'e.g. Université de Nantes' : 'e.g. Delhi University'} />
            )}
          </Field>
          <Field label={ngo ? 'Team / department' : stu ? 'Programme / field of study' : 'Department'} required={!ngo}>
            <Combobox value={f.department} onChange={put('department')} maxLength={120}
              options={ngo ? ORG_DEPARTMENTS : stu ? PROGRAMMES_AND_FIELDS : DEPARTMENTS}
              placeholder={ngo ? 'e.g. Partnerships' : stu ? 'e.g. Computer Science' : 'e.g. Computer Science'} />
          </Field>
          <Field label={ngo ? 'Your role' : stu ? 'Year / level' : 'Position'} required={!stu}>
            <Combobox value={f.position} onChange={put('position')} maxLength={100}
              options={ngo ? ORG_ROLES : stu ? STUDY_YEARS : STAFF_POSITIONS}
              placeholder={ngo ? 'e.g. Programme Officer' : stu ? 'e.g. 2nd year' : 'e.g. Assistant Professor'} />
          </Field>
          {!stu && (
            <Field label="Years of experience">
              <input className={input} type="number" min={0} max={60} value={f.experienceYears} onChange={set('experienceYears')} />
            </Field>
          )}
          {!ngo && !stu && (
            <Field label="Subjects you teach" hint="Pick as many as you like, or type your own and press Enter." className="sm:col-span-2">
              <Combobox multiple value={f.subjects} onChange={put('subjects')} options={SUBJECTS} maxLength={300} placeholder="e.g. Algorithms, Databases" />
            </Field>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-white">How we can confirm it&apos;s you</h3>
          <p className="text-sm text-zinc-500 mt-0.5">{stu ? 'Upload your student card or enrolment certificate (or give your university email). Documents get you approved fastest.' : 'Give at least one. A work email or a document gets you approved fastest.'}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={stu ? 'University email' : 'Work email'} hint="Your address at the institution; an admin may write to you there.">
            <input className={input} type="email" value={f.workEmail} onChange={set('workEmail')} maxLength={150} placeholder="name@university.edu" />
          </Field>
          <Field label={ngo ? 'Registration / staff ID' : stu ? 'Student ID number' : 'Staff / employee ID'}>
            <input className={input} value={f.staffId} onChange={set('staffId')} maxLength={60} />
          </Field>
          <Field label="Phone">
            <input className={input} type="tel" value={f.phone} onChange={set('phone')} maxLength={30} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Public profile" hint={stu ? 'Optional: LinkedIn or portfolio' : 'Staff page, LinkedIn or organization website'}>
            <input className={input} type="url" value={f.profileUrl} onChange={set('profileUrl')} maxLength={300} placeholder="https://" />
          </Field>
        </div>
        <div>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Document</span>
          <p className="text-xs text-zinc-500 mb-2">{stu ? 'Student card or enrolment certificate for this year.' : 'Staff ID card, appointment letter or organisation registration.'} PDF or photo, up to 4 MB. Only admins can see it.</p>
          {f.proofUrl ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 dark:border-white/10">
              <a href={safeHref(f.proofUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-indigo-500 min-w-0"><FileText className="w-4 h-4 shrink-0" /><span className="truncate">{f.proofName || 'Document'}</span></a>
              <button type="button" onClick={() => setF((p) => ({ ...p, proofUrl: null, proofName: null }))} className="text-zinc-400 hover:text-rose-500" aria-label="Remove document"><Trash2 className="w-4 h-4" /></button>
            </div>
          ) : (
            <label className={cn('flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-zinc-300 dark:border-white/15 text-sm text-zinc-500 cursor-pointer hover:border-indigo-500/60', busy === 'upload' && 'opacity-60 pointer-events-none')}>
              {busy === 'upload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {busy === 'upload' ? 'Uploading…' : 'Choose a file'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </section>

      <Field label={ngo ? 'About your organization' : 'Anything else we should know?'} required={ngo} hint={ngo ? 'What you do and how you want to work with universities.' : stu ? 'Optional.' : 'Optional. E.g. which courses you plan to run.'}>
        <textarea className={cn(input, 'min-h-[110px]')} value={f.message} onChange={set('message')} maxLength={2000} />
      </Field>

      {ngo && (
        <p className="flex gap-2 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="w-4 h-4 shrink-0" /> Organisation accounts get admin access to the platform, so these applications are checked especially carefully.</p>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-white/[0.05]">
        <p className="text-xs text-zinc-500">{missing.length ? `Still needed: ${missing.join(', ')}` : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Ready to send</span>}</p>
        <div className="flex gap-2">
          {onCancel && <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-300">Cancel</button>}
          <button type="button" onClick={() => void save(false)} disabled={!!busy} className="btn-secondary">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save draft'}
          </button>
          <button type="submit" disabled={!!busy || missing.length > 0} className="btn-primary">
            {busy === 'submit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
