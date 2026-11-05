'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Building2, CalendarClock, Check, Copy, HandHeart, History, Loader2, LogOut, MapPin, MessageSquareText, Minus, Pencil, Plus, RefreshCw, Trash2, TriangleAlert, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { FactorCard } from '@/components/ui/FactorCard';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { RELIEF_KINDS, RELIEF_KIND_LABEL, RELIEF_ORG_KIND_LABEL, RELIEF_ORG_ROLES, RELIEF_ORG_ROLE_LABEL, mayChangeRole, needScore, runsOrg, type ReliefKind, type ReliefOrgKind, type ReliefOrgRole } from '@/lib/relief';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { KIND_ICON, PostCard, type ReliefPost } from './ReliefApp';
import { OrgFields, Sheet, ShiftCard, type ShiftView } from './ReliefOrgs';

// One organisation's page in UniVerse Relief (M106, GET /relief/orgs/:id): headline numbers and its
// profile, the needs it handles and the open ones near its base, its supplies (anyone in it changes a
// count; every change is logged), its volunteer shifts and its members. Coordinators run it; the
// server checks every change (src/server/relief-orgs.ts), the page only hides what isn't yours.

interface Supply { id: string; name: string; kind: ReliefKind; unit: string; quantity: number; lowAt: number; low: boolean; updatedAt: string }
interface Member { id: string; name: string; role: ReliefOrgRole; since: string; me: boolean }
interface Text { id: string; channel: 'SMS' | 'WHATSAPP'; from: string; body: string; status: 'NEW' | 'POSTED' | 'CLOSED'; postId: string | null; createdAt: string }
interface OrgData {
  org: { id: string; name: string; kind: ReliefOrgKind; about: string | null; place: string | null; lat: number | null; lng: number | null; createdAt: string; code: string | null; textNumber: string | null };
  role: ReliefOrgRole;
  /** M107: text requests are switched on (the owner) and set up (Twilio); coordinators only see `texts`. */
  textsOn: boolean;
  texts: Text[] | null;
  members: Member[];
  supplies: Supply[];
  moves: { id: string; supplyId: string; change: number; note: string | null; at: string; by: string | null }[];
  shifts: ShiftView[];
  handling: ReliefPost[];
  near: ReliefPost[];
}
type Tab = 'overview' | 'needs' | 'supplies' | 'shifts' | 'members';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' }, { value: 'needs', label: 'Needs' }, { value: 'supplies', label: 'Supplies' },
  { value: 'shifts', label: 'Shifts' }, { value: 'members', label: 'Members' },
];
const label = 'text-xs font-medium text-zinc-600 dark:text-zinc-300';

export function OrgDashboard({ id, tab: start }: { id: string; tab: string | null }) {
  const key = `/relief/orgs/${id}`;
  const { data, error, mutate } = useSWR<OrgData>(key, fetcher);
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.value === start) ? (start as Tab) : 'overview');
  const run = runsOrg(data?.role);
  const refresh = () => void mutate();
  return (
    <>
      <Topbar title={data?.org.name ?? 'Organisation'} subtitle={data ? `${RELIEF_ORG_KIND_LABEL[data.org.kind] ?? data.org.kind}${data.org.place ? ` · ${data.org.place}` : ''} · you’re ${data.role === 'VOLUNTEER' ? 'a volunteer' : `the ${RELIEF_ORG_ROLE_LABEL[data.role].toLowerCase()}`}` : 'UniVerse Relief'} />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <Link href="/relief/orgs" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft className="w-4 h-4 rtl:rotate-180" aria-hidden />All organisations</Link>
          {error && !data ? (
            <div className="panel p-6 text-sm text-zinc-600 dark:text-zinc-300">{errorMessage(error, 'This organisation is gone, or you aren’t in it.')}</div>
          ) : !data ? (
            <div className="space-y-4"><div className="h-10 w-80 max-w-full rounded-full skeleton" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="panel h-44 skeleton" />)}</div></div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-1 px-1"><Segmented<Tab> segments={TABS} value={tab} onChange={setTab} label="Organisation sections" className="min-w-max" /></div>
              {tab === 'overview' && <Overview d={data} run={run} go={setTab} onChange={refresh} />}
              {tab === 'needs' && <Needs d={data} run={run} onChange={refresh} />}
              {tab === 'supplies' && <Supplies d={data} run={run} onChange={refresh} />}
              {tab === 'shifts' && <Shifts d={data} run={run} onChange={refresh} />}
              {tab === 'members' && <Members d={data} onChange={refresh} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Overview({ d, run, go, onChange }: { d: OrgData; run: boolean; go: (t: Tab) => void; onChange: () => void }) {
  const now = useNow();
  const low = d.supplies.filter((s) => s.low).length;
  const week = now ? d.shifts.filter((s) => new Date(s.endsAt).getTime() > now && new Date(s.startsAt).getTime() < now + 7 * 86_400_000) : [];
  const open = week.reduce((a, s) => a + Math.max(0, s.slots - s.filled), 0);
  const handling = d.handling.filter((p) => p.status === 'TAKEN').length;
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FactorCard icon={Users} label="Members" value={d.members.length} tone="dusk" onClick={() => go('members')} />
        <FactorCard icon={TriangleAlert} label="Supplies running low" value={low} unit={`of ${d.supplies.length}`} warn={low > 0} tone="gold" onClick={() => go('supplies')} />
        <FactorCard icon={CalendarClock} label="Places to fill this week" value={open} unit={`${week.length} ${week.length === 1 ? 'shift' : 'shifts'}`} tone="olive" onClick={() => go('shifts')} />
        <FactorCard icon={HandHeart} label="Needs you’re handling" value={handling} unit={`${d.near.length} open near you`} onClick={() => go('needs')} />
      </div>
      <section className="panel p-5" aria-labelledby="about-h">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="about-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Building2 className="w-5 h-5 text-orange-500" aria-hidden />About</h2>
          {run && <button type="button" onClick={() => setEditing(true)} className="btn-secondary btn-sm"><Pencil className="w-4 h-4" aria-hidden />Edit</button>}
        </div>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap max-w-[75ch]" translate="no">{d.org.about || 'No description yet.'}</p>
        <p className="mt-2 text-xs text-zinc-500">{d.org.lat === null ? 'No base set: set one to see the needs near you.' : `Base set${d.org.place ? ` in ${d.org.place}` : ''} (rounded to about 500 m).`} Started {new Date(d.org.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
      </section>
      {run && d.org.code && <Invite org={d.org} onChange={onChange} />}
      <LeaveButton org={d.org} />
      <AnimatePresence>{editing && <EditSheet d={d} onClose={() => setEditing(false)} onDone={() => { setEditing(false); onChange(); }} />}</AnimatePresence>
    </div>
  );
}

/** The join code and a link that opens "Join with a code" filled in; coordinators can replace it. */
function Invite({ org, onChange }: { org: OrgData['org']; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/relief/orgs?join=${org.code}`); setCopied(true); toast.success('Link copied'); setTimeout(() => setCopied(false), 1600); }
    catch { toast.error('Could not copy. Share the code instead.'); }
  };
  const renew = async () => {
    setBusy(true);
    try { await api.post(`/relief/orgs/${org.id}/code`); toast.success('New code made. The old one no longer works.'); onChange(); }
    catch (e) { toast.error(errorMessage(e, 'Could not make a new code.')); } finally { setBusy(false); }
  };
  return (
    <section className="panel p-5" aria-labelledby="invite-h">
      <h2 id="invite-h" className="font-bold text-zinc-900 dark:text-white">Invite your team</h2>
      <p className="mt-1 text-sm text-zinc-500 max-w-[70ch]">People join as volunteers with this code (Relief → Organisations → Join with a code), or with the link. Make them coordinators under Members.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-2xl bg-zinc-100 dark:bg-white/[0.06] px-4 py-2 font-mono text-xl font-bold tracking-[0.3em] text-zinc-900 dark:text-white" aria-label={`Join code ${org.code?.split('').join(' ')}`}>{org.code}</span>
        <button type="button" onClick={() => void copy()} className="btn-primary btn-sm">{copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}Copy the link</button>
        <button type="button" onClick={() => void renew()} disabled={busy} className="btn-secondary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" aria-hidden />}New code</button>
      </div>
    </section>
  );
}

function LeaveButton({ org }: { org: OrgData['org'] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    if (!window.confirm(`Leave ${org.name}? If you’re the last member, the organisation closes.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ closed: boolean }>(`/relief/orgs/${org.id}/leave`);
      toast.success(data.closed ? 'You left, and the organisation is closed.' : `You left ${org.name}.`);
      router.push('/relief/orgs');
    } catch (e) { toast.error(errorMessage(e, 'Could not leave.')); setBusy(false); }
  };
  return <button type="button" onClick={() => void leave()} disabled={busy} className="btn-secondary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4 rtl:rotate-180" aria-hidden />}Leave the organisation</button>;
}

function EditSheet({ d, onClose, onDone }: { d: OrgData; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: d.org.name, kind: d.org.kind, about: d.org.about ?? '', place: d.org.place ?? '', at: d.org.lat !== null && d.org.lng !== null ? { lat: d.org.lat, lng: d.org.lng } : null });
  const [number, setNumber] = useState(d.org.textNumber ?? '');
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await api.patch(`/relief/orgs/${d.org.id}`, { name: f.name, kind: f.kind, about: f.about, place: f.place, ...(f.at ?? {}), ...(d.textsOn ? { textNumber: number.trim() } : {}) }); toast.success('Saved'); onDone(); }
    catch (err) { toast.error(errorMessage(err, 'Could not save.')); setSaving(false); }
  };
  return (
    <Sheet title="Edit the organisation" onClose={onClose} onSubmit={(e) => void save(e)}>
      <OrgFields f={f} set={setF} />
      {d.textsOn && (
        <label className="mt-4 block"><span className={label}>Number for text requests (optional)</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="tel" maxLength={24} className="input mt-1" placeholder="+44 7700 900123" />
          <span className="mt-1 block text-xs text-zinc-500">The Twilio number people text (SMS or WhatsApp). Messages land under Needs, for coordinators only.</span>
        </label>
      )}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button type="submit" disabled={saving || !f.name.trim()} className="btn-primary">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Save</button></div>
    </Sheet>
  );
}

function Needs({ d, run, onChange }: { d: OrgData; run: boolean; onChange: () => void }) {
  const now = useNow();
  const { lat, lng } = d.org;
  const here = useMemo(() => (lat !== null && lng !== null ? { lat, lng } : null), [lat, lng]);
  const near = useMemo(() => [...d.near].sort((a, b) => needScore(b, here, now || 0) - needScore(a, here, now || 0)), [d.near, here, now]);
  const [busy, setBusy] = useState<string | null>(null);
  const take = async (p: ReliefPost) => {
    setBusy(p.id);
    try { await api.post(`/relief/posts/${p.id}/take`, { orgId: d.org.id }); toast.success(`${d.org.name} is on it. They can see you’re coming.`); onChange(); }
    catch (e) { toast.error(errorMessage(e, 'Could not take it.')); } finally { setBusy(null); }
  };
  const list = (rows: ReliefPost[], empty: string, extra?: (p: ReliefPost) => React.ReactNode) => rows.length === 0
    ? <p className="panel p-6 text-sm text-zinc-500 text-center">{empty}</p>
    : <div className="grid md:grid-cols-2 gap-3">{rows.map((p) => <div key={p.id} className="panel p-4"><PostCard p={p} now={now} here={here} onChange={onChange} extra={extra?.(p)} /></div>)}</div>;
  return (
    <div className="space-y-8">
      {run && (d.textsOn || !!d.texts?.length) && <Texts d={d} onChange={onChange} />}
      <section aria-labelledby="handling-h">
        <h2 id="handling-h" className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><HandHeart className="w-5 h-5 text-orange-500" aria-hidden />Needs you’re handling</h2>
        <p className="mt-1 text-sm text-zinc-500">Taken on for {d.org.name} in the last 30 days. {run ? 'Any coordinator can mark them delivered or give them back.' : 'Your coordinators mark them delivered.'}</p>
        <div className="mt-3">{list(d.handling, 'Nothing yet. Take on needs near you below, or from the live map.')}</div>
      </section>
      <section aria-labelledby="near-h">
        <h2 id="near-h" className="text-lg font-bold text-zinc-900 dark:text-white">Open needs near {d.org.place ?? 'your base'}</h2>
        <p className="mt-1 text-sm text-zinc-500">Within about 25 km, the most urgent and the ones waiting longest first.</p>
        <div className="mt-3">
          {!here ? <p className="panel p-6 text-sm text-zinc-500 text-center">Set your base under Overview → Edit to see the needs near you.</p>
            : list(near, 'No open needs near you right now.', run ? (p) => (
              <button type="button" disabled={!!busy} onClick={() => void take(p)} className="btn-primary btn-sm">{busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" aria-hidden />}Take for {d.org.name}</button>
            ) : undefined)}
        </div>
      </section>
    </div>
  );
}

/** Text requests (M107): coordinators only, since each one shows the sender's number. */
function Texts({ d, onChange }: { d: OrgData; onChange: () => void }) {
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const texts = d.texts ?? [];
  const waiting = texts.filter((t) => t.status === 'NEW').length;
  const close = async (t: Text) => {
    setBusy(t.id);
    try { await api.post(`/relief/texts/${t.id}/close`); toast.success('Marked as handled'); onChange(); }
    catch (e) { toast.error(errorMessage(e, 'Could not do that.')); } finally { setBusy(null); }
  };
  return (
    <section aria-labelledby="texts-h">
      <h2 id="texts-h" className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><MessageSquareText className="w-5 h-5 text-orange-500" aria-hidden />Text requests{waiting > 0 && <span className="rounded-full bg-orange-700 px-2 py-0.5 text-xs font-bold text-white">{waiting} new</span>}</h2>
      <p className="mt-1 text-sm text-zinc-500 max-w-[70ch]">{d.org.textNumber ? `People without the app text ${d.org.textNumber} (SMS or WhatsApp). Only coordinators see these. Put a request on the map, or call or text back from your phone.` : 'Text requests are on. Set your Twilio number under Overview → Edit, and point its messaging webhook to https://universeimpact.com/api/core/relief/texts/inbound.'}</p>
      {texts.length > 0 && (
        <ul className="mt-3 grid md:grid-cols-2 gap-3">
          {texts.map((t) => (
            <li key={t.id} className={cn('panel p-4', t.status === 'NEW' && 'ring-1 ring-orange-500/40')}>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">{t.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}</span>
                <a href={`tel:${t.from}`} className="font-mono underline-offset-2 hover:underline" translate="no">{t.from}</a>
                <span>{now ? formatDistanceToNow(new Date(t.createdAt), { addSuffix: true }) : ''}</span>
                <span className="ms-auto font-semibold">{t.status === 'NEW' ? 'New' : t.status === 'POSTED' ? 'On the map' : 'Handled'}</span>
              </p>
              <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap" translate="no">{t.body}</p>
              {t.status === 'NEW' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/relief?text=${t.id}&org=${d.org.id}`} className="btn-primary btn-sm"><MapPin className="w-4 h-4" aria-hidden />Put on the map</Link>
                  <a href={`sms:${t.from}`} className="btn-secondary btn-sm">Text back</a>
                  <button type="button" disabled={busy === t.id} onClick={() => void close(t)} className="btn-secondary btn-sm">{busy === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden />}Handled</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Supplies({ d, run, onChange }: { d: OrgData; run: boolean; onChange: () => void }) {
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const names = new Map(d.supplies.map((s) => [s.id, s]));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500 max-w-[65ch]">Everyone in {d.org.name} can change a count; each change is kept below with who made it.{run ? '' : ' Coordinators add and remove items.'}</p>
        {run && <button type="button" onClick={() => setAdding(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add an item</button>}
      </div>
      {d.supplies.length === 0 ? <p className="panel p-6 text-sm text-zinc-500 text-center">No supplies yet.{run ? ' Add what you keep in stock: water, food parcels, blankets…' : ''}</p> : (
        <ul className="panel divide-y divide-[var(--card-border)]" data-no-motion>
          {d.supplies.map((s) => <SupplyRow key={s.id} s={s} orgId={d.org.id} run={run} onChange={onChange} />)}
        </ul>
      )}
      {d.moves.length > 0 && (
        <section className="panel p-5" aria-labelledby="moves-h" data-no-motion>
          <h2 id="moves-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><History className="w-5 h-5 text-orange-500" aria-hidden />Latest changes</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {d.moves.map((m) => {
              const s = names.get(m.supplyId);
              return (
                <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 text-zinc-700 dark:text-zinc-200">
                  <span className={cn('font-mono font-semibold tabular-nums', m.change > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>{m.change > 0 ? '+' : '−'}{Math.abs(m.change)}</span>
                  <span translate="no">{s ? s.name : 'A removed item'}</span>
                  {m.note && <span className="text-zinc-500">“{m.note}”</span>}
                  <span className="text-xs text-zinc-500">{m.by ?? 'Someone'}{now ? ` · ${formatDistanceToNow(new Date(m.at), { addSuffix: true })}` : ''}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <AnimatePresence>{adding && <AddSupply orgId={d.org.id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); onChange(); }} />}</AnimatePresence>
    </div>
  );
}

function SupplyRow({ s, orgId, run, onChange }: { s: Supply; orgId: string; run: boolean; onChange: () => void }) {
  const I = KIND_ICON[s.kind] ?? KIND_ICON.OTHER;
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState('');
  const send = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try { await api.patch(`/relief/orgs/${orgId}/supplies/${s.id}`, body); if (ok) toast.success(ok); setCount(''); onChange(); }
    catch (e) { toast.error(errorMessage(e, 'Could not save.')); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${s.name} from your supplies? Its history goes too.`)) return;
    setBusy(true);
    try { await api.delete(`/relief/orgs/${orgId}/supplies/${s.id}`); onChange(); }
    catch (e) { toast.error(errorMessage(e, 'Could not remove it.')); setBusy(false); }
  };
  const level = () => {
    const v = window.prompt(`Show ${s.name} as running low at or below how many ${s.unit}?`, String(s.lowAt));
    if (v !== null && v.trim() !== '' && Number.isFinite(Number(v))) void send({ lowAt: Math.max(0, Math.round(Number(v))) }, 'Saved');
  };
  return (
    <li className="flex flex-wrap items-center gap-3 p-4">
      <span className={cn('w-10 h-10 shrink-0 grid place-items-center rounded-xl', s.low ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-orange-500/12 text-orange-600 dark:text-orange-300')}><I className="w-5 h-5" aria-hidden /></span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-semibold text-zinc-900 dark:text-white truncate" translate="no">{s.name}</p>
        <p className="text-xs text-zinc-500">{RELIEF_KIND_LABEL[s.kind] ?? s.kind}{s.lowAt > 0 ? ` · low at ${s.lowAt}` : ''}{s.low && <span className="ms-2 font-semibold text-amber-700 dark:text-amber-300">Running low</span>}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={busy || s.quantity === 0} onClick={() => void send({ change: -1 })} aria-label={`One fewer ${s.name}`} className="w-9 h-9 grid place-items-center rounded-full bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/10 disabled:opacity-40"><Minus className="w-4 h-4" aria-hidden /></button>
        <span className="min-w-[4.5rem] text-center"><span className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">{s.quantity}</span><span className="block text-[11px] text-zinc-500">{s.unit}</span></span>
        <button type="button" disabled={busy} onClick={() => void send({ change: 1 })} aria-label={`One more ${s.name}`} className="w-9 h-9 grid place-items-center rounded-full bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/10 disabled:opacity-40"><Plus className="w-4 h-4" aria-hidden /></button>
      </div>
      <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const n = Number(count); if (count.trim() && Number.isFinite(n)) void send(/^[+-]/.test(count.trim()) ? { change: Math.round(n) } : { quantity: Math.max(0, Math.round(n)) }, 'Count saved'); }}>
        <label className="sr-only" htmlFor={`count-${s.id}`}>New count for {s.name}, or +20 / −5 to add or take away</label>
        <input id={`count-${s.id}`} value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" placeholder="+20" className="input w-20 py-1.5" />
        <button type="submit" disabled={busy || !count.trim()} className="btn-secondary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set'}</button>
      </form>
      {run && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={level} disabled={busy} className="btn-secondary btn-sm">Low level</button>
          <button type="button" onClick={() => void remove()} disabled={busy} aria-label={`Remove ${s.name}`} className="w-9 h-9 grid place-items-center rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-600"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      )}
    </li>
  );
}

function AddSupply({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', kind: 'FOOD' as ReliefKind, unit: 'boxes', quantity: '0', lowAt: '0' });
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await api.post(`/relief/orgs/${orgId}/supplies`, { ...f, quantity: Number(f.quantity) || 0, lowAt: Number(f.lowAt) || 0 }); toast.success('Added'); onDone(); }
    catch (err) { toast.error(errorMessage(err, 'Could not add it.')); setSaving(false); }
  };
  return (
    <Sheet title="Add an item" onClose={onClose} onSubmit={(e) => void save(e)}>
      <label className="mt-4 block"><span className={label}>Item</span><input required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input mt-1" placeholder="Bottled water 1.5 L" /></label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block"><span className={label}>Kind</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ReliefKind })} className="input mt-1">{RELIEF_KINDS.map((k) => <option key={k} value={k}>{RELIEF_KIND_LABEL[k]}</option>)}</select></label>
        <label className="block"><span className={label}>Counted in</span><input required maxLength={24} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className="input mt-1" placeholder="boxes, litres, kits" /></label>
        <label className="block"><span className={label}>How many now</span><input type="number" min={0} max={1000000} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className="input mt-1" /></label>
        <label className="block"><span className={label}>Running low at</span><input type="number" min={0} max={1000000} value={f.lowAt} onChange={(e) => setF({ ...f, lowAt: e.target.value })} className="input mt-1" /></label>
      </div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button type="submit" disabled={saving || !f.name.trim()} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add</button></div>
    </Sheet>
  );
}

function Shifts({ d, run, onChange }: { d: OrgData; run: boolean; onChange: () => void }) {
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const cancel = async (s: ShiftView) => {
    if (!window.confirm(`Cancel “${s.title}”? Everyone signed up hears.`)) return;
    try { await api.delete(`/relief/orgs/${d.org.id}/shifts/${s.id}`); toast.success('Cancelled'); onChange(); }
    catch (e) { toast.error(errorMessage(e, 'Could not cancel it.')); }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500 max-w-[65ch]">Open shifts are listed for every Relief volunteer; members-only ones just for {d.org.name}. People get a reminder before they start.</p>
        {run && <button type="button" onClick={() => setAdding(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add a shift</button>}
      </div>
      {d.shifts.length === 0 ? <p className="panel p-6 text-sm text-zinc-500 text-center">No shifts coming up.{run ? ' Add the hours you need help: sorting donations, the kitchen, deliveries…' : ''}</p> : (
        <div className="grid md:grid-cols-2 gap-3">
          {d.shifts.map((s) => <ShiftCard key={s.id} s={s} now={now} onChange={onChange} admin={run ? <button type="button" onClick={() => void cancel(s)} className="btn-secondary btn-sm"><Trash2 className="w-4 h-4" aria-hidden />Cancel shift</button> : undefined} />)}
        </div>
      )}
      <AnimatePresence>{adding && <AddShift orgId={d.org.id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); onChange(); }} />}</AnimatePresence>
    </div>
  );
}

function AddShift({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ title: '', startsAt: '', hours: '3', slots: '4', place: '', details: '', membersOnly: false });
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date(f.startsAt);
    if (Number.isNaN(start.getTime())) { toast.error('Choose when it starts.'); return; }
    setSaving(true);
    try { await api.post(`/relief/orgs/${orgId}/shifts`, { ...f, startsAt: start.toISOString(), hours: Number(f.hours), slots: Number(f.slots) }); toast.success('Shift added. Volunteers can sign up now.'); onDone(); }
    catch (err) { toast.error(errorMessage(err, 'Could not add it.')); setSaving(false); }
  };
  return (
    <Sheet title="Add a shift" onClose={onClose} onSubmit={(e) => void save(e)}>
      <label className="mt-4 block"><span className={label}>What for</span><input required maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="input mt-1" placeholder="Sorting donations" /></label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block col-span-2"><span className={label}>Starts</span><input required type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} className="input mt-1" /></label>
        <label className="block"><span className={label}>Hours</span><input type="number" min={0.5} max={24} step={0.5} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} className="input mt-1" /></label>
        <label className="block"><span className={label}>People needed</span><input type="number" min={1} max={500} value={f.slots} onChange={(e) => setF({ ...f, slots: e.target.value })} className="input mt-1" /></label>
      </div>
      <label className="mt-3 block"><span className={label}>Where (optional)</span><input maxLength={120} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} className="input mt-1" placeholder="Our warehouse, Dock Road" /></label>
      <label className="mt-3 block"><span className={label}>Details (optional)</span><textarea rows={3} maxLength={600} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} className="input mt-1 resize-y" placeholder="What to bring, who to ask for." /></label>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={f.membersOnly} onChange={(e) => setF({ ...f, membersOnly: e.target.checked })} className="accent-orange-500" />Members only (not listed for everyone)</label>
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button type="submit" disabled={saving || !f.title.trim() || !f.startsAt} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add shift</button></div>
    </Sheet>
  );
}

function Members({ d, onChange }: { d: OrgData; onChange: () => void }) {
  const owners = d.members.filter((m) => m.role === 'OWNER').length;
  const [busy, setBusy] = useState<string | null>(null);
  const change = async (m: Member, role: ReliefOrgRole | null) => {
    if (!role && !window.confirm(`Remove ${m.name} from ${d.org.name}?`)) return;
    setBusy(m.id);
    try {
      if (role) await api.patch(`/relief/orgs/${d.org.id}/members/${m.id}`, { role }); else await api.delete(`/relief/orgs/${d.org.id}/members/${m.id}`);
      toast.success(role ? `${m.name} is now ${RELIEF_ORG_ROLE_LABEL[role].toLowerCase()}` : `${m.name} was removed`);
      onChange();
    } catch (e) { toast.error(errorMessage(e, 'Could not change that.')); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-6">
      <ul className="panel divide-y divide-[var(--card-border)]">
        {d.members.map((m) => {
          const roles = RELIEF_ORG_ROLES.filter((r) => r === m.role || mayChangeRole(d.role, m.role, r, owners));
          const can = !m.me && roles.length > 1;
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className="w-10 h-10 shrink-0 grid place-items-center rounded-full bg-zinc-100 dark:bg-white/[0.06] font-semibold text-zinc-700 dark:text-zinc-200" aria-hidden>{m.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900 dark:text-white truncate"><span translate="no">{m.name}</span>{m.me && <span className="ms-1 text-xs font-normal text-zinc-500">(you)</span>}</p>
                <p className="text-xs text-zinc-500">Joined {new Date(m.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              {can ? (
                <label className="text-sm"><span className="sr-only">Role of {m.name}</span>
                  <select value={m.role} disabled={busy === m.id} onChange={(e) => void change(m, e.target.value as ReliefOrgRole)} className="input w-auto py-1.5">{roles.map((r) => <option key={r} value={r}>{RELIEF_ORG_ROLE_LABEL[r]}</option>)}</select>
                </label>
              ) : <span className="rounded-full bg-zinc-100 dark:bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{RELIEF_ORG_ROLE_LABEL[m.role] ?? m.role}</span>}
              {!m.me && mayChangeRole(d.role, m.role, null, owners) && (
                <button type="button" disabled={busy === m.id} onClick={() => void change(m, null)} aria-label={`Remove ${m.name}`} className="w-9 h-9 grid place-items-center rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-600"><Trash2 className="w-4 h-4" aria-hidden /></button>
              )}
            </li>
          );
        })}
      </ul>
      {runsOrg(d.role) && d.org.code && <Invite org={d.org} onChange={onChange} />}
      <p className="text-xs text-zinc-500 max-w-[70ch]">Owners can do everything. Coordinators run the organisation: its items, shifts, needs and volunteers. Volunteers see it, change stock counts and sign up for members-only shifts. Nobody outside the organisation sees who is in it; it sees who signed up for its shifts.</p>
    </div>
  );
}
