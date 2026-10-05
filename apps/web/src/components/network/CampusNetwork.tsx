'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeftRight, Building2, GraduationCap, Loader2, MapPin, Pencil, Plus, Share2, Trash2, Users, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { confirmDialog } from '@/components/ui/Dialogs';
import { uploadChatFile } from '@/components/chat/chat-client';

// The campus network (upgrade 9) for admins (Global Impact → Partner institutions → Campus network)
// and teachers (Global collaboration → Research → Campus network): the directory of campuses with a
// map, sharing courses with partner campuses, and for admins the campuses themselves, exchange
// students and who belongs where. src/server/campus-network.ts

export interface CampusCard {
  id: string; name: string; country: string | null; city: string | null; logoUrl: string | null; lat: number | null; lng: number | null;
  students: number; teachers: number; courses: number; shared: number; exchange: number; domains?: string[];
}
export interface Network {
  campuses: CampusCard[];
  me: { campusId: string | null; campusName: string | null; networkVisible: boolean; exchange: { campusId: string; campusName: string | null; from: string | null; until: string | null; now: boolean } | null };
  unassigned: number | null;
}
interface ShareCourse { id: string; code: string; name: string; status: string; teacher: string; students: number; home: { id: string; name: string } | null; sharedWith: { id: string; name: string }[] }
interface Exchange { id: string; name: string; email: string; home: string | null; host: string; from: string | null; until: string | null; now: boolean }

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const input = 'w-full px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
const label = 'text-xs font-semibold text-zinc-600 dark:text-zinc-300';
const nf = new Intl.NumberFormat('en-US');
const dateText = (v: string | null) => (v ? new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' }) : '');

export const useNetwork = () => useSWR<Network>('/api/network', authedJson, { revalidateOnFocus: false });

/** Campuses as dots on a plain SVG (no map tiles: the CSP blocks them), sized by students. */
function CampusMap({ campuses }: { campuses: CampusCard[] }) {
  const [hover, setHover] = useState<CampusCard | null>(null);
  const places = campuses.filter((c): c is CampusCard & { lat: number; lng: number } => c.lat !== null && c.lng !== null);
  if (!places.length) return null;
  const W = 600, H = 220;
  const lats = places.map((p) => p.lat), lngs = places.map((p) => p.lng);
  const pad = (a: number[]) => Math.max(1, (Math.max(...a) - Math.min(...a)) * 0.2);
  const minLng = Math.min(...lngs) - pad(lngs), maxLng = Math.max(...lngs) + pad(lngs);
  const minLat = Math.min(...lats) - pad(lats), maxLat = Math.max(...lats) + pad(lats);
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * W;
  const y = (lat: number) => H - ((lat - minLat) / (maxLat - minLat)) * H;
  const most = Math.max(...places.map((p) => p.students), 1);
  return (
    <div className="relative rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-white/[0.07] bg-gradient-to-br from-indigo-50 to-sky-50 dark:from-indigo-500/[0.05] dark:to-sky-500/[0.05]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`Map of ${places.length} campuses`}>
        {[0.25, 0.5, 0.75].map((f) => <line key={`h${f}`} x1={0} x2={W} y1={H * f} y2={H * f} className="stroke-zinc-300/60 dark:stroke-white/10" strokeDasharray="4 6" />)}
        {[0.25, 0.5, 0.75].map((f) => <line key={`v${f}`} y1={0} y2={H} x1={W * f} x2={W * f} className="stroke-zinc-300/60 dark:stroke-white/10" strokeDasharray="4 6" />)}
        {places.map((p, i) => (
          <motion.circle key={p.id} cx={x(p.lng)} cy={y(p.lat)} initial={{ r: 0 }} animate={{ r: 6 + 12 * Math.sqrt(p.students / most) }} transition={{ ...spring.gentle, delay: i * 0.04 }}
            className="fill-indigo-500/60 stroke-indigo-600 dark:stroke-indigo-300 cursor-pointer" strokeWidth={1.5} tabIndex={0}
            onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p)} onBlur={() => setHover(null)}>
            <title>{`${p.name}: ${p.students} students`}</title>
          </motion.circle>
        ))}
      </svg>
      {hover && <p className="absolute left-3 bottom-3 rounded-lg bg-white/90 dark:bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 shadow">{hover.name}{hover.city ? ` · ${hover.city}` : ''} · <b>{nf.format(hover.students)}</b> students</p>}
    </div>
  );
}

function Stat({ icon: Icon, value, text }: { icon: typeof Users; value: number; text: string }) {
  return <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300"><Icon className="w-3.5 h-3.5 text-zinc-400" aria-hidden /><b className="tabular-nums text-zinc-900 dark:text-white">{nf.format(value)}</b> {text}</span>;
}

/** The directory: every campus with its counts (never people), and the map when campuses have a location. */
export function CampusDirectory({ network, onEdit }: { network: Network; onEdit?: (c: CampusCard) => void }) {
  const mine = network.me.campusId;
  return (
    <section className="space-y-3" aria-labelledby="campus-directory">
      <h2 id="campus-directory" className="text-lg font-bold text-zinc-900 dark:text-white">Campuses in the network</h2>
      <CampusMap campuses={network.campuses} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
        {network.campuses.map((c) => (
          <div key={c.id} className={cn(card, 'p-4 flex flex-col gap-3', c.id === mine && 'ring-1 ring-indigo-400/60')}>
            <div className="flex items-start gap-3">
              {c.logoUrl
                // eslint-disable-next-line @next/next/no-img-element -- an admin's https logo link; next/image can't optimise on Workers
                ? <img src={c.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover bg-zinc-100 dark:bg-white/10 shrink-0" />
                : <span className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" aria-hidden /></span>}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900 dark:text-white truncate">{c.name}</p>
                <p className="text-xs text-zinc-500 truncate">{[c.city, c.country].filter(Boolean).join(', ') || 'Location not set'}{c.id === mine ? ' · your campus' : ''}</p>
              </div>
              {onEdit && <button type="button" onClick={() => onEdit(c)} aria-label={`Edit ${c.name}`} className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Pencil className="w-4 h-4" /></button>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Stat icon={Users} value={c.students} text="students" />
              <Stat icon={GraduationCap} value={c.teachers} text="teachers" />
              <Stat icon={Building2} value={c.courses} text="courses" />
              {c.shared > 0 && <Stat icon={Share2} value={c.shared} text="joint courses" />}
              {c.exchange > 0 && <Stat icon={ArrowLeftRight} value={c.exchange} text="on exchange here" />}
            </div>
            {c.domains && <p className="text-[11px] text-zinc-500 truncate" title={c.domains.join(', ')}>{c.domains.length ? `Email: ${c.domains.join(', ')}` : 'No email domains: people join it only when an admin moves them'}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Let partner campuses find me": also in Settings → Privacy. */
export function VisibilitySwitch({ network, onChange }: { network: Network; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const on = network.me.networkVisible;
  const flip = async () => {
    setBusy(true);
    try {
      await authedJson('/api/network', { method: 'PATCH', body: JSON.stringify({ networkVisible: !on }) });
      onChange();
      toast.success(on ? 'People at partner campuses can no longer find you' : 'People at partner campuses can now find you in search');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <label className={cn(card, 'p-4 flex items-center justify-between gap-4 cursor-pointer')}>
      <span>
        <span className="block text-sm font-semibold text-zinc-900 dark:text-white">Let partner campuses find me</span>
        <span className="block text-xs text-zinc-500 mt-0.5">People at other campuses in the network can find you in search and message you. Your own campus always can.</span>
      </span>
      <input type="checkbox" className="sr-only peer" checked={on} disabled={busy} onChange={() => void flip()} />
      <span aria-hidden className="relative w-11 h-6 shrink-0 rounded-full bg-zinc-300 dark:bg-white/15 peer-checked:bg-indigo-500 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/50" />
    </label>
  );
}

/** Share courses with partner campuses: teachers see their own courses, admins every course. */
export function ShareCourses({ network, admin }: { network: Network; admin: boolean }) {
  const { data, mutate, isLoading } = useSWR<ShareCourse[]>('/api/network/courses', authedJson, { revalidateOnFocus: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const share = async (c: ShareCourse, campusId: string) => {
    if (!campusId) return;
    setBusy(c.id);
    try {
      const r = await authedJson<{ campus: string }>('/api/network/courses', { method: 'POST', body: JSON.stringify({ courseId: c.id, campusId }) });
      await mutate();
      toast.success(`${c.code} is open to ${r.campus} students`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const unshare = async (c: ShareCourse, campus: { id: string; name: string }) => {
    setBusy(c.id);
    try {
      await authedJson(`/api/network/courses?courseId=${encodeURIComponent(c.id)}&campusId=${encodeURIComponent(campus.id)}`, { method: 'DELETE' });
      await mutate();
      toast.success(`${c.code} is no longer shared with ${campus.name}. Students who joined stay enrolled.`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const list = (data ?? []).filter((c) => !filter || `${c.code} ${c.name} ${c.teacher}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <section className="space-y-3" aria-labelledby="joint-courses">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="joint-courses" className="text-lg font-bold text-zinc-900 dark:text-white">Joint courses</h2>
          <p className="text-sm text-zinc-500">Share a course with a partner campus and its students can find and join it (class calls included).</p>
        </div>
        {admin && (data?.length ?? 0) > 8 && <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a course" aria-label="Find a course" className={cn(input, 'max-w-56 py-2')} />}
      </div>
      {network.campuses.length < 2 ? (
        <p className={cn(card, 'p-5 text-sm text-zinc-500')}>{admin ? 'Add at least two campuses to share courses between them.' : 'Your school needs at least two campuses in the network before courses can be shared.'}</p>
      ) : isLoading ? (
        <div className="h-32 rounded-2xl skeleton" />
      ) : !list.length ? (
        <p className={cn(card, 'p-5 text-sm text-zinc-500')}>{admin ? 'No courses yet.' : 'You don’t teach any courses yet.'}</p>
      ) : (
        <div className={cn(card, 'divide-y divide-zinc-200 dark:divide-white/[0.06]')}>
          {list.slice(0, admin ? 100 : 60).map((c) => {
            const options = network.campuses.filter((x) => x.id !== c.home?.id && !c.sharedWith.some((s) => s.id === x.id));
            return (
              <div key={c.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="min-w-0 md:w-72 shrink-0">
                  <p className="font-medium text-zinc-900 dark:text-white truncate"><b>{c.code}</b> · {c.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{admin ? `${c.teacher} · ` : ''}{c.home ? c.home.name : 'No campus'} · {c.students} students{c.status !== 'PUBLISHED' ? ' · draft' : ''}</p>
                </div>
                <div className="flex-1 flex flex-wrap items-center gap-2">
                  <AnimatePresence initial={false}>
                    {c.sharedWith.map((s) => (
                      <motion.span key={s.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring.snappy}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
                        {s.name}
                        <button type="button" onClick={() => void unshare(c, s)} disabled={busy === c.id} aria-label={`Stop sharing ${c.code} with ${s.name}`} className="p-0.5 rounded-full hover:bg-indigo-500/20"><X className="w-3 h-3" /></button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  {options.length > 0 && (
                    <select aria-label={`Share ${c.code} with a campus`} value="" disabled={busy === c.id} onChange={(e) => void share(c, e.target.value)}
                      className="h-8 rounded-full bg-zinc-100 dark:bg-white/[0.06] px-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40">
                      <option value="">+ Share with…</option>
                      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  )}
                  {busy === c.id && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" aria-hidden />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const EMPTY_FORM = { name: '', country: '', city: '', emailDomains: '', lat: '', lng: '', logoUrl: '' };

/** Add or edit a campus (admins). */
function CampusForm({ editing, onDone, onCancel }: { editing: CampusCard | null; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState(() => editing
    ? { name: editing.name, country: editing.country ?? '', city: editing.city ?? '', emailDomains: (editing.domains ?? []).join(', '), lat: editing.lat?.toString() ?? '', lng: editing.lng?.toString() ?? '', logoUrl: editing.logoUrl ?? '' }
    : EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Pick an image file.'); return; }
    setUploading(true);
    try { setF((v) => ({ ...v, logoUrl: '' })); const url = await uploadChatFile(file); setF((v) => ({ ...v, logoUrl: url })); }
    catch (e) { toast.error((e as Error).message); } finally { setUploading(false); }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = JSON.stringify({ ...f, lat: f.lat || null, lng: f.lng || null });
      const r = editing
        ? await authedJson<{ moved: number }>(`/api/network/campuses/${editing.id}`, { method: 'PATCH', body })
        : await authedJson<{ moved: number }>('/api/network/campuses', { method: 'POST', body });
      toast.success(`${editing ? 'Saved' : 'Campus added'}${r.moved ? ` · ${r.moved} ${r.moved === 1 ? 'person' : 'people'} joined it by email domain` : ''}`);
      onDone();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!editing) return;
    const ok = await confirmDialog({ title: `Remove ${editing.name}?`, message: 'Its people keep their accounts and simply have no campus, so they can see every course again. Courses shared with it stop being shared.', destructive: true, confirmLabel: 'Remove campus' });
    if (!ok) return;
    try { await authedJson(`/api/network/campuses/${editing.id}`, { method: 'DELETE' }); toast.success('Campus removed'); onDone(); } catch (err) { toast.error((err as Error).message); }
  };
  return (
    <motion.form onSubmit={save} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.smooth} className={cn(card, 'p-4 md:p-5 space-y-4')}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-zinc-900 dark:text-white">{editing ? `Edit ${editing.name}` : 'Add a campus'}</h3>
        <button type="button" onClick={onCancel} aria-label="Close" className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2"><span className={label}>Name</span><input id="campus-name" required maxLength={120} value={f.name} onChange={set('name')} className={input} placeholder="e.g. Lakeside University" /></label>
        <label className="space-y-1 sm:col-span-2"><span className={label}>Email domains</span><input id="campus-domains" value={f.emailDomains} onChange={set('emailDomains')} className={input} placeholder="lakeside.edu, student.lakeside.edu" />
          <span className="block text-[11px] text-zinc-500">People who sign in with these addresses join this campus automatically. Shared services like gmail.com aren’t allowed.</span></label>
        <label className="space-y-1"><span className={label}>City</span><input id="campus-city" maxLength={80} value={f.city} onChange={set('city')} className={input} /></label>
        <label className="space-y-1"><span className={label}>Country</span><input id="campus-country" maxLength={80} value={f.country} onChange={set('country')} className={input} /></label>
        <label className="space-y-1"><span className={label}>Latitude (for the map)</span><input id="campus-lat" inputMode="decimal" value={f.lat} onChange={set('lat')} className={input} placeholder="48.8566" /></label>
        <label className="space-y-1"><span className={label}>Longitude</span><input id="campus-lng" inputMode="decimal" value={f.lng} onChange={set('lng')} className={input} placeholder="2.3522" /></label>
        <div className="space-y-1 sm:col-span-2">
          <span className={label}>Logo (optional)</span>
          <div className="flex items-center gap-3">
            {f.logoUrl
              // eslint-disable-next-line @next/next/no-img-element -- uploaded to our own storage; next/image can't optimise on Workers
              ? <img src={f.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover bg-zinc-100 dark:bg-white/10" />
              : <span className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center text-zinc-400"><Building2 className="w-5 h-5" aria-hidden /></span>}
            <label className="btn-secondary cursor-pointer">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}{f.logoUrl ? 'Change' : 'Upload'}
              <input id="campus-logo" type="file" accept="image/*" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
            {f.logoUrl && <button type="button" onClick={() => setF({ ...f, logoUrl: '' })} className="text-xs font-semibold text-zinc-500 hover:text-rose-500">Remove</button>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || uploading || !f.name.trim()} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? 'Save' : 'Add campus'}</button>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        {editing && <button type="button" onClick={() => void remove()} className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /> Remove campus</button>}
      </div>
    </motion.form>
  );
}

/** Exchange students: add one by email, end one early (admins). */
function ExchangeStudents({ network }: { network: Network }) {
  const { data, mutate } = useSWR<Exchange[]>('/api/network/exchange', authedJson, { revalidateOnFocus: false });
  const [f, setF] = useState({ email: '', campusId: '', from: '', until: '' });
  const [busy, setBusy] = useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authedJson<{ name: string; campus: string }>('/api/network/exchange', { method: 'PUT', body: JSON.stringify(f) });
      toast.success(`${r.name} is on exchange at ${r.campus}. They were told in the app.`);
      setF({ email: '', campusId: '', from: '', until: '' });
      await mutate();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  const end = async (x: Exchange) => {
    if (!(await confirmDialog({ title: `End ${x.name}’s exchange?`, message: `They stay in any ${x.host} courses they joined, but can’t join new ones.`, confirmLabel: 'End exchange' }))) return;
    try { await authedJson(`/api/network/exchange?studentId=${encodeURIComponent(x.id)}`, { method: 'DELETE' }); await mutate(); toast.success('Exchange ended'); } catch (err) { toast.error((err as Error).message); }
  };
  return (
    <section className="space-y-3" aria-labelledby="exchange-students">
      <div>
        <h2 id="exchange-students" className="text-lg font-bold text-zinc-900 dark:text-white">Exchange students</h2>
        <p className="text-sm text-zinc-500">During an exchange, a student can also join their host campus’s courses and find its people.</p>
      </div>
      <form onSubmit={add} className={cn(card, 'p-4 grid gap-3 md:grid-cols-[1.4fr_1fr_auto_auto_auto] md:items-end')}>
        <label className="space-y-1"><span className={label}>Student’s email</span><input id="exchange-email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} placeholder="name@school.edu" /></label>
        <label className="space-y-1"><span className={label}>Going to</span>
          <select id="exchange-campus" required value={f.campusId} onChange={(e) => setF({ ...f, campusId: e.target.value })} className={input}>
            <option value="">Pick a campus</option>
            {network.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <label className="space-y-1"><span className={label}>From</span><input id="exchange-from" type="date" required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={input} /></label>
        <label className="space-y-1"><span className={label}>Until</span><input id="exchange-until" type="date" required value={f.until} min={f.from || undefined} onChange={(e) => setF({ ...f, until: e.target.value })} className={input} /></label>
        <button type="submit" disabled={busy} className="btn-primary justify-center">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add</button>
      </form>
      {!!data?.length && (
        <div className={cn(card, 'divide-y divide-zinc-200 dark:divide-white/[0.06]')}>
          {data.map((x) => (
            <div key={x.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-900 dark:text-white truncate">{x.name} <span className="font-normal text-zinc-500">· {x.email}</span></p>
                <p className="text-xs text-zinc-500">{x.home ?? 'No campus'} → <b className="text-zinc-700 dark:text-zinc-200">{x.host}</b> · {dateText(x.from)} – {dateText(x.until)}</p>
              </div>
              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', x.now ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400')}>{x.now ? 'On exchange now' : x.from && new Date(x.from) > new Date() ? 'Upcoming' : 'Finished'}</span>
              <button type="button" onClick={() => void end(x)} className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-500">End</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Who belongs where (admins): everyone by email domain, or one person by hand. */
function People({ network, onChange }: { network: Network; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ email: '', campusId: '' });
  const assign = async () => {
    setBusy(true);
    try {
      const r = await authedJson<{ moved: number }>('/api/network/people', { method: 'POST' });
      toast.success(r.moved ? `${r.moved} ${r.moved === 1 ? 'person' : 'people'} joined a campus by email domain` : 'Everyone whose email matches a campus already has one');
      onChange();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const move = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authedJson<{ name: string }>('/api/network/people', { method: 'PUT', body: JSON.stringify({ email: f.email, campusId: f.campusId || null }) });
      const where = network.campuses.find((c) => c.id === f.campusId)?.name;
      toast.success(where ? `${r.name} now belongs to ${where}` : `${r.name} no longer belongs to a campus`);
      setF({ email: '', campusId: '' });
      onChange();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-3" aria-labelledby="campus-people">
      <h2 id="campus-people" className="text-lg font-bold text-zinc-900 dark:text-white">Who belongs where</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className={cn(card, 'p-4 space-y-3')}>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {network.unassigned ? <><b className="text-zinc-900 dark:text-white">{nf.format(network.unassigned)}</b> active students and teachers don’t belong to a campus yet. They can still see every course.</> : 'Every active student and teacher belongs to a campus.'}
          </p>
          <button type="button" onClick={() => void assign()} disabled={busy} className="btn-secondary">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Place people by email domain</button>
        </div>
        <form onSubmit={move} className={cn(card, 'p-4 space-y-3')}>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Move one person (for example someone with a personal email address).</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input id="move-email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="their email" aria-label="Their email" className={input} />
            <select id="move-campus" value={f.campusId} onChange={(e) => setF({ ...f, campusId: e.target.value })} aria-label="Campus" className={cn(input, 'sm:max-w-48')}>
              <option value="">No campus</option>
              {network.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" disabled={busy} className="btn-primary justify-center shrink-0">Move</button>
          </div>
        </form>
      </div>
    </section>
  );
}

export function NetworkAdmin() {
  const { data, error, mutate } = useNetwork();
  const [editing, setEditing] = useState<CampusCard | 'new' | null>(null);
  if (error) return <p className="text-sm text-rose-500">{(error as Error).message}</p>;
  if (!data) return <div className="space-y-3"><div className="h-40 rounded-2xl skeleton" /><div className="h-40 rounded-2xl skeleton" /></div>;
  const done = () => { setEditing(null); void mutate(); };
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500 max-w-2xl">Several universities in one UniVerse. People join their campus from their email address. Courses can be shared with partner campuses, students can go on exchange, and communities can be opened to the whole network. Other campuses never see people’s details unless those people agree.</p>
        {editing === null && <button type="button" onClick={() => setEditing('new')} className="btn-primary"><Plus className="w-4 h-4" /> Add a campus</button>}
      </div>
      <AnimatePresence mode="wait">
        {editing !== null && <CampusForm key={editing === 'new' ? 'new' : editing.id} editing={editing === 'new' ? null : editing} onDone={done} onCancel={() => setEditing(null)} />}
      </AnimatePresence>
      {data.campuses.length === 0 ? (
        <div className={cn(card, 'p-6 text-center space-y-2')}>
          <Building2 className="w-8 h-8 mx-auto text-indigo-500" aria-hidden />
          <p className="font-semibold text-zinc-900 dark:text-white">No campuses yet</p>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">Add your own campus first, then your partner universities. Until then nothing changes: everyone sees every course, as now.</p>
        </div>
      ) : (
        <>
          <CampusDirectory network={data} onEdit={(c) => setEditing(c)} />
          <ShareCourses network={data} admin />
          <ExchangeStudents network={data} />
          <People network={data} onChange={() => void mutate()} />
        </>
      )}
    </div>
  );
}

export function NetworkTeacher() {
  const { data, error, mutate } = useNetwork();
  if (error) return <p className="text-sm text-rose-500">{(error as Error).message}</p>;
  if (!data) return <div className="space-y-3"><div className="h-40 rounded-2xl skeleton" /><div className="h-40 rounded-2xl skeleton" /></div>;
  if (!data.campuses.length) {
    return (
      <div className={cn(card, 'p-6 text-center space-y-2')}>
        <Building2 className="w-8 h-8 mx-auto text-indigo-500" aria-hidden />
        <p className="font-semibold text-zinc-900 dark:text-white">Your school isn’t in a campus network yet</p>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">When your admin adds partner universities, you’ll see them here and can open your courses to their students.</p>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <p className="text-sm text-zinc-500 max-w-2xl">{data.me.campusName ? <>You’re at <b className="text-zinc-800 dark:text-zinc-200">{data.me.campusName}</b>. </> : null}Open your courses to partner campuses, and their students can join your lessons and class calls.</p>
      <CampusDirectory network={data} />
      <ShareCourses network={data} admin={false} />
      <VisibilitySwitch network={data} onChange={() => void mutate()} />
    </div>
  );
}
