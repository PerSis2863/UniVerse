'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, FileUp, Loader2, MinusCircle, RotateCcw, Upload, X } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedFetch, authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { mapHeaders, parseCsv, toCsv, toRecords } from '@/lib/csv';
import { IMPORT_COLUMNS, IMPORT_KINDS, IMPORT_TITLES, MAX_IMPORT_ROWS, type ImportKind } from '@/lib/import-columns';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useCan } from '@/lib/use-can';

// Bulk import and export (Stage 5 · B15.7; src/server/bulk-import.ts): choose what you're importing,
// drop a CSV, check the column matching, preview what every row will do, import the good rows,
// and undo a whole import for 7 days. Exports use the same headers, so a file can go round.

type Action = 'invite' | 'enrol' | 'create' | 'update' | 'skip' | 'error';
interface RowResult { n: number; action: Action; message: string; label: string }
interface Preview { kind: ImportKind; counts: Record<Action, number>; results: RowResult[] }
interface Batch { id: string; kind: ImportKind; fileName: string | null; rows: number; summary: Record<Action, number>; createdAt: string; undoneAt: string | null; by: string; canUndo: boolean }
interface Loaded { name: string; headers: string[]; rows: string[][] }

const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const ACTION: Record<Action, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  invite: { label: 'Invite', tone: 'text-indigo-700 dark:text-indigo-300 bg-indigo-500/10', Icon: CheckCircle2 },
  enrol: { label: 'Enrol', tone: 'text-indigo-700 dark:text-indigo-300 bg-indigo-500/10', Icon: CheckCircle2 },
  create: { label: 'New', tone: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10', Icon: CheckCircle2 },
  update: { label: 'Change', tone: 'text-amber-800 dark:text-amber-300 bg-amber-500/10', Icon: CheckCircle2 },
  skip: { label: 'Skip', tone: 'text-zinc-600 dark:text-zinc-300 bg-zinc-500/10', Icon: MinusCircle },
  error: { label: 'Problem', tone: 'text-rose-700 dark:text-rose-300 bg-rose-500/10', Icon: CircleAlert },
};
const EXPORTS = [
  { kind: 'students', label: 'Students' }, { kind: 'teachers', label: 'Teachers' }, { kind: 'courses', label: 'Courses' },
  { kind: 'enrolments', label: 'Enrolments' }, { kind: 'timetable', label: 'Timetable' },
];
const EXAMPLES: Record<ImportKind, string[]> = {
  people: ['asha.k@example.com', 'student', 'Asha Kumar', 'CS101;MATH110'],
  enrolments: ['asha.k@example.com', 'CS101'],
  courses: ['CS101', 'Introduction to Computer Science', 'teacher@example.com', '3', 'Computer Science', 'published', 'Programming from scratch'],
  timetable: ['CS101', 'Mon', '09:00', '10:30', 'Room 12', 'lecture'],
};

function save(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BulkImport() {
  const [kind, setKind] = useState<ImportKind>('people');
  const [file, setFile] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [show, setShow] = useState<'all' | 'error' | 'skip' | 'do'>('all');
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  // Staff roles (B15.6) may have only one of importing and exporting.
  const canImport = useCan('import.run'), canExport = useCan('export.run');
  const history = useSWR<{ batches: Batch[] }>(canImport ? '/api/admin/import' : null, authedJson);
  const columns = IMPORT_COLUMNS[kind];
  const missing = columns.filter((c) => c.required && (mapping[c.key] ?? -1) < 0);
  const records = useMemo(() => (file ? toRecords(file.rows, mapping) : []), [file, mapping]);
  const doable = preview ? preview.counts.invite + preview.counts.enrol + preview.counts.create + preview.counts.update : 0;
  const shown = (preview?.results ?? []).filter((r) => show === 'all' || (show === 'do' ? !['error', 'skip'].includes(r.action) : r.action === show));

  const reset = () => { setFile(null); setMapping({}); setPreview(null); setShow('all'); };
  const choose = (k: ImportKind) => { setKind(k); setPreview(null); if (file) setMapping(mapHeaders(file.headers, IMPORT_COLUMNS[k])); };
  const read = async (f: File) => {
    if (f.size > 2_000_000) return void toast.error('Files up to 2 MB, please.');
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return void toast.error('The file needs a header row and at least one row.');
    if (rows.length - 1 > MAX_IMPORT_ROWS) return void toast.error(`Up to ${MAX_IMPORT_ROWS.toLocaleString()} rows at a time: split the file.`);
    const headers = rows[0].map((h) => h.trim());
    setFile({ name: f.name, headers, rows: rows.slice(1) });
    setMapping(mapHeaders(headers, columns));
    setPreview(null);
  };
  const check = async () => {
    setBusy('preview');
    try {
      setPreview(await authedJson<Preview>('/api/admin/import/preview', { method: 'POST', body: JSON.stringify({ kind, rows: records }) }));
      setShow('all');
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t check the file.')); }
    finally { setBusy(null); }
  };
  const run = async () => {
    if (!preview || !file) return;
    const ok = await confirmDialog({ title: `Import ${doable} row${doable === 1 ? '' : 's'}?`, message: `${preview.counts.error ? `${preview.counts.error} with problems and ` : ''}${preview.counts.skip} skipped stay out. You can undo the whole import for 7 days.`, confirmLabel: 'Import' });
    if (!ok) return;
    setBusy('import');
    try {
      const r = await authedJson<{ counts: Record<Action, number> }>('/api/admin/import', { method: 'POST', body: JSON.stringify({ kind, rows: records, fileName: file.name }) });
      haptic('success');
      const c = r.counts;
      toast.success('Imported', { description: [c.invite && `${c.invite} invited`, c.enrol && `${c.enrol} enrolled`, c.create && `${c.create} new`, c.update && `${c.update} changed`].filter(Boolean).join(' · ') });
      reset();
      void history.mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t import.')); }
    finally { setBusy(null); }
  };
  const problems = () => {
    if (!preview || !file) return;
    const bad = new Set(preview.results.filter((r) => r.action === 'error').map((r) => r.n));
    save(`${file.name.replace(/\.[^.]+$/, '')}-problems.csv`, toCsv([...file.headers, 'Problem'], file.rows.map((row, i) => (bad.has(i + 1) ? [...row, preview.results.find((r) => r.n === i + 1)?.message ?? ''] : null)).filter((x): x is string[] => !!x)));
  };
  const exportKind = async (k: string, label: string) => {
    try {
      const res = await authedFetch(`/api/admin/import/export?kind=${k}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || 'Export failed');
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement('a'), { href: url, download: `${k}-${new Date().toISOString().slice(0, 10)}.csv` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${label} exported`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t export.')); }
  };
  const undo = async (b: Batch) => {
    const ok = await confirmDialog({ title: 'Undo this import?', message: 'What it added is removed and what it changed goes back. Invitations already used to join, and new courses that are already in use, stay.', confirmLabel: 'Undo import', destructive: true });
    if (!ok) return;
    try {
      const r = await authedJson<{ kept: { invitations: number; courses: number } }>(`/api/admin/import/${b.id}`, { method: 'POST', body: JSON.stringify({ action: 'undo' }) });
      const kept = [r.kept.invitations && `${r.kept.invitations} invitation${r.kept.invitations === 1 ? '' : 's'} already used`, r.kept.courses && `${r.kept.courses} course${r.kept.courses === 1 ? '' : 's'} in use`].filter(Boolean).join(', ');
      toast.success('Import undone', { description: kept ? `Kept: ${kept}.` : undefined });
      void history.mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t undo the import.')); }
  };

  return (
    <div className="space-y-4">
      {canImport && <section className={`${card} p-4 sm:p-5 space-y-4`} aria-labelledby="import-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="import-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Upload className="w-4 h-4 text-indigo-500" aria-hidden /> Import from a spreadsheet</h2>
          {file && <button type="button" onClick={reset} className="btn-ghost btn-sm"><X className="w-4 h-4" /> Start over</button>}
        </div>
        <Segmented<ImportKind> label="What you’re importing" value={kind} onChange={choose} className="w-full" segments={IMPORT_KINDS.map((k) => ({ value: k, label: k === 'enrolments' ? <><span className="sm:hidden">Enrol</span><span className="hidden sm:inline">Enrolments</span></> : IMPORT_TITLES[k].title }))} />
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{IMPORT_TITLES[kind].about}</p>

        <AnimatePresence mode="wait" initial={false}>
          {!file ? (
            <motion.div key="drop" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }} className="space-y-3">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void read(f); }}
                className={cn('rounded-2xl border-2 border-dashed p-6 text-center transition-colors', dragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-300 dark:border-white/15')}
              >
                <FileSpreadsheet className="w-8 h-8 mx-auto text-zinc-400" aria-hidden />
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">Drop a CSV file here, or</p>
                <input ref={picker} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
                <button type="button" onClick={() => picker.current?.click()} className="btn-primary btn-sm mt-2"><FileUp className="w-4 h-4" /> Choose a file</button>
                <p className="mt-2 text-[11px] text-zinc-500">From Excel or Google Sheets: File → Download / Save as → CSV. Up to {MAX_IMPORT_ROWS.toLocaleString()} rows.</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Columns</p>
                <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {columns.map((c) => (
                    <li key={c.key} className="text-zinc-700 dark:text-zinc-200"><span className="font-semibold">{c.label}</span>{c.required ? <span className="text-rose-600 dark:text-rose-400"> (needed)</span> : ''}{c.hint ? <span className="text-zinc-500"> · {c.hint}</span> : ''}</li>
                  ))}
                </ul>
                <button type="button" onClick={() => save(`${kind}-template.csv`, toCsv(columns.map((c) => c.label), [EXAMPLES[kind]]))} className="btn-ghost btn-sm mt-2"><Download className="w-4 h-4" /> Download a template</button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="file" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }} className="space-y-4">
              <p className="text-sm text-zinc-700 dark:text-zinc-200"><FileSpreadsheet className="inline w-4 h-4 -mt-0.5 mr-1 text-zinc-500" aria-hidden /><span className="font-semibold">{file.name}</span> · {file.rows.length} row{file.rows.length === 1 ? '' : 's'}</p>
              <fieldset className="grid sm:grid-cols-2 gap-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Match the columns</legend>
                {columns.map((c) => (
                  <label key={c.key} className="block">
                    <span className="label">{c.label}{c.required && <span className="text-rose-600 dark:text-rose-400"> *</span>}</span>
                    <select value={mapping[c.key] ?? -1} onChange={(e) => { setMapping((m) => ({ ...m, [c.key]: Number(e.target.value) })); setPreview(null); }} className={cn('input', c.required && (mapping[c.key] ?? -1) < 0 && 'border-rose-500')}>
                      <option value={-1}>{c.required ? 'Choose a column…' : '(not in this file)'}</option>
                      {file.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </fieldset>
              {missing.length > 0 && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">Choose the column for {missing.map((c) => c.label).join(' and ')}.</p>}
              {!preview && (
                <button type="button" onClick={() => void check()} disabled={!!busy || missing.length > 0} className="btn-primary w-full sm:w-auto">
                  {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Check {file.rows.length} row{file.rows.length === 1 ? '' : 's'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {preview && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ACTION) as Action[]).filter((a) => preview.counts[a]).map((a) => {
                const { label, tone, Icon } = ACTION[a];
                return <span key={a} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', tone)}><Icon className="w-3.5 h-3.5" aria-hidden />{preview.counts[a]} {label.toLowerCase()}</span>;
              })}
            </div>
            <Segmented<'all' | 'do' | 'skip' | 'error'> label="Show rows" value={show} onChange={setShow} className="w-full sm:w-auto" segments={[
              { value: 'all', label: 'All' }, { value: 'do', label: `Ready (${doable})` }, { value: 'skip', label: <><span className="sm:hidden">Skip</span><span className="hidden sm:inline">Skipped</span> ({preview.counts.skip})</> }, { value: 'error', label: `Problems (${preview.counts.error})` },
            ]} />
            <motion.ul key={show} variants={list} initial="hidden" animate="show" className="max-h-[28rem] overflow-y-auto divide-y divide-zinc-200/70 dark:divide-white/[0.06] rounded-2xl border border-zinc-200/80 dark:border-white/[0.08]">
              {shown.length === 0 ? <li className="p-4 text-sm text-zinc-500 text-center">No rows here.</li> : shown.slice(0, 1000).map((r) => {
                const { label, tone, Icon } = ACTION[r.action];
                return (
                  <motion.li key={r.n} variants={fadeUp} className="px-3 py-2 flex items-start gap-3">
                    <span className="w-10 shrink-0 text-xs tabular-nums text-zinc-500 pt-0.5">#{r.n + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{r.label}</span>
                      <span className="block text-xs text-zinc-600 dark:text-zinc-300">{r.message}</span>
                    </span>
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0', tone)}><Icon className="w-3 h-3" aria-hidden />{label}</span>
                  </motion.li>
                );
              })}
            </motion.ul>
            <p className="text-[11px] text-zinc-500">Row numbers are the file’s lines (the header is line 1).</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void run()} disabled={!!busy || !doable} className="btn-primary">
                {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import {doable} row{doable === 1 ? '' : 's'}
              </button>
              {preview.counts.error > 0 && <button type="button" onClick={problems} className="btn-secondary"><Download className="w-4 h-4" /> Rows with problems</button>}
              <button type="button" onClick={() => setPreview(null)} className="btn-ghost">Change the matching</button>
            </div>
          </motion.div>
        )}
      </section>}

      {canExport && <section className={`${card} p-4 sm:p-5`} aria-labelledby="export-title">
        <h2 id="export-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Download className="w-4 h-4 text-indigo-500" aria-hidden /> Export</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">CSV files with the same columns the import reads: export, edit in a spreadsheet, import back.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXPORTS.map((x) => <button key={x.kind} type="button" onClick={() => void exportKind(x.kind, x.label)} className="btn-secondary btn-sm"><Download className="w-4 h-4" /> {x.label}</button>)}
        </div>
      </section>}

      {canImport && <section className={`${card} p-2 sm:p-3`} aria-labelledby="history-title">
        <h2 id="history-title" className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent imports</h2>
        {!history.data ? <div className="p-3"><ContentSkeleton variant="list" /></div>
          : history.data.batches.length === 0 ? <p className="px-3 pb-3 text-sm text-zinc-500">None yet.</p>
          : (
            <motion.ul variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
              {history.data.batches.map((b) => {
                const s = b.summary;
                return (
                  <motion.li key={b.id} variants={fadeUp} className={cn('px-3 py-2.5 flex items-center gap-3', b.undoneAt && 'opacity-60')}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{IMPORT_TITLES[b.kind]?.title ?? b.kind} · {b.fileName ?? 'file'}</span>
                      <span className="block text-xs text-zinc-500">
                        {[s.invite && `${s.invite} invited`, s.enrol && `${s.enrol} enrolled`, s.create && `${s.create} new`, s.update && `${s.update} changed`, s.error && `${s.error} left out`].filter(Boolean).join(' · ')} · {b.by} · {formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}{b.undoneAt ? ' · undone' : ''}
                      </span>
                    </span>
                    {b.canUndo && <button type="button" onClick={() => void undo(b)} className="btn-ghost btn-sm shrink-0"><RotateCcw className="w-4 h-4" /> Undo</button>}
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
      </section>}
    </div>
  );
}
