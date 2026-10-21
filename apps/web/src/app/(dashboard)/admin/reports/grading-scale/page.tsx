'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_INSIGHT_TABS } from '@/components/layout/SectionTabs';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { SCALE_PRESETS, cleanScale, letter, maxGpa, type Scale } from '@/lib/gradebook';

// Admin → Insights → Grading scale (Stage 5 · B3.4, src/server/grade-scale.ts): the school's letter
// grades and GPA points, used by gradebooks, students' grades, report cards and teachers' dashboards.

type Data = { scale: Scale; maxGpa: number; custom: boolean; canEdit: boolean };
type Row = { letter: string; min: string; gpa: string };
const KEY = '/api/grade-scale';
const rowsOf = (s: Scale): Row[] => s.map((b) => ({ letter: b.letter, min: String(b.min), gpa: String(b.gpa) }));

export default function GradingScalePage() {
  const { data, error, mutate } = useSWR<Data>(KEY, authedJson);
  return (
    <>
      <Topbar title="Grading scale" subtitle="Your school’s letter grades and GPA points" />
      <SectionTabs tabs={ADMIN_INSIGHT_TABS} />
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          {error ? <LoadError onRetry={() => mutate()} message="The scale couldn’t load." />
            : !data ? <div className="h-64 rounded-2xl skeleton" />
            : <Editor key={JSON.stringify(data.scale)} data={data} onSaved={(d) => void mutate(d, { revalidate: false })} />}
        </div>
      </div>
    </>
  );
}

function Editor({ data, onSaved }: { data: Data; onSaved: (d: Data) => void }) {
  const [rows, setRows] = useState<Row[]>(rowsOf(data.scale));
  const [busy, setBusy] = useState(false);
  const scale = cleanScale(rows.map((r) => ({ letter: r.letter, min: Number(r.min), gpa: Number(r.gpa) })));
  const set = (i: number, r: Partial<Row>) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, ...r } : x)));
  const save = async (body: { scale: Scale | null }) => {
    setBusy(true);
    try { onSaved(await authedJson<Data>(KEY, { method: 'PUT', body: JSON.stringify(body) })); toast.success(body.scale ? 'Grading scale saved' : 'Back to A–F on 4.0'); }
    catch (e) { toast.error(errorMessage(e, 'The scale couldn’t be saved.')); }
    finally { setBusy(false); }
  };
  return (
    <section className="panel p-5 space-y-5" aria-labelledby="scale-h">
      <div>
        <h2 id="scale-h" className="font-bold text-zinc-900 dark:text-white">{data.custom ? 'Your school’s scale' : 'The standard scale (A–F, GPA 4.0)'}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Each band starts at its lowest percentage; the lowest band starts at 0. Used for letters in gradebooks, students’ grades and report cards, and for GPA. Report cards made before a change keep the scale they were made with.</p>
      </div>
      {data.canEdit && (
        // A board's usual scale to start from (Stage 5 · Q22); change any band before saving.
        <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">Start from
          <select className="input w-auto py-1.5" value="" onChange={(e) => { const p = SCALE_PRESETS.find((x) => x.id === e.target.value); if (p) setRows(rowsOf(p.scale)); }}>
            <option value="">Choose a board’s scale…</option>
            {SCALE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="basis-full text-xs text-zinc-600 dark:text-zinc-400">The usual bands, not an official conversion: check them against your board’s rules, then save.</span>
        </label>
      )}
      <table className="w-full text-sm">
        <thead><tr className="text-start text-xs text-zinc-600 dark:text-zinc-400"><th className="font-medium pb-1">Letter or band</th><th className="font-medium pb-1">From (%)</th><th className="font-medium pb-1">GPA points</th><th className="sr-only">Remove</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="pe-2 py-1"><input aria-label={`Band ${i + 1} name`} value={r.letter} maxLength={12} disabled={!data.canEdit} onChange={(e) => set(i, { letter: e.target.value })} className="input py-1.5" /></td>
              <td className="pe-2 py-1"><input aria-label={`Band ${i + 1} lowest percentage`} type="number" min={0} max={100} value={r.min} disabled={!data.canEdit} onChange={(e) => set(i, { min: e.target.value })} className="input py-1.5" /></td>
              <td className="pe-2 py-1"><input aria-label={`Band ${i + 1} GPA points`} type="number" min={0} max={10} step={0.1} value={r.gpa} disabled={!data.canEdit} onChange={(e) => set(i, { gpa: e.target.value })} className="input py-1.5" /></td>
              <td className="py-1 w-10">{data.canEdit && rows.length > 2 && <button type="button" aria-label={`Remove band ${i + 1}`} onClick={() => setRows((xs) => xs.filter((_, j) => j !== i))} className="p-2 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.canEdit && rows.length < 15 && <button type="button" onClick={() => setRows((xs) => [...xs, { letter: '', min: '', gpa: '0' }])} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add a band</button>}
      <p className={scale ? 'text-sm text-zinc-700 dark:text-zinc-300' : 'text-sm text-rose-700 dark:text-rose-300'} aria-live="polite">
        {scale ? `For example: 95% is ${letter(95, scale)?.letter}, 72% is ${letter(72, scale)?.letter}, 40% is ${letter(40, scale)?.letter}. GPA out of ${maxGpa(scale)}.` : 'Give every band a different name and a different lowest percentage (0–100), and GPA points from 0 to 10.'}
      </p>
      {data.canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => scale && void save({ scale })} disabled={busy || !scale} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save the scale</button>
          {data.custom && <button type="button" disabled={busy} onClick={async () => { if (await confirmDialog({ title: 'Go back to A–F on 4.0?', message: 'Gradebooks and new report cards use the standard scale again.', confirmLabel: 'Go back' })) void save({ scale: null }); }} className="btn-secondary"><RotateCcw className="w-4 h-4" /> Use the standard scale</button>}
        </div>
      ) : <p className="text-xs text-zinc-600 dark:text-zinc-400">Only an admin of a school can change its scale.</p>}
    </section>
  );
}
