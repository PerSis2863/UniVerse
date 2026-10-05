'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { Activity, AlertCircle, Ban, BarChart3, Bug, CheckCircle2, ClipboardList, Code2, CreditCard, Eye, Flame, Gauge, Hammer, History, Loader2, Mail, Megaphone, PenTool, Phone, Power, Radio, RefreshCw, Server, Settings2, ShieldCheck, Sparkles, ToggleRight, Trash2, Users, Wifi, Wrench, XCircle } from 'lucide-react';
import { confirmDialog } from '@/components/ui/Dialogs';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FEATURE_SWITCHES, parseSwitches } from '@/lib/feature-switches';
import { card, errorMessage, fetcher, field, refreshConsole, toastWithUndo } from './shared';
import { EmailScheduleCard } from './email-schedule';

// The owner console's Server tab: switch UniVerse between live, read-only and maintenance, show a
// notice on every page, and see the Cloudflare plan usage and the app's health at a glance. The
// Worker applies the switch (cloudflare/usage-guard.ts) within a minute; the owner always gets in.

export interface PlanUsage {
  paused: boolean; reason: string | null; resumeAt: string | null; checkedAt: string | null; error: string | null;
  meters: { key: string; label: string; used: number | null; limit: number; bytes?: boolean }[];
}
type Mode = 'LIVE' | 'READ_ONLY' | 'MAINTENANCE';
interface AiLimits { student: number; staff: number; site: number }
interface AiToday { limits: AiLimits; used: number; top: { id: string; name: string; role: string | null; calls: number }[] }
interface Control { mode: Mode; message: string | null; until: string | null; banner: string | null; switches: string | null; updatedAt: string }
interface ServerData {
  control: Control;
  usage: PlanUsage | null;
  health: { people: number; activeToday: number; signInsToday: number; messagesToday: number; openErrors: number; newErrors: number; pendingDeletions: number; suspended: number };
  settings?: { name: string; what: string; needed: boolean; set: boolean; problem: string | null }[];
  email?: { sentToday: number; skippedToday: number; sentMonth: number; daily: number; monthly: number; dailyReserve: number; monthlyReserve: number } | null;
  ai?: AiToday | null;
  online?: { count: number; people: { id: string; name: string; role: string; avatar: string | null; lastSeenAt: string | null }[] };
  adoption?: Record<string, number>;
  history: { id: string; summary: string; createdAt: string; undoneAt: string | null }[];
}

const MODES: { id: Mode; label: string; icon: typeof Power; text: string; tone: string }[] = [
  { id: 'LIVE', label: 'Live', icon: Power, text: 'Everyone can use UniVerse normally.', tone: 'emerald' },
  { id: 'READ_ONLY', label: 'Read-only', icon: Eye, text: 'People can sign in and look around, but can’t change or send anything. For backups and data fixes.', tone: 'amber' },
  { id: 'MAINTENANCE', label: 'Maintenance', icon: Wrench, text: 'Only you can get in; everyone else sees a maintenance page. Almost nothing counts toward Cloudflare limits.', tone: 'rose' },
];
const TONES: Record<string, string> = {
  emerald: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rose: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

// datetime-local wants "yyyy-MM-ddTHH:mm" in the viewer's time.
const toLocalInput = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '');

type Section = 'status' | 'usage' | 'cloudflare' | 'setup' | 'activity';
const SECTIONS: { id: Section; label: string; icon: typeof Power }[] = [
  { id: 'status', label: 'Status & switches', icon: Power },
  { id: 'usage', label: 'Usage & limits', icon: Gauge },
  { id: 'cloudflare', label: 'Cloudflare', icon: Server },
  { id: 'setup', label: 'Setup', icon: Settings2 },
  { id: 'activity', label: 'Activity', icon: Activity },
];
const SECTION_KEY = 'universe-console-server-section';
const readSection = (): Section => {
  try { const v = localStorage.getItem(SECTION_KEY); return SECTIONS.some((s) => s.id === v) ? (v as Section) : 'status'; } catch { return 'status'; }
};

export function ServerPanel({ onTab }: { onTab: (t: 'people' | 'errors' | 'deletions' | 'activity') => void }) {
  const { data, mutate } = useSWR<ServerData>('/owner/server', fetcher, { refreshInterval: 60_000 });
  const [section, setSection] = useState<Section>(readSection);
  const pick = (id: Section) => { setSection(id); try { localStorage.setItem(SECTION_KEY, id); } catch { /* storage unavailable */ } };
  if (!data) return <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />;
  const h = data.health;
  const mode = MODES.find((m) => m.id === data.control.mode) ?? MODES[0];
  const tiles: { label: string; value: number | string; sub?: string; icon: typeof Users; to: 'people' | 'errors' | 'deletions' | 'activity'; alert?: boolean }[] = [
    { label: 'Online now', value: data.online?.count ?? 0, sub: `${h.activeToday} active today`, icon: Wifi, to: 'activity' },
    { label: 'People', value: h.people, sub: h.suspended ? `${h.suspended} banned` : 'all accounts', icon: Users, to: 'people' },
    { label: 'Sign-ins today', value: h.signInsToday, sub: `${h.messagesToday} messages`, icon: Activity, to: 'activity' },
    { label: 'Open errors', value: h.openErrors, sub: `${h.newErrors} seen today`, icon: Bug, to: 'errors', alert: h.openErrors > 0 },
    { label: 'Deletion requests', value: h.pendingDeletions, sub: 'waiting for you', icon: Trash2, to: 'deletions', alert: h.pendingDeletions > 0 },
    { label: 'Emails today', value: data.email ? data.email.sentToday : '–', sub: data.email ? `of ${data.email.daily} · ${data.email.sentMonth} this month` : 'email not set up', icon: Mail, to: 'activity' },
  ];
  return (
    <div className="space-y-8">
      {/* Status header */}
      <div className={cn(card, 'p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center gap-5 justify-between relative overflow-hidden')}>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-indigo-500/[0.07] via-transparent to-fuchsia-500/[0.07] pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <span className={cn('w-14 h-14 rounded-2xl flex items-center justify-center border', TONES[mode.tone])}><mode.icon className="w-7 h-7" /></span>
          <div>
            <p className="text-sm text-zinc-500">UniVerse is</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">{mode.label}</p>
            <p className="text-sm text-zinc-500 mt-0.5">{mode.text}</p>
          </div>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <button onClick={() => pick('status')} className="btn-secondary">Change status</button>
          <button onClick={() => void mutate()} className="btn-ghost inline-flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Refresh</button>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 stagger">
        {tiles.map((t) => (
          <button key={t.label} onClick={() => onTab(t.to)} className={cn(card, 'lift p-5 text-left hover:border-indigo-500/40')}>
            <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', t.alert ? 'bg-rose-500/10 text-rose-500' : 'bg-indigo-500/10 text-indigo-500')}><t.icon className="w-[18px] h-[18px]" /></span>
            <p className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white tabular-nums">{typeof t.value === 'number' ? t.value.toLocaleString() : t.value}</p>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mt-1">{t.label}</p>
            {t.sub && <p className="text-xs text-zinc-500 mt-0.5 truncate">{t.sub}</p>}
          </button>
        ))}
      </div>

      {/* Sections */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-zinc-50/80 dark:bg-[#0a0d13]/80 backdrop-blur-xl">
        <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Server sections">
          {SECTIONS.map((x) => (
            <button key={x.id} role="tab" aria-selected={section === x.id} onClick={() => pick(x.id)}
              className={cn('shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors', section === x.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/[0.06] hover:border-indigo-400/50')}>
              <x.icon className="w-4 h-4" />{x.label}
            </button>
          ))}
        </div>
      </div>

      {section === 'status' && (
        <div className="grid xl:grid-cols-2 gap-6 items-start stagger">
          {/* Two columns of about equal height: the site and your emails | what everyone sees. */}
          <div className="space-y-6">
            <SwitchCard key={data.control.updatedAt} control={data.control} onSaved={() => void mutate()} />
            <EmailScheduleCard className={cn(card, 'p-6')} />
          </div>
          <div className="space-y-6">
            <NoticeCard key={`n-${data.control.updatedAt}`} banner={data.control.banner} onSaved={() => void mutate()} />
            <FeatureCard key={`f-${data.control.updatedAt}`} switches={data.control.switches} onSaved={() => void mutate()} />
          </div>
        </div>
      )}

      {section === 'usage' && (
        <div className="grid xl:grid-cols-2 gap-6 items-start stagger">
          <div className="space-y-6">
            <PlanUsageCard usage={data.usage} />
            {data.email && <EmailCard email={data.email} />}
          </div>
          <div className="space-y-6">
            {data.ai && <AiCard key={`a-${data.control.updatedAt}`} ai={data.ai} onSaved={() => void mutate()} />}
            {data.adoption && <AdoptionCard adoption={data.adoption} />}
          </div>
        </div>
      )}

      {section === 'cloudflare' && <CloudflareCard />}

      {section === 'setup' && (
        <div className="grid xl:grid-cols-[2fr_1fr] gap-6 items-start stagger">
          {data.settings && <SettingsCard settings={data.settings} />}
          <TestEmailCard configured={!!data.email} />
        </div>
      )}

      {section === 'activity' && (
        <div className="grid xl:grid-cols-2 gap-6 items-start stagger">
          <OnlineCard online={data.online} />
          <div className={cn(card, 'p-6')}>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-1"><History className="w-5 h-5 text-indigo-500" /> Server changes</h2>
            <p className="text-sm text-zinc-500 mb-4">Status, notices, feature switches and limits, newest first. Undo them from Changes &amp; undo.</p>
            {data.history.length === 0 ? <p className="text-sm text-zinc-500">No changes yet.</p> : (
              <ul className="divide-y divide-zinc-200 dark:divide-white/10">{data.history.map((c) => (
                <li key={c.id} className="py-3 flex items-start justify-between gap-4">
                  <span className={cn('text-sm text-zinc-800 dark:text-zinc-200', c.undoneAt && 'line-through opacity-60')}>{c.summary}</span>
                  <span className="text-xs text-zinc-400 shrink-0">{format(new Date(c.createdAt), 'd MMM, HH:mm')}</span>
                </li>
              ))}</ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Who has UniVerse open right now (active in the last 5 minutes). */
function OnlineCard({ online }: { online: ServerData['online'] }) {
  return (
    <div className={cn(card, 'p-6')}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-1"><Wifi className="w-5 h-5 text-emerald-500" /> Online now</h2>
      <p className="text-sm text-zinc-500 mb-4">{online?.count ? `${online.count} ${online.count === 1 ? 'person has' : 'people have'} UniVerse open (active in the last 5 minutes).` : 'Nobody else is online right now.'}</p>
      {!!online?.people.length && (
        <ul className="divide-y divide-zinc-200 dark:divide-white/10">{online.people.map((p) => (
          <li key={p.id} className="py-3 flex items-center gap-3">
            <span className="relative w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
              {p.name.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
            </span>
            <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{p.name}</span><span className="block text-xs text-zinc-500">{p.role.toLowerCase()}</span></span>
            <span className="text-xs text-zinc-400 shrink-0">{p.lastSeenAt ? formatDistanceToNow(new Date(p.lastSeenAt), { addSuffix: true }) : ''}</span>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

/** How much the newer features were used in the last 7 days. */
function AdoptionCard({ adoption }: { adoption: Record<string, number> }) {
  const rows: [string, string, typeof Activity][] = [
    ['assignments', 'Assignments set', ClipboardList], ['answers', 'Answers handed in', ClipboardList], ['aiDrafts', 'AI grading drafts', Sparkles],
    ['livePolls', 'Live polls', Radio], ['pollAnswers', 'Poll answers', Radio], ['calls', 'Calls started', Phone],
    ['codeRooms', 'Code rooms used', Code2], ['whiteboards', 'Whiteboards used', PenTool], ['studyDays', 'Study-streak days', Flame], ['safetyReports', 'Safety reports', ShieldCheck],
  ];
  return (
    <div className={cn(card, 'p-6')}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-1"><BarChart3 className="w-5 h-5 text-indigo-500" /> Feature use · last 7 days</h2>
      <p className="text-sm text-zinc-500 mb-4">What people are actually using, to see which features are worth promoting.</p>
      <div className="grid grid-cols-2 gap-3">
        {rows.map(([k, label, Icon]) => (
          <div key={k} className="rounded-xl border border-zinc-200 dark:border-white/[0.06] p-4">
            <p className="text-xs text-zinc-500 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white tabular-nums mt-1">{(adoption[k] ?? 0).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sends a test email to the owner, to check email works (counts as one email). */
function TestEmailCard({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.post('/owner/server/test-email');
      toast.success(`Test email sent to ${res.sentTo}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn(card, 'p-6')}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-1"><Mail className="w-5 h-5 text-indigo-500" /> Test email</h2>
      <p className="text-sm text-zinc-500 mb-4">{configured ? 'Sends one email to you to check delivery. It counts toward today’s allowance.' : 'Add the RESEND_API_KEY secret to send email.'}</p>
      <button onClick={() => void send()} disabled={busy || !configured} className="btn-secondary inline-flex items-center gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send me a test email</button>
    </div>
  );
}

/** Today's AI use and the daily limits that keep it inside Gemini's free allowance (src/server/ai-budget.ts). */
function AiCard({ ai, onSaved }: { ai: AiToday; onSaved: () => void }) {
  const [limits, setLimits] = useState<AiLimits>(ai.limits);
  const [busy, setBusy] = useState(false);
  const changed = (['student', 'staff', 'site'] as const).some((k) => limits[k] !== ai.limits[k]);
  const pct = ai.limits.site ? Math.min(100, Math.round((ai.used / ai.limits.site) * 100)) : 100;
  const save = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.post('/owner/server', { aiLimits: limits });
      toastWithUndo('AI limits saved', res.changeId);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const input = (k: keyof AiLimits, label: string) => (
    <label className="text-sm">
      <span className="text-xs text-zinc-500">{label}</span>
      <input type="number" min={0} max={100000} step={1} className={cn(field, 'mt-1')} value={limits[k]}
        onChange={(e) => setLimits({ ...limits, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
    </label>
  );
  return (
    <div className={cn(card, 'p-6')}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" /> AI use today</h2>
      <p className="text-sm text-zinc-500 mt-1 mb-3">
        Every AI tutor answer, summary, translation and report counts as one request. Answers many people ask for again (the same tutor question, a summary of the same file) are saved and don’t count. Limits reset at midnight UTC. You’re never limited.
      </p>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-zinc-900 dark:text-white tabular-nums">{ai.used.toLocaleString()} of {ai.limits.site.toLocaleString()} requests</span>
        <span className="text-xs text-zinc-500 tabular-nums">{pct}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="AI requests used today">
        <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
      </div>
      {ai.top.length > 0 && (
        <ul className="mt-3 text-sm divide-y divide-zinc-200 dark:divide-white/10">
          {ai.top.map((p) => (
            <li key={p.id} className="py-1.5 flex justify-between gap-3">
              <span className="truncate text-zinc-800 dark:text-zinc-200">{p.name}{p.role ? <span className="text-xs text-zinc-400"> · {p.role.toLowerCase()}</span> : null}</span>
              <span className="tabular-nums text-zinc-500 shrink-0">{p.calls}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid sm:grid-cols-3 gap-3">
        {input('student', 'Per student, each day')}
        {input('staff', 'Per teacher or admin, each day')}
        {input('site', 'Whole site, each day')}
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={() => void save()} disabled={busy || !changed} className="btn-primary">Save limits</button>
      </div>
    </div>
  );
}

/** Which Cloudflare settings the live site can see: names and yes/no only, never the values. */
type CfPart<T> = { ok: true; data: T } | { ok: false; error: string };
type CfAccount = {
  setup: boolean; checkedAt?: string; canEdit?: boolean;
  versions?: CfPart<{ at: string; versionId: string | null; version: string; by: string; note: string }[]>;
  builds?: CfPart<{ minutesUsed: number; minutesLimit: number; count: number; partial: boolean; recent: { at: string; outcome: string; minutes: number; branch: string; message: string }[] }>;
  database?: CfPart<{ name: string; bytes: number | null; tables: number | null }>;
  storage?: CfPart<{ buckets: string[] }>;
  traffic?: CfPart<{ days: { day: string; visitors: number; pageViews: number; requests: number }[]; visitors: number; pageViews: number; threats: number; bytes: number; countries: { code: string; requests: number }[] }>;
  attacks?: CfPart<{ limited: boolean; total: number; top: { count: number; action: string; source: string; clientCountryName: string }[] }>;
  domain?: CfPart<{ checks: { name: string; ok: boolean | null; note: string }[] }>;
  plan?: CfPart<{ name: string; price: number; currency: string; frequency: string; renews: string | null; state: string }[]>;
};

const size = (b: number | null) => (b == null ? '?' : b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`);
const short = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const okOf = <T,>(p?: CfPart<T>) => (p?.ok ? (p as { data: T }).data : null);
const panel = 'rounded-2xl border border-zinc-200/70 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.025] p-5 sm:p-6';

function Panel({ icon: Icon, title, tone = 'text-indigo-500 bg-indigo-500/10', className, children }: { icon: typeof Activity; title: string; tone?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn(panel, className)}>
      <h3 className="flex items-center gap-3 text-base font-semibold text-zinc-800 dark:text-zinc-100 mb-5">
        <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center', tone)}><Icon className="w-[18px] h-[18px]" /></span>{title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={cn(panel, 'relative overflow-hidden')}>
      <span className={cn('absolute inset-x-0 top-0 h-0.5', tone)} />
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-sm text-zinc-500 truncate">{sub}</p>}
    </div>
  );
}

const Pill = ({ tone, children }: { tone: 'good' | 'bad' | 'warn' | 'plain'; children: React.ReactNode }) => (
  <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0', {
    good: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', bad: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
    warn: 'bg-amber-500/12 text-amber-600 dark:text-amber-400', plain: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
  }[tone])}>{children}</span>
);

/** Live version, build minutes, visitors, security, domain, database and plan, read from Cloudflare with the read-only token. */
function CloudflareCard() {
  const [fresh, setFresh] = useState(0);
  const { data, isValidating } = useSWR<CfAccount>(`/owner/cloudflare${fresh ? `?fresh=1&n=${fresh}` : ''}`, fetcher, { refreshInterval: 300_000 });
  const missing = (p?: CfPart<unknown>) => (p && !p.ok ? <p className="text-xs text-zinc-500">Can&apos;t read this yet: {(p as { error: string }).error}</p> : null);
  // Every change to Cloudflare needs a code sent to the owner's email.
  const putBack = async (versionId: string, when: string) => {
    if (!(await confirmDialog({ title: `Put the version from ${when} back live?`, message: 'Use this when a new update broke something. We will email you a code to confirm.', confirmLabel: 'Email me a code' }))) return;
    try {
      await api.post('/owner/cloudflare/code');
      const code = window.prompt('Enter the 6-digit code we just emailed you:');
      if (!code) return;
      const res = (await api.post('/owner/cloudflare/rollback', { versionId, code })).data;
      toast.success(res.done);
      setFresh((n) => n + 1);
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const b = okOf(data?.builds), t = okOf(data?.traffic), db = okOf(data?.database), at = okOf(data?.attacks), dom = okOf(data?.domain);
  const buildPct = b ? Math.min(100, (b.minutesUsed / b.minutesLimit) * 100) : 0;
  const maxDay = Math.max(1, ...(t?.days.map((d) => d.visitors) ?? [1]));
  const totalReq = t?.countries.reduce((a, c) => a + c.requests, 0) || 1;
  const domainBad = dom?.checks.filter((c) => c.ok === false).length ?? 0;
  return (
    <div className={cn(card, 'p-6 sm:p-8')}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-7">
        <div>
          <h2 className="font-semibold text-xl text-zinc-900 dark:text-white flex items-center gap-2"><Server className="w-5 h-5 text-orange-500" /> Cloudflare account</h2>
          {data?.checkedAt && <p className="text-xs text-zinc-500 mt-0.5">Updated {formatDistanceToNow(new Date(data.checkedAt), { addSuffix: true })}</p>}
        </div>
        <button onClick={() => setFresh((n) => n + 1)} disabled={isValidating} className="btn-secondary inline-flex items-center gap-1.5 !py-1.5 text-xs">
          <RefreshCw className={cn('w-3.5 h-3.5', isValidating && 'animate-spin')} /> {isValidating ? 'Checking…' : 'Check now'}
        </button>
      </div>
      {!data ? <Loader2 className="w-5 h-5 animate-spin text-zinc-400" /> : !data.setup ? (
        <p className="text-sm text-zinc-500">Add the CF_ACCOUNT_ID and CF_USAGE_TOKEN secrets to see this.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat label="Visitors · 7 days" value={t ? short(t.visitors) : '–'} sub={t ? `${short(t.pageViews)} page views` : undefined} tone="bg-indigo-500" />
            <Stat label="Threats stopped · 7 days" value={t ? short(t.threats) : '–'} sub={t ? `${size(t.bytes)} sent` : undefined} tone="bg-rose-500" />
            <Stat label="Build minutes" value={b ? `${b.minutesUsed}${b.partial ? '+' : ''}` : '–'} sub={b ? `of ${b.minutesLimit.toLocaleString()} this month · ${b.count} builds` : undefined} tone={buildPct > 80 ? 'bg-rose-500' : 'bg-violet-500'} />
            <Stat label="Database" value={db ? size(db.bytes) : '–'} sub={db ? `of 5 GB${db.tables ? ` · ${db.tables} tables` : ''}` : undefined} tone="bg-emerald-500" />
          </div>
          <div className="grid xl:grid-cols-2 gap-6">
            <Panel icon={Users} title="Visitors · last 7 days">
              {t ? (
                <>
                  <div className="flex items-end gap-3 h-40">{t.days.map((d) => (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${d.visitors} visitors, ${d.pageViews} page views`}>
                      <span className="text-xs tabular-nums text-zinc-500">{short(d.visitors)}</span>
                      <div className="w-full rounded-lg bg-gradient-to-t from-indigo-600 to-fuchsia-400" style={{ height: `${Math.max(6, (d.visitors / maxDay) * 100)}%` }} />
                      <span className="text-xs text-zinc-500">{format(new Date(d.day), 'EEE')}</span>
                    </div>
                  ))}</div>
                  {t.countries.length > 0 && (
                    <div className="mt-6 space-y-2.5">{t.countries.map((c) => {
                      const pct = Math.round((c.requests / totalReq) * 100);
                      return (
                        <div key={c.code} className="flex items-center gap-3 text-sm">
                          <span className="w-10 font-semibold text-zinc-700 dark:text-zinc-200">{c.code}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, pct)}%` }} /></div>
                          <span className="w-12 text-right tabular-nums text-zinc-500">{pct}%</span>
                        </div>
                      );
                    })}</div>
                  )}
                </>
              ) : missing(data.traffic)}
            </Panel>
            <Panel icon={Ban} title="Security · last 24 hours" tone="text-rose-500 bg-rose-500/10">
              {at ? (at.limited ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">Cloudflare is protecting the site. {t ? <><b>{short(t.threats)}</b> threats were stopped in the last 7 days. </> : null}The detailed list of each blocked request needs a paid Cloudflare website plan.</p>
              ) : at.total === 0 ? <p className="text-sm text-emerald-600 dark:text-emerald-400">Nothing needed blocking.</p> : (
                <>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200 mb-2"><b>{at.total.toLocaleString()}</b> requests stopped</p>
                  <ul className="space-y-3">{at.top.map((x, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm"><Pill tone="bad">{x.count}</Pill><span className="text-zinc-600 dark:text-zinc-300">{x.action} by {x.source}</span>{x.clientCountryName && <span className="text-zinc-400">· {x.clientCountryName}</span>}</li>
                  ))}</ul>
                </>
              )) : missing(data.attacks)}
            </Panel>
            <Panel icon={Hammer} title="Builds" tone="text-violet-500 bg-violet-500/10">
              {b ? (
                <>
                  <div className="h-2.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><div className={cn('h-full rounded-full', buildPct > 80 ? 'bg-rose-500' : 'bg-gradient-to-r from-violet-500 to-indigo-500')} style={{ width: `${Math.max(1, buildPct)}%` }} /></div>
                  <p className="mt-2 text-sm text-zinc-500">{b.minutesUsed} of {b.minutesLimit.toLocaleString()} minutes used this month</p>
                  <ul className="mt-5 space-y-3.5">{b.recent.map((x) => (
                    <li key={x.at} className="flex items-start gap-3 text-sm">
                      <Pill tone={x.outcome === 'success' ? 'good' : /fail/.test(x.outcome) ? 'bad' : 'warn'}>{x.outcome === 'success' ? 'OK' : x.outcome}</Pill>
                      <span className="min-w-0 flex-1"><span className="block truncate text-zinc-700 dark:text-zinc-200">{x.message || x.branch}</span><span className="text-zinc-400">{formatDistanceToNow(new Date(x.at), { addSuffix: true })} · {x.minutes} min{x.branch === 'main' ? ' · live site' : ''}</span></span>
                    </li>
                  ))}</ul>
                </>
              ) : missing(data.builds)}
            </Panel>
            <Panel icon={History} title="Live site versions" tone="text-emerald-500 bg-emerald-500/10">
              {data.versions?.ok ? (
                <ul className="space-y-3.5">{data.versions.data.map((v, i) => (
                  <li key={v.at} className="flex items-center gap-3 text-sm">
                    {i === 0 ? <Pill tone="good">Live</Pill> : <Pill tone="plain">{v.version || 'earlier'}</Pill>}
                    <span className="flex-1 min-w-0 truncate text-zinc-600 dark:text-zinc-300">{format(new Date(v.at), 'd MMM, HH:mm')}{v.by ? ` · ${v.by}` : ''}{v.note ? ` · ${v.note}` : ''}</span>
                    {i > 0 && data.canEdit && v.versionId && <button onClick={() => void putBack(v.versionId!, format(new Date(v.at), 'd MMM, HH:mm'))} className="shrink-0 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Put back live</button>}
                  </li>
                ))}</ul>
              ) : missing(data.versions)}
            </Panel>
            <Panel icon={ShieldCheck} title="Domain health" tone={domainBad ? 'text-rose-500 bg-rose-500/10' : 'text-emerald-500 bg-emerald-500/10'}>
              {dom ? (
                <ul className="space-y-3.5">{dom.checks.map((c) => (
                  <li key={c.name} className="flex items-start gap-3 text-sm">
                    {c.ok === true ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : c.ok === false ? <XCircle className="w-4 h-4 text-rose-500 shrink-0" /> : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                    <span><span className="font-medium text-zinc-800 dark:text-zinc-100">{c.name}</span><span className="block text-zinc-500 break-words">{c.note}</span></span>
                  </li>
                ))}</ul>
              ) : missing(data.domain)}
            </Panel>
            <Panel icon={CreditCard} title="Plan and storage" tone="text-orange-500 bg-orange-500/10">
              {data.plan?.ok ? (
                <ul className="space-y-3.5">{data.plan.data.map((x, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-zinc-800 dark:text-zinc-100">{x.name}</span>
                    <span className="text-xs text-zinc-500">{x.price ? `${new Intl.NumberFormat('en', { style: 'currency', currency: x.currency }).format(x.price)}${x.frequency ? ` ${x.frequency}` : ''}` : <Pill tone="good">Free</Pill>}{x.renews ? ` · renews ${format(new Date(x.renews), 'd MMM')}` : ''}</span>
                  </li>
                ))}</ul>
              ) : missing(data.plan)}
              <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-white/10 text-sm flex items-center justify-between gap-2">
                <span className="text-zinc-500">File storage</span>
                {data.storage?.ok ? <span className="text-zinc-800 dark:text-zinc-100">{data.storage.data.buckets.join(', ') || 'none yet'}</span> : missing(data.storage)}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

/** Email sent against the Resend plan's allowance (src/server/email-budget.ts). */
function EmailCard({ email }: { email: NonNullable<ServerData['email']> }) {
  const rows = [
    { label: 'Today', sent: email.sentToday, limit: email.daily, reserve: email.dailyReserve },
    { label: 'This month', sent: email.sentMonth, limit: email.monthly, reserve: email.monthlyReserve },
  ];
  const tight = rows.some((r) => r.sent >= r.limit - r.reserve);
  return (
    <div className={cn(card, 'p-6')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Email allowance</h2>
        <span className={cn('text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border', tight ? TONES.rose : TONES.emerald)}>{tight ? 'Routine email paused' : 'OK'}</span>
      </div>
      <p className="text-sm text-zinc-500 mb-4">Notification emails stop before the plan runs out, keeping the rest for sign-in codes. People still get every notification in the app.{email.skippedToday ? ` ${email.skippedToday} email${email.skippedToday === 1 ? '' : 's'} skipped today.` : ''}</p>
      <div className="space-y-3">
        {rows.map((r) => {
          const pct = Math.min(100, Math.round((r.sent / r.limit) * 100));
          return (
            <div key={r.label} title={`${r.sent} of ${r.limit}; the last ${r.reserve} are kept for sign-in codes`}>
              <div className="flex justify-between text-sm"><span className="text-zinc-700 dark:text-zinc-300">{r.label}</span><span className="tabular-nums text-zinc-900 dark:text-white">{r.sent.toLocaleString()} / {r.limit.toLocaleString()}</span></div>
              <div className="h-1.5 mt-1 rounded-full bg-zinc-200 dark:bg-white/[0.08] overflow-hidden" aria-hidden><div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsCard({ settings }: { settings: NonNullable<ServerData['settings']> }) {
  const bad = settings.filter((s) => s.problem || (s.needed && !s.set)).length;
  return (
    <div className={cn(card, 'p-6')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Server settings</h2>
        <span className={cn('text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border', bad ? TONES.rose : TONES.emerald)}>{bad ? `${bad} to fix` : 'All good'}</span>
      </div>
      <p className="text-sm text-zinc-500 mb-4">What the live site can see in Cloudflare → universe-web → Settings → Variables and Secrets. Add each one there as type Secret, then Deploy. Values are never shown.</p>
      <ul className="divide-y divide-zinc-200 dark:divide-white/10">
        {settings.map((s) => (
          <li key={s.name} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
            <span><code className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{s.name}</code> <span className="text-xs text-zinc-500">· {s.what}</span></span>
            <span className={cn('text-xs font-semibold', s.problem ? 'text-rose-600 dark:text-rose-400' : s.set ? 'text-emerald-600 dark:text-emerald-400' : s.needed ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400')}>
              {s.problem ? 'Needs fixing' : s.set ? 'Set' : s.needed ? 'Missing' : 'Not set (optional)'}
            </span>
            {s.problem && <p className="basis-full text-xs text-rose-600 dark:text-rose-400">{s.problem}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SwitchCard({ control, onSaved }: { control: Control; onSaved: () => void }) {
  const [mode, setMode] = useState<Mode>(control.mode);
  const [message, setMessage] = useState(control.message ?? '');
  const [until, setUntil] = useState(toLocalInput(control.until));
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now()); // when this card was shown (it's re-created on every save)
  const ended = control.until && new Date(control.until).getTime() <= now;
  const current = ended ? 'LIVE' : control.mode;
  const changed = mode !== control.mode || message !== (control.message ?? '') || until !== toLocalInput(control.until);

  const save = async () => {
    if (mode === 'MAINTENANCE' && current !== 'MAINTENANCE' && !(await confirmDialog({ title: 'Pause UniVerse for maintenance?', message: 'Within a minute, everyone except you sees the maintenance page until you switch back to Live.', confirmLabel: 'Pause it', destructive: true }))) return;
    setBusy(true);
    try {
      const { data: res } = await api.post('/owner/server', { mode, message, until: mode === 'LIVE' || !until ? null : new Date(until).toISOString() });
      toastWithUndo(mode === 'LIVE' ? 'UniVerse is live' : mode === 'READ_ONLY' ? 'UniVerse is read-only' : 'UniVerse is paused for maintenance', res.changeId);
      onSaved();
      await refreshConsole();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = MODES.find((m) => m.id === current)!;
  return (
    <div className={cn(card, 'p-6')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Server</h2>
        <span className={cn('text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border', TONES[shown.tone])}>Now: {shown.label}</span>
      </div>
      <p className="text-sm text-zinc-500 mb-4">
        {control.mode !== 'LIVE' && control.until && !ended ? `Back to Live by itself on ${format(new Date(control.until), 'd MMM, HH:mm')}. ` : ''}
        Changes reach everyone within a minute. You can always get in.
      </p>
      <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Server mode">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)}
            className={cn('h-full text-left rounded-2xl border p-4 flex flex-col items-start justify-start transition-colors', mode === m.id ? TONES[m.tone] : 'border-zinc-200 dark:border-white/10 hover:border-indigo-500/40')}>
            <m.icon className="w-5 h-5 mb-2" />
            <p className="font-semibold text-zinc-900 dark:text-white">{m.label}</p>
            <p className="text-xs text-zinc-500 mt-1">{m.text}</p>
          </button>
        ))}
      </div>
      {mode !== 'LIVE' && (
        <div className="mt-4 grid sm:grid-cols-[1fr_16rem] gap-3">
          <label className="text-sm">
            <span className="text-xs text-zinc-500">Message for everyone (optional)</span>
            <input className={cn(field, 'mt-1')} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={mode === 'MAINTENANCE' ? 'UniVerse is being updated. Your work is saved.' : 'UniVerse is in read-only mode for maintenance'} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-zinc-500">Back to Live by itself at (optional)</span>
            <input type="datetime-local" className={cn(field, 'mt-1')} value={until} min={toLocalInput(new Date(now).toISOString())} onChange={(e) => setUntil(e.target.value)} />
          </label>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button onClick={() => void save()} disabled={busy || !changed} aria-busy={busy} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
      </div>
    </div>
  );
}

function NoticeCard({ banner, onSaved }: { banner: string | null; onSaved: () => void }) {
  const [text, setText] = useState(banner ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (value: string) => {
    setBusy(true);
    try {
      const { data: res } = await api.post('/owner/server', { banner: value });
      toastWithUndo(value ? 'Notice is showing' : 'Notice removed', res.changeId);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn(card, 'p-6')}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Megaphone className="w-4 h-4 text-indigo-500" /> Notice for everyone</h2>
      <p className="text-sm text-zinc-500 mt-1 mb-3">Shown at the top of every page when it opens, for example “Maintenance tonight 22:00 to 23:00”. People can close it.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input className={field} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a short notice" />
        <div className="flex gap-2 shrink-0">
          <button onClick={() => void save(text.trim())} disabled={busy || !text.trim() || text.trim() === (banner ?? '')} className="btn-primary">Show</button>
          {banner && <button onClick={() => void save('')} disabled={busy} className="btn-secondary">Remove</button>}
        </div>
      </div>
    </div>
  );
}

/** Turn single features off for everyone (the Worker refuses them; you still get through). */
function FeatureCard({ switches, onSaved }: { switches: string | null; onSaved: () => void }) {
  const [off, setOff] = useState(() => parseSwitches(switches));
  const [busy, setBusy] = useState<string | null>(null);
  const flip = async (id: string, label: string) => {
    const next = off.includes(id) ? off.filter((x) => x !== id) : [...off, id];
    setBusy(id);
    try {
      const { data: res } = await api.post('/owner/server', { switches: next });
      setOff(next);
      toastWithUndo(`${label}: ${next.includes(id) ? 'off' : 'on'}`, res.changeId);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className={cn(card, 'p-6')}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><ToggleRight className="w-4 h-4 text-indigo-500" /> Feature switches</h2>
      <p className="text-sm text-zinc-500 mt-1 mb-3">Turn one part of UniVerse off for everyone while the rest keeps working. People see a short “turned off for now” message. Changes reach everyone within a minute, and you can still use everything.</p>
      <ul className="grid sm:grid-cols-2 gap-2">
        {FEATURE_SWITCHES.map((f) => {
          const on = !off.includes(f.id);
          return (
            <li key={f.id}>
              <button role="switch" aria-checked={on} onClick={() => void flip(f.id, f.label)} disabled={busy !== null}
                className={cn('w-full text-left rounded-xl border p-3 flex items-start gap-3 transition-colors', on ? 'border-zinc-200 dark:border-white/10 hover:border-indigo-500/40' : 'border-rose-500/40 bg-rose-500/[0.06]')}>
                <span className={cn('mt-0.5 w-9 h-5 rounded-full p-0.5 shrink-0 transition-colors', on ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600')}>
                  <span className={cn('block w-4 h-4 rounded-full bg-white shadow transition-transform', on && 'translate-x-4')} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold text-sm text-zinc-900 dark:text-white">{f.label} {busy === f.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{!on && <span className="text-[10px] font-bold uppercase text-rose-500">off</span>}</span>
                  <span className="block text-xs text-zinc-500 mt-0.5">{f.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const amount = (n: number, bytes?: boolean) =>
  bytes ? `${(n / 1024 ** 3).toFixed(n < 1024 ** 3 ? 2 : 1)} GB` : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** The spending guard: how much of what the $5 Cloudflare plan includes has been used this month. */
export function PlanUsageCard({ usage }: { usage: PlanUsage | null }) {
  const meters = usage?.meters ?? [];
  const read = meters.filter((m) => m.used !== null).sort((a, b) => b.used! / b.limit - a.used! / a.limit);
  return (
    <div className={cn(card, 'p-5', usage?.paused && 'border-rose-500/50')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Cloudflare plan · this billing month</h2>
        {usage?.checkedAt && <span className="text-xs text-zinc-400">checked {formatDistanceToNow(new Date(usage.checkedAt), { addSuffix: true })}</span>}
      </div>
      {!usage ? (
        <p className="text-sm text-zinc-500">The spending guard hasn&apos;t run yet. It checks every 15 minutes once the CF_ACCOUNT_ID and CF_USAGE_TOKEN secrets are set.</p>
      ) : (
        <>
          <p className={cn('text-sm mb-3', usage.paused ? 'text-rose-500 font-semibold' : 'text-zinc-500')}>
            {usage.paused
              ? `Paused: ${usage.reason ?? 'an allowance ran low.'}${usage.resumeAt ? ` Opens again on ${format(new Date(usage.resumeAt), 'd MMM')}.` : ''}`
              : 'Running. The app pauses itself at 90% of any allowance, so the plan stays at $5. You get an email at 70%.'}
          </p>
          {read.length > 0 && (
            <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{read.map((m) => {
              const pct = Math.min(100, (m.used! / m.limit) * 100);
              return (
                <li key={m.key} className="rounded-xl border border-zinc-200/70 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.025] px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-zinc-600 dark:text-zinc-300 leading-snug">{m.label}</span>
                    <span className={cn('shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-full', pct >= 90 ? 'bg-rose-500/12 text-rose-500' : pct >= 70 ? 'bg-amber-500/12 text-amber-500' : 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400')}>{pct < 1 ? '<1' : Math.round(pct)}%</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{amount(m.used!, m.bytes)} <span className="text-xs font-normal text-zinc-400">of {amount(m.limit, m.bytes)}</span></p>
                  <div className="mt-2 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                    <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-gradient-to-r from-emerald-500 to-teal-400')} style={{ width: `${Math.max(pct, 1.5)}%` }} />
                  </div>
                </li>
              );
            })}</ul>
          )}
          {usage.error && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 whitespace-pre-wrap">Couldn&apos;t read some of it: {usage.error}</p>}
        </>
      )}
    </div>
  );
}
