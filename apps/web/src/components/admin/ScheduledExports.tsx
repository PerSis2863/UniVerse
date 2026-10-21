'use client';

import { useId, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CalendarClock, FolderOpen, Loader2, Play, Plus, Trash2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';

// Admin → Reports → Scheduled exports (Phase E, src/server/report-schedules.ts): a data export saved
// to My files → Scheduled reports every day, week or month, with a note in the app when it's there.

type Schedule = { id: string; type: string; every: string; label: string; lastRunAt: string | null; lastError: string | null; nextRunAt: string | null };
type List = { schedules: Schedule[]; max: number; folder: string };

const REPORTS = [{ id: 'members', label: 'Members' }, { id: 'impact', label: 'Impact points ledger' }, { id: 'applications', label: 'NGO applications' }];
const EVERY = [{ id: 'DAY', label: 'Every day' }, { id: 'WEEK', label: 'Every week' }, { id: 'MONTH', label: 'Every month' }];
const ROLES = [{ id: '', label: 'Every role' }, { id: 'STUDENT', label: 'Students' }, { id: 'TEACHER', label: 'Teachers' }, { id: 'ADMIN', label: 'Admins' }, { id: 'INDUSTRY_MENTOR', label: 'Mentors' }, { id: 'GUARDIAN', label: 'Parents' }];
const STATUSES = [{ id: '', label: 'Any status' }, { id: 'ACTIVE', label: 'Active' }, { id: 'PENDING', label: 'Pending' }, { id: 'SUSPENDED', label: 'Suspended' }];
const select = 'rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40';
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function Choice({ label, value, options, onChange }: { label: string; value: string; options: { id: string; label: string }[]; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <span className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-500">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={select}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </span>
  );
}

export function ScheduledExports() {
  const { data, error, mutate } = useSWR<List>('/api/admin/report-schedules', authedJson, { revalidateOnFocus: false });
  const [form, setForm] = useState({ type: 'members', every: 'WEEK', role: '', status: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, act: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try { await act(); await mutate(); toast.success(done); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const add = () => run('add', () => authedJson('/api/admin/report-schedules', { method: 'POST', body: JSON.stringify(form) }), 'Scheduled. The first file comes with the next daily run (08:00 UTC), or press Save now.');
  const stop = async (s: Schedule) => {
    if (!(await confirmDialog({ title: `Stop “${s.label}”?`, message: 'The files it already saved stay in My files.', confirmLabel: 'Stop', destructive: true }))) return;
    await run(s.id, () => authedJson(`/api/admin/report-schedules/${s.id}`, { method: 'DELETE' }), 'Stopped');
  };
  const now = (s: Schedule) => run(`run-${s.id}`, () => authedJson(`/api/admin/report-schedules/${s.id}/run`, { method: 'POST' }), `Saved to My files → ${data?.folder ?? 'Scheduled reports'}`);
  const full = !!data && data.schedules.length >= data.max;

  return (
    <section aria-labelledby="scheduled-exports" className="rounded-3xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-5 md:p-6 mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="scheduled-exports" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><CalendarClock className="w-4 h-4 text-indigo-500" aria-hidden />Scheduled exports</h3>
          <p className="text-sm text-zinc-500 mt-1">A fresh CSV saved to your My files on a schedule. You get a note in the app when it&apos;s there.</p>
        </div>
        <Link href="/files" className="btn-secondary btn-sm"><FolderOpen className="w-3.5 h-3.5" aria-hidden />My files</Link>
      </div>

      <div className="flex flex-wrap items-end gap-3 mt-5">
        <Choice label="Report" value={form.type} options={REPORTS} onChange={(type) => setForm((f) => ({ ...f, type }))} />
        {form.type === 'members' && (
          <>
            <Choice label="Role" value={form.role} options={ROLES} onChange={(role) => setForm((f) => ({ ...f, role }))} />
            <Choice label="Status" value={form.status} options={STATUSES} onChange={(status) => setForm((f) => ({ ...f, status }))} />
          </>
        )}
        <Choice label="How often" value={form.every} options={EVERY} onChange={(every) => setForm((f) => ({ ...f, every }))} />
        <button type="button" onClick={() => void add()} disabled={busy !== null || full} className="btn-primary btn-sm min-h-10">
          {busy === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Plus className="w-3.5 h-3.5" aria-hidden />}Schedule
        </button>
      </div>
      {full && <p className="text-xs text-zinc-500 mt-2">You have {data?.max} scheduled exports, the most there can be. Stop one to add another.</p>}

      {error ? (
        <p className="text-sm text-rose-500 mt-4">{(error as Error).message}</p>
      ) : !data ? (
        <div className="h-14 rounded-2xl skeleton mt-4" />
      ) : data.schedules.length > 0 && (
        <ul className="mt-5 divide-y divide-zinc-200 dark:divide-white/[0.06] border-t border-zinc-200 dark:border-white/[0.06] stagger">
          {data.schedules.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{s.label}</span>
                <span className="block text-xs text-zinc-500">
                  {EVERY.find((e) => e.id === s.every)?.label ?? s.every}
                  {s.lastRunAt ? ` · last saved ${day(s.lastRunAt)}` : ' · first file at the next daily run (08:00 UTC)'}
                  {s.nextRunAt && ` · next ${day(s.nextRunAt)}`}
                </span>
                {s.lastError && <span className="block text-xs text-amber-700 dark:text-amber-400 mt-0.5">Last time: {s.lastError}</span>}
              </span>
              <button type="button" onClick={() => void now(s)} disabled={busy !== null} className="btn-secondary btn-sm">
                {busy === `run-${s.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Play className="w-3.5 h-3.5" aria-hidden />}Save now<span className="sr-only">: {s.label}</span>
              </button>
              <button type="button" onClick={() => void stop(s)} disabled={busy !== null} aria-label={`Stop ${s.label}`} className="p-2 rounded-xl text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 min-h-10 min-w-10 inline-flex items-center justify-center">
                {busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Trash2 className="w-4 h-4" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
