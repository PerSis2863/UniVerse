'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import { ArrowLeft, BadgeCheck, CalendarClock, CalendarPlus, Clock, Copy, FileText, Globe2, HandHeart, Loader2, Lock, NotebookPen, Send, Trash2, Users, Video, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, impactTabs } from '@/components/layout/SectionTabs';
import { Switch } from '@/components/ui/Switch';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { ImpactReportView, type ImpactCallReport } from '@/components/impact/ImpactReport';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, list, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

// One impact room (Stage 4 · 4.12, src/server/impact-rooms.ts): the project's figures, posts,
// donations of time, the monthly impact call and its reports, upcoming shifts and who follows it.

type FollowRole = 'VOLUNTEER' | 'SPONSOR' | 'SUPPORTER';
interface Person { id: string; name: string; avatar: string | null; role: string }
interface Update { id: string; body: string; kind: 'UPDATE' | 'NOTES' | 'REPORT'; isPublic: boolean; callId: string | null; createdAt: string; author: Person; mine: boolean; canDelete: boolean }
interface Call { id: string; startsAt: string; title: string; reportAt: string | null; open?: boolean; hasReport?: boolean }
interface Room {
  id: string; name: string; description: string; type: string | null; location: string | null; duration: string | null; sdgNumber: number | null; skills: string[];
  active: boolean; isPublic: boolean; publicUrl: string | null;
  ngo: { name: string; logoUrl: string | null; websiteUrl: string | null; sector: string | null; isVerified: boolean };
  total: { hours: number; volunteers: number; shifts: number }; month: { hours: number; volunteers: number; shifts: number };
  pledged: { people: number; hoursPerMonth: number };
  followers: { count: number; byRole: Record<string, number>; people: (Person & { followRole: FollowRole })[] };
  following: FollowRole | null; staff: boolean; canPost: boolean;
  pledge: { hoursPerMonth: number; months: number; skill: string | null; note: string | null; startAt: string; endsAt: string; running: boolean; hoursThisMonth: number; hoursSoFar: number } | null;
  updates: Update[];
  calls: { callId: string; canJoin: boolean; upcoming: Call[]; past: Call[] };
  shifts: { id: string; title: string; startAt: string; endAt: string; location: string | null; left: number }[];
}

const ROLE_LABEL: Record<FollowRole, string> = { VOLUNTEER: 'Volunteer', SPONSOR: 'Sponsor', SUPPORTER: 'Supporter' };
const dateTime = (d: string) => new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** The value for a datetime-local input, in local time. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function ImpactRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const key = `/api/impact-rooms/${id}`;
  const { data, error, mutate } = useSWR<Room>(key, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [report, setReport] = useState<{ report: ImpactCallReport; verified: boolean } | null>(null);

  const run = async (what: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(what);
    try { await fn(); await mutate(); if (ok) toast.success(ok); return true; } catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(null); }
  };
  const call = (path: string, method: string, body?: unknown) => authedJson(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });

  if (error) return <div className="p-8 text-sm text-rose-500">{(error as Error).message}</div>;
  if (!data) return <div className="flex-1 p-6"><div className="h-96 rounded-2xl skeleton" /></div>;

  const follow = (r: FollowRole) => run('follow', () => call(`${key}/follow`, 'POST', { role: r }), `Following as ${ROLE_LABEL[r].toLowerCase()}`);
  const leave = async () => {
    if (data.pledge && !(await confirmDialog({ title: 'Leave this room?', message: 'Your pledge of time goes too.', confirmLabel: 'Leave', destructive: true }))) return;
    await run('follow', () => call(`${key}/follow`, 'DELETE'), 'You left the room');
  };
  const post = async () => {
    if (!text.trim()) return;
    if (await run('post', () => call(`${key}/updates`, 'POST', { body: text, public: isPublic }))) { setText(''); setIsPublic(false); }
  };
  const openReport = async (cid: string) => {
    try { setReport(await authedJson<{ report: ImpactCallReport; verified: boolean }>(`/api/impact-rooms/calls/${cid}/report`)); } catch (e) { toast.error((e as Error).message); }
  };
  const copyPublic = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/impact/${data.id}`); toast.success('Public link copied'); } catch { toast.error('Couldn’t copy the link.'); }
  };
  const shiftsHref = role === 'ADMIN' || role === 'TEACHER' ? '/admin/impact-reports/shifts' : '/student/impact/shifts';
  const stats = [
    { icon: Clock, label: 'Verified hours', value: data.total.hours, sub: data.month.hours ? `+${data.month.hours} this month` : 'none yet this month' },
    { icon: Users, label: 'Volunteers', value: data.total.volunteers, sub: `${data.total.shifts} shifts` },
    { icon: HandHeart, label: 'Hours pledged a month', value: data.pledged.hoursPerMonth, sub: `${data.pledged.people} ${data.pledged.people === 1 ? 'person' : 'people'}` },
    { icon: Globe2, label: 'Following', value: data.followers.count, sub: [data.followers.byRole.VOLUNTEER && `${data.followers.byRole.VOLUNTEER} volunteers`, data.followers.byRole.SPONSOR && `${data.followers.byRole.SPONSOR} sponsors`].filter(Boolean).join(' · ') || '—' },
  ];

  return (
    <>
      <Topbar title={data.name} sharedId={`impact-room:${id}`} subtitle={[data.ngo.name, data.location].filter(Boolean).join(' · ')} />
      <SectionTabs tabs={impactTabs(role)} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/impact-rooms" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-indigo-500"><ArrowLeft className="w-4 h-4" />Impact rooms</Link>
            <span className="flex-1" />
            {data.following ? (
              <>
                <span className="text-xs font-semibold rounded-full px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Following as {ROLE_LABEL[data.following].toLowerCase()}</span>
                <button type="button" disabled={!!busy} onClick={() => void leave()} className="text-xs font-semibold text-zinc-500 hover:text-rose-500 px-2">Leave</button>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!!busy} onClick={() => void follow('VOLUNTEER')} className="btn-primary">{busy === 'follow' ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandHeart className="w-4 h-4" />}Join as a volunteer</button>
                {role !== 'STUDENT' && <button type="button" disabled={!!busy} onClick={() => void follow('SPONSOR')} className="btn-secondary">As a sponsor</button>}
                <button type="button" disabled={!!busy} onClick={() => void follow('SUPPORTER')} className="btn-secondary">Follow</button>
              </div>
            )}
          </div>

          <motion.div variants={list} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((s) => (
              <motion.div key={s.label} variants={fadeUp} className={`panel p-4`}>
                <s.icon className="w-4 h-4 text-indigo-500" />
                <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-white tabular-nums">{s.value}</p>
                <p className="text-xs text-zinc-500">{s.label}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{s.sub}</p>
              </motion.div>
            ))}
          </motion.div>

          <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
            {/* Posts */}
            <section className="space-y-3 min-w-0">
              <div className={`panel p-4`}>
                <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-line">{data.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.ngo.isVerified && <span className="text-[11px] rounded-full px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><BadgeCheck className="w-3 h-3" />Verified NGO</span>}
                  {data.sdgNumber && <span className="text-[11px] rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">SDG {data.sdgNumber}</span>}
                  {data.type && <span className="text-[11px] rounded-full px-2 py-0.5 bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300">{data.type}</span>}
                  {data.skills.map((s) => <span key={s} className="text-[11px] rounded-full px-2 py-0.5 bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300">{s}</span>)}
                </div>
              </div>
              {data.canPost ? (
                <div className={`panel p-3`}>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder={data.staff ? 'Share news from the project… (@name to notify a follower)' : 'Share how it went, ask a question, offer help… (@name to notify someone)'} aria-label="New post" className={`input resize-none`} />
                  <div className="mt-2 flex items-center gap-3">
                    {data.staff && (
                      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                        <Switch checked={isPublic} onChange={setIsPublic} label="Show on the public page" />
                        Show on the public page
                      </label>
                    )}
                    <span className="flex-1" />
                    <button type="button" disabled={!!busy || !text.trim()} onClick={() => void post()} className="btn-primary">{busy === 'post' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Post</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500 px-1">Follow the room to post in it.</p>
              )}
              {data.updates.length === 0 ? <p className="text-sm text-zinc-500 px-1">No posts yet.</p> : (
                <ul className="space-y-3">
                  <AnimatePresence initial={false}>
                    {data.updates.map((u) => (
                      <motion.li key={u.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className={cn('panel', 'p-4', u.kind === 'REPORT' && 'border-indigo-400/40')}>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u.author.name} src={u.author.avatar} size={32} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{u.author.name}</span>
                            <span className="block text-[11px] text-zinc-500">{u.author.role === 'STUDENT' ? 'Student' : u.author.role === 'TEACHER' ? 'Teacher' : 'Staff'} · {formatDistanceToNowStrict(new Date(u.createdAt), { addSuffix: true })}</span>
                          </span>
                          {u.kind === 'REPORT' && <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><FileText className="w-3 h-3" />Report</span>}
                          {u.kind === 'NOTES' && <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-300 inline-flex items-center gap-1"><NotebookPen className="w-3 h-3" />Call notes</span>}
                          {u.isPublic ? <span title="On the public page"><Globe2 className="w-3.5 h-3.5 text-zinc-400" /></span> : <span title="Only people in UniVerse"><Lock className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" /></span>}
                          {u.canDelete && u.kind !== 'REPORT' && (
                            <button type="button" aria-label="Delete post" onClick={() => void (async () => { if (await confirmDialog({ title: 'Delete this post?', confirmLabel: 'Delete', destructive: true })) await run('del', () => call(`/api/impact-rooms/updates/${u.id}`, 'DELETE')); })()} className="p-1 text-zinc-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                        <p className="mt-2.5 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-line break-words">{u.body}</p>
                        {u.kind === 'REPORT' && u.callId && <button type="button" onClick={() => void openReport(u.callId!)} className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300">Read the full report</button>}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </section>

            {/* Side */}
            <aside className="space-y-4">
              <ImpactCallCard data={data} busy={busy} run={run} call={call} onJoin={() => router.push(`/call/${data.calls.callId}`)} onReport={(cid) => void openReport(cid)} />
              <PledgeCard data={data} busy={busy} run={run} call={call} />
              {data.shifts.length > 0 && (
                <section className={`panel p-4 space-y-2`}>
                  <div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-indigo-500" /><h2 className="text-sm font-semibold text-zinc-900 dark:text-white flex-1">Coming shifts</h2><Link href={shiftsHref} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">All shifts</Link></div>
                  {data.shifts.map((s) => (
                    <Link key={s.id} href={shiftsHref} className="block px-2 py-2 -mx-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
                      <span className="block text-sm text-zinc-800 dark:text-zinc-100 truncate">{s.title}</span>
                      <span className="block text-xs text-zinc-500">{dateTime(s.startAt)}{s.location ? ` · ${s.location}` : ''} · {s.left ? `${s.left} places left` : 'full'}</span>
                    </Link>
                  ))}
                </section>
              )}
              {data.staff && (
                <section className={`panel p-4 space-y-2`}>
                  <div className="flex items-center gap-3">
                    <Globe2 className="w-4 h-4 text-indigo-500" />
                    <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white">Public page</span><span className="block text-xs text-zinc-500">For sponsors: figures, public posts and reports. Never students.</span></span>
                    <Switch checked={data.isPublic} label="Public page" disabled={busy === 'public'} onChange={(on) => void run('public', () => call(key, 'PATCH', { public: on }), on ? 'The public page is on' : 'The public page is off')} />
                  </div>
                  {data.isPublic && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void copyPublic()} className="btn-secondary flex-1"><Copy className="w-4 h-4" />Copy link</button>
                      <a href={`/impact/${data.id}`} target="_blank" rel="noreferrer" className="btn-secondary">Open</a>
                    </div>
                  )}
                </section>
              )}
              <section className={`panel p-4`}>
                <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-indigo-500" /><h2 className="text-sm font-semibold text-zinc-900 dark:text-white">People</h2></div>
                {data.followers.people.length === 0 ? <p className="text-sm text-zinc-500">Nobody follows this room yet.</p> : (
                  <div className="flex flex-wrap gap-2">
                    {data.followers.people.map((p) => (
                      <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.05] pl-0.5 pr-2.5 py-0.5" title={ROLE_LABEL[p.followRole]}>
                        <Avatar name={p.name} src={p.avatar} size={22} />
                        <span className="text-xs text-zinc-700 dark:text-zinc-200">{p.name.split(/\s+/)[0]}</span>
                        {p.followRole !== 'SUPPORTER' && <span className="text-[10px] text-zinc-400">{ROLE_LABEL[p.followRole]}</span>}
                      </span>
                    ))}
                  </div>
                )}
                {data.ngo.websiteUrl && <a href={data.ngo.websiteUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-300"><Globe2 className="w-3 h-3" />{data.ngo.name} website</a>}
              </section>
            </aside>
          </div>
        </div>
      </div>
      {report && (
        <Sheet title="Impact report" onClose={() => setReport(null)}>
          <ImpactReportView report={report.report} verified={report.verified} />
        </Sheet>
      )}
    </>
  );
}

type Run = (what: string, fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
type Call_ = (path: string, method: string, body?: unknown) => Promise<unknown>;

/** The monthly impact call: join, plan (staff), and reports of past calls. */
function ImpactCallCard({ data, busy, run, call, onJoin, onReport }: { data: Room; busy: string | null; run: Run; call: Call_; onJoin: () => void; onReport: (cid: string) => void }) {
  const [planning, setPlanning] = useState(false);
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 7 * 86_400_000);
    d.setMinutes(0, 0, 0);
    d.setHours(17);
    return localInput(d);
  });
  const [title, setTitle] = useState('');
  const next = data.calls.upcoming[0];
  const plan = async () => {
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) return toast.error('Pick a date and time.');
    if (await run('plan', () => call(`/api/impact-rooms/${data.id}/calls`, 'POST', { startsAt: at.toISOString(), title: title.trim() || undefined }), 'Impact call planned. Followers were told.')) { setPlanning(false); setTitle(''); }
  };
  return (
    <section className={`panel p-4 space-y-3`}>
      <div className="flex items-center gap-2"><Video className="w-4 h-4 text-indigo-500" /><h2 className="text-sm font-semibold text-zinc-900 dark:text-white flex-1">Monthly impact call</h2></div>
      {next ? (
        <div className="rounded-xl bg-indigo-500/[0.07] p-3">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{next.title}</p>
          <p className="text-xs text-zinc-500">{dateTime(next.startsAt)}</p>
          <div className="mt-2 flex gap-2">
            {data.calls.canJoin && (next.open || data.staff) && <button type="button" onClick={onJoin} className="btn-primary flex-1"><Video className="w-4 h-4" />{next.open ? 'Join now' : 'Start early'}</button>}
            {data.staff && <button type="button" aria-label="Cancel this call" disabled={!!busy} onClick={() => void run('cancel', () => call(`/api/impact-rooms/calls/${next.id}`, 'DELETE'), 'Call cancelled')} className="btn-secondary"><X className="w-4 h-4" /></button>}
          </div>
          {!data.calls.canJoin && <p className="mt-2 text-xs text-zinc-500">Follow the room to join the call.</p>}
        </div>
      ) : <p className="text-sm text-zinc-500">No call planned yet.{data.staff ? '' : ' The people running the project plan one each month.'}</p>}
      {data.staff && (
        <>
          {!next && <button type="button" onClick={onJoin} className="btn-secondary w-full"><Video className="w-4 h-4" />Start a call now</button>}
          <AnimatePresence initial={false}>
            {planning ? (
              <motion.div key="plan" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="overflow-hidden space-y-2">
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="When" className="input" />
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Title (optional)" aria-label="Title" className="input" />
                <div className="flex gap-2">
                  <button type="button" disabled={!!busy} onClick={() => void plan()} className="btn-primary flex-1">{busy === 'plan' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}Plan the call</button>
                  <button type="button" onClick={() => setPlanning(false)} className="btn-secondary">Cancel</button>
                </div>
              </motion.div>
            ) : (
              <motion.button key="open" type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPlanning(true)} className="w-full text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center justify-center gap-1.5 py-1"><CalendarPlus className="w-3.5 h-3.5" />Plan {next ? 'another' : 'the next'} call</motion.button>
            )}
          </AnimatePresence>
          <p className="text-[11px] text-zinc-500">In the call, turn on Meeting notes (More). Afterwards, make the report: this month’s verified figures and what the call decided, signed for sponsors.</p>
        </>
      )}
      {data.calls.past.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-zinc-200/70 dark:border-white/[0.07]">
          {data.calls.past.slice(0, 6).map((c) => (
            <div key={c.id} className="flex items-center gap-2 pt-2">
              <span className="flex-1 min-w-0"><span className="block text-sm text-zinc-800 dark:text-zinc-100 truncate">{c.title}</span><span className="block text-[11px] text-zinc-500">{new Date(c.startsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
              {c.hasReport && <button type="button" onClick={() => onReport(c.id)} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Report</button>}
              {data.staff && (
                <button type="button" disabled={!!busy} onClick={() => void run(`rep-${c.id}`, () => call(`/api/impact-rooms/calls/${c.id}/report`, 'POST'), c.hasReport ? 'Report remade' : 'Report made and shared with followers')}
                  className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1">{busy === `rep-${c.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}{c.hasReport ? 'Remake' : 'Make report'}</button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Donating time: hours a month, with this month's verified hours against it. */
function PledgeCard({ data, busy, run, call }: { data: Room; busy: string | null; run: Run; call: Call_ }) {
  const p = data.pledge;
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(p?.hoursPerMonth ?? 4);
  const [months, setMonths] = useState(p?.months ?? 3);
  const [skill, setSkill] = useState(p?.skill ?? '');
  const save = async () => {
    if (await run('pledge', () => call(`/api/impact-rooms/${data.id}/pledge`, 'POST', { hoursPerMonth: hours, months, skill }), p ? 'Pledge updated' : 'Thank you! Your time is pledged.')) setEditing(false);
  };
  const pct = p ? Math.min(100, Math.round((p.hoursThisMonth / p.hoursPerMonth) * 100)) : 0;
  return (
    <section className={`panel p-4 space-y-3`}>
      <div className="flex items-center gap-2"><HandHeart className="w-4 h-4 text-emerald-500" /><h2 className="text-sm font-semibold text-zinc-900 dark:text-white flex-1">Donate time</h2></div>
      {p && !editing ? (
        <>
          <div>
            <div className="flex items-baseline justify-between text-sm"><span className="text-zinc-700 dark:text-zinc-200">This month</span><span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{p.hoursThisMonth} / {p.hoursPerMonth} h</span></div>
            <div className="mt-1.5 h-2 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={spring.gentle} />
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">{p.hoursSoFar} verified hours since you pledged{p.running ? ` · until ${new Date(p.endsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ' · this pledge has ended'}{p.skill ? ` · ${p.skill}` : ''}. Hours count when a shift on this project is checked in and out.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary flex-1">{p.running ? 'Change' : 'Pledge again'}</button>
            <button type="button" disabled={!!busy} onClick={() => void run('unpledge', () => call(`/api/impact-rooms/${data.id}/pledge`, 'DELETE'), 'Pledge taken back')} className="btn-secondary">Take back</button>
          </div>
        </>
      ) : !data.active ? <p className="text-sm text-zinc-500">This project has ended.</p> : (
        <div className="space-y-2">
          {!p && <p className="text-xs text-zinc-500">Promise hours a month. Your verified shift hours on this project count towards it, and sponsors see the total.</p>}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-zinc-500">Hours a month<input type="number" min={1} max={40} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={`input mt-1`} /></label>
            <label className="text-xs text-zinc-500">For<select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={`input mt-1`}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} {m === 1 ? 'month' : 'months'}</option>)}</select></label>
          </div>
          <input value={skill} onChange={(e) => setSkill(e.target.value)} maxLength={60} placeholder="What you can help with (optional)" aria-label="Skill" className="input" />
          <div className="flex gap-2">
            <button type="button" disabled={!!busy} onClick={() => void save()} className="btn-primary flex-1">{busy === 'pledge' ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandHeart className="w-4 h-4" />}{p ? 'Save' : 'Pledge my time'}</button>
            {p && <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>}
          </div>
        </div>
      )}
    </section>
  );
}
