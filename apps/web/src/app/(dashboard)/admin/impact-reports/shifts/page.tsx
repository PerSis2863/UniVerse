'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Loader2, Plus, QrCode as QrIcon, Trash2, UserCheck, Users, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, IMPACT_REPORT_TABS } from '@/components/layout/SectionTabs';
import { RotatingQr } from '@/components/ui/RotatingQr';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';

// Verified volunteering (upgrade 5), supervisor side: shifts on NGO projects, the rotating check-in
// code for the site, and the roster (mark someone present if their phone couldn't check in).

interface Shift { id: string; title: string; startAt: string; endAt: string; location: string | null; capacity: number; taken: number; project: { name: string; ngo: { name: string } | null } }
interface Roster { people: { id: string; checkInAt: string | null; checkOutAt: string | null; method: string | null; minutes: number; verified: boolean; student: { id: string; name: string; email: string } }[] }

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const input = 'w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const empty = { projectId: '', title: '', day: '', start: '09:00', end: '13:00', location: '', lat: '', lng: '', radiusM: '200', capacity: '20' };

export default function AdminShiftsPage() {
  const { data: shifts, isLoading, mutate } = useSWR<Shift[]>('/api/volunteer/shifts', authedJson);
  const [form, setForm] = useState<typeof empty | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [door, setDoor] = useState<Shift | null>(null);

  const remove = async (s: Shift) => {
    if (!(await confirmDialog({ title: `Delete “${s.title}”?`, destructive: true, confirmLabel: 'Delete' }))) return;
    try { await authedJson(`/api/volunteer/shifts/${s.id}`, { method: 'DELETE' }); void mutate(); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <Topbar title="Volunteer shifts" subtitle="Shifts on NGO projects, on-site check-in and verified hours" />
      <SectionTabs tabs={IMPACT_REPORT_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex justify-end"><button type="button" className="btn-primary btn-sm rounded-full" onClick={() => setForm({ ...empty })}><Plus className="w-4 h-4" /> New shift</button></div>
          <AnimatePresence>{form && <ShiftForm form={form} setForm={setForm} onDone={() => { setForm(null); void mutate(); }} />}</AnimatePresence>
          {isLoading ? <div className="h-32 rounded-2xl skeleton" /> : !shifts?.length ? <p className={`${card} p-6 text-sm text-zinc-500 text-center`}>No shifts yet. Add one for an NGO project.</p> : (
            <ul className="space-y-3">
              {shifts.map((s) => (
                <li key={s.id} className={`${card} overflow-hidden`}>
                  <div className="p-4 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className="flex-1 min-w-0 text-left" aria-expanded={open === s.id}>
                      <p className="font-semibold text-zinc-900 dark:text-white truncate">{s.title} <span className="font-normal text-zinc-500">· {s.project.name}</span></p>
                      <p className="text-xs text-zinc-500 flex flex-wrap gap-x-3"><span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{when(s.startAt)}</span><span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{s.taken}/{s.capacity}</span>{s.location && <span>{s.location}</span>}</p>
                    </button>
                    <button type="button" className="btn-primary btn-sm rounded-full" onClick={() => setDoor(s)}><QrIcon className="w-4 h-4" /> Check-in code</button>
                    <button type="button" className="btn-ghost btn-sm text-rose-500" onClick={() => void remove(s)} aria-label={`Delete ${s.title}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <AnimatePresence initial={false}>
                    {open === s.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden border-t border-zinc-100 dark:border-white/[0.06]">
                        <RosterList id={s.id} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <AnimatePresence>{door && <RotatingQr endpoint={`/api/volunteer/shifts/${door.id}/code`} path="/student/impact/shifts" title={door.title} onClose={() => setDoor(null)} />}</AnimatePresence>
    </>
  );
}

function ShiftForm({ form, setForm, onDone }: { form: typeof empty; setForm: (f: typeof empty | null) => void; onDone: () => void }) {
  const { data: projects } = useSWR<{ id: string; name: string; ngo: { name: string } | null }[]>('/api/volunteer/projects', authedJson);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const startAt = new Date(`${form.day}T${form.start}`).toISOString(), endAt = new Date(`${form.day}T${form.end}`).toISOString();
      await authedJson('/api/volunteer/shifts', { method: 'POST', body: JSON.stringify({ ...form, startAt, endAt, lat: form.lat || null, lng: form.lng || null }) });
      toast.success('Shift added. Students see it in Opportunities → Volunteer shifts.');
      onDone();
    } catch (e) { toast.error((e as Error).message === 'Invalid time value' ? 'Pick a day and times.' : (e as Error).message); } finally { setBusy(false); }
  };
  const here = () => navigator.geolocation?.getCurrentPosition((p) => setForm({ ...form, lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) }), () => toast.error('Allow location to use where you are.'));
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="overflow-hidden">
      <div className={`${card} p-4 space-y-3`}>
        <div className="flex items-center justify-between"><p className="font-semibold text-zinc-900 dark:text-white">New shift</p><button type="button" onClick={() => setForm(null)} aria-label="Cancel" className="p-1 text-zinc-500"><X className="w-4 h-4" /></button></div>
        <select className={input} value={form.projectId} onChange={set('projectId')} aria-label="Project">
          <option value="">Pick an NGO project…</option>
          {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.ngo ? ` · ${p.ngo.name}` : ''}</option>)}
        </select>
        <input className={input} placeholder="Shift name, e.g. Saturday tree planting" maxLength={120} value={form.title} onChange={set('title')} />
        <div className="grid grid-cols-3 gap-2">
          <input className={input} type="date" aria-label="Day" value={form.day} onChange={set('day')} />
          <input className={input} type="time" aria-label="Starts" value={form.start} onChange={set('start')} />
          <input className={input} type="time" aria-label="Ends" value={form.end} onChange={set('end')} />
        </div>
        <input className={input} placeholder="Place (shown to students)" maxLength={120} value={form.location} onChange={set('location')} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input className={input} placeholder="Latitude (optional)" inputMode="decimal" value={form.lat} onChange={set('lat')} />
          <input className={input} placeholder="Longitude" inputMode="decimal" value={form.lng} onChange={set('lng')} />
          <input className={input} type="number" min={50} aria-label="Check-in radius in metres" placeholder="Radius (m)" value={form.radiusM} onChange={set('radiusM')} />
          <input className={input} type="number" min={1} aria-label="Places" placeholder="Places" value={form.capacity} onChange={set('capacity')} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={here}>Use where I am</button>
          <span className="text-xs text-zinc-500">With a location, students can also check in by GPS within the radius, and the shift shows on the impact map.</span>
          <button type="button" className="btn-primary btn-sm ml-auto" disabled={busy || !form.projectId || !form.title.trim() || !form.day} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Add shift</button>
        </div>
      </div>
    </motion.div>
  );
}

function RosterList({ id }: { id: string }) {
  const { data, mutate } = useSWR<Roster>(`/api/volunteer/shifts/${id}/roster`, authedJson);
  const present = async (studentId: string) => {
    try { await authedJson(`/api/volunteer/shifts/${id}/present`, { method: 'POST', body: JSON.stringify({ studentId }) }); void mutate(); toast.success('Marked present for the whole shift.'); }
    catch (e) { toast.error((e as Error).message); }
  };
  if (!data) return <div className="p-4"><div className="h-16 rounded-xl skeleton" /></div>;
  if (!data.people.length) return <p className="p-4 text-sm text-zinc-500">Nobody has signed up yet.</p>;
  const t = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return (
    <ul className="p-4 divide-y divide-zinc-100 dark:divide-white/[0.05]">
      {data.people.map((p) => (
        <li key={p.id} className="py-2 flex items-center gap-3 text-sm">
          <span className="flex-1 min-w-0"><span className="text-zinc-900 dark:text-white">{p.student.name}</span> <span className="text-xs text-zinc-500">{p.student.email}</span></span>
          {p.verified ? <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {Math.round((p.minutes / 60) * 10) / 10} h · {p.method}</span>
            : p.checkInAt ? <span className="text-xs text-indigo-500">In since {t(p.checkInAt)} ({p.method})</span>
            : <button type="button" className="btn-ghost btn-sm inline-flex" onClick={() => void present(p.student.id)}><UserCheck className="w-4 h-4" /> Mark present</button>}
        </li>
      ))}
    </ul>
  );
}
