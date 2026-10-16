'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { ChevronRight, CornerDownRight, FileSpreadsheet, FileText, FileUp, Loader2, Presentation, Repeat2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, COLLAB_TABS } from '@/components/layout/SectionTabs';
import { authedJson } from '@/lib/authed-fetch';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { spring } from '@/lib/motion';
import { DOC_TEMPLATES } from '@/lib/doc-templates';
import { childrenOf, topLevel } from '@/lib/doc-pages';
import { SHEET_TEMPLATES } from '@/lib/sheet/templates';
import { DECK_TEMPLATES } from '@/lib/slides/templates';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/utils';

// Docs (Stage 4 · 3.2): documents written together live (src/server/docs.ts). Stage 5 · B9.14: a
// converter for files (Word, PDF, Excel, pictures, sound, video, ZIP), all on the device. B9.2:
// pages inside pages show under their top page. Office suite: spreadsheets (/sheets/<id>) and
// presentations (/slides/<id>) live here too, each made blank, from a template, or from a file.

type Kind = 'doc' | 'sheet' | 'slides';
const KINDS: Record<Kind, { label: string; one: string; icon: typeof FileText; tone: string; path: string; placeholder: string }> = {
  doc: { label: 'Documents', one: 'document', icon: FileText, tone: 'from-indigo-500 to-fuchsia-500', path: '/docs', placeholder: 'Lab report' },
  sheet: { label: 'Spreadsheets', one: 'spreadsheet', icon: FileSpreadsheet, tone: 'from-emerald-500 to-teal-600', path: '/sheets', placeholder: 'Science marks' },
  slides: { label: 'Presentations', one: 'presentation', icon: Presentation, tone: 'from-orange-500 to-rose-500', path: '/slides', placeholder: 'Project pitch' },
};
const kindOf = (k: string | undefined): Kind => (k === 'sheet' || k === 'slides' ? k : 'doc');


interface List {
  courses: { id: string; code: string; name: string }[];
  groups?: { id: string; name: string }[];
  docs: { id: string; title: string; preview: string | null; course: string | null; parentId: string | null; kind?: string; mine: boolean; updatedAt: string }[];
}

export default function DocsPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<List>('/api/docs', authedJson);
  const kids = data ? childrenOf(data.docs) : new Map<string, List['docs']>();
  const countBelow = (id: string): number => (kids.get(id) ?? []).reduce((n, c) => n + 1 + countBelow(c.id), 0);
  const [creating, setCreating] = useState<Kind | null>(null);
  const [show, setShow] = useState<'all' | Kind>('all');
  const [form, setForm] = useState({ title: '', courseId: '', template: '' }); // courseId holds c:<id> or g:<id>
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const make = async (kind: Kind, title: string) => authedJson<{ id: string }>('/api/docs', { method: 'POST', body: JSON.stringify({ kind, title, courseId: form.courseId.startsWith('c:') ? form.courseId.slice(2) : undefined, groupId: form.courseId.startsWith('g:') ? form.courseId.slice(2) : undefined }) });
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creating) return;
    setBusy(true);
    try { const d = await make(creating, form.title); router.push(`${KINDS[creating].path}/${d.id}${form.template ? `?template=${form.template}` : ''}`); }
    catch (err) { toast.error((err as Error).message); setBusy(false); }
  };
  // An Excel or CSV file becomes a new spreadsheet (read on this device, then filled in once it's open).
  const openFile = async (f: File) => {
    setBusy(true);
    try {
      const { readSheetFile } = await import('@/components/sheets/sheet-files');
      const { book, skipped } = await readSheetFile(f);
      const d = await make('sheet', form.title.trim() || f.name.replace(/\.[^.]+$/, '').slice(0, 120));
      try { sessionStorage.setItem(`sheet-import:${d.id}`, JSON.stringify(book)); } catch { toast.error('That file is too big to open here.'); }
      if (skipped.length) toast(`Not brought in: ${skipped.join('; ')}`);
      router.push(`/sheets/${d.id}`);
    } catch (err) { toast.error((err as Error).message); setBusy(false); }
  };
  const openDeck = async (f: File) => {
    setBusy(true);
    try {
      const { readDeckFile } = await import('@/components/slides/slide-files');
      const { deck, skipped } = await readDeckFile(f);
      const d = await make('slides', form.title.trim() || f.name.replace(/\.[^.]+$/, '').slice(0, 120));
      try { sessionStorage.setItem(`deck-import:${d.id}`, JSON.stringify(deck)); } catch { toast.error('That file is too big to open here.'); }
      if (skipped.length) toast(`Not brought in: ${skipped.join('; ')}`);
      router.push(`/slides/${d.id}`);
    } catch (err) { toast.error((err as Error).message); setBusy(false); }
  };
  const deckRef = useRef<HTMLInputElement>(null);
  const templates: { id: string; name: string; hint: string }[] = creating === 'sheet' ? SHEET_TEMPLATES : creating === 'slides' ? DECK_TEMPLATES : creating === 'doc' ? DOC_TEMPLATES : [];
  const listed = (data?.docs ?? []).filter((d) => show === 'all' || kindOf(d.kind) === show);
  return (
    <>
      <Topbar title="Docs" subtitle="Write together: notes, reports and plans, with comments and history" />
      <SectionTabs tabs={COLLAB_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/studio?tool=convert" className="btn-secondary"><Repeat2 className="w-4 h-4" /> Convert files</Link>
            {(Object.keys(KINDS) as Kind[]).map((k) => {
              const K = KINDS[k];
              return <button key={k} type="button" className={creating === k ? 'btn-primary' : 'btn-secondary'} aria-pressed={creating === k} onClick={() => { setCreating(creating === k ? null : k); setForm((f) => ({ ...f, template: '', title: '' })); }}><K.icon className="w-4 h-4" /> New {K.one}</button>;
            })}
          </div>
          {creating && (
            <motion.form key={creating} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} onSubmit={create} aria-label={`New ${KINDS[creating].one}`} className={`panel p-5 grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end`}>
              <label className="text-sm space-y-1"><span className="text-zinc-600 dark:text-zinc-400">Name</span>
                <input autoFocus maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={KINDS[creating].placeholder} className="input" />
              </label>
              <label className="text-sm space-y-1"><span className="text-zinc-600 dark:text-zinc-400">For</span>
                <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="input">
                  <option value="">Me and people I share it with</option>
                  {data?.courses.map((c) => <option key={c.id} value={`c:${c.id}`}>Everyone in {c.code} · {c.name}</option>)}
                  {data?.groups?.map((g) => <option key={g.id} value={`g:${g.id}`}>Everyone in {g.name}</option>)}
                </select>
              </label>
              <button type="submit" className="btn-primary" disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Create</button>
              {/* Start from a template (Stage 5 · B9.1), or for a spreadsheet an Excel or CSV file. */}
              <div className="sm:col-span-3" role="radiogroup" aria-label="Start from">
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1.5">Start from</p>
                <div className="flex flex-wrap gap-1.5">
                  {[{ id: '', name: 'Blank', hint: 'Empty' }, ...templates].map((t) => (
                    <button key={t.id || 'blank'} type="button" role="radio" aria-checked={form.template === t.id} title={t.hint}
                      onClick={() => setForm((f) => ({ ...f, template: t.id, title: f.title || (t.id ? t.name : '') }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${form.template === t.id ? 'bg-indigo-600 text-white border-transparent' : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 hover:border-indigo-400/60'}`}>{t.name}</button>
                  ))}
                  {creating === 'slides' && <>
                    <input ref={deckRef} type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" aria-label="PowerPoint file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openDeck(f); }} />
                    <button type="button" disabled={busy} onClick={() => deckRef.current?.click()} className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-zinc-300 dark:border-white/20 text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1"><FileUp className="w-3.5 h-3.5" />Open a PowerPoint file</button>
                  </>}
                  {creating === 'sheet' && <>
                    <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" aria-label="Excel or CSV file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f); }} />
                    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-zinc-300 dark:border-white/20 text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1"><FileUp className="w-3.5 h-3.5" />Open an Excel or CSV file</button>
                  </>}
                </div>
              </div>
            </motion.form>
          )}
          {data && data.docs.some((d) => kindOf(d.kind) !== 'doc') && (
            <Segmented<'all' | Kind> label="Show" value={show} onChange={setShow} segments={[{ value: 'all', label: 'All' }, ...(Object.keys(KINDS) as Kind[]).map((k) => ({ value: k, label: KINDS[k].label }))]} className="max-w-xl" />
          )}
          {isLoading ? <div className="h-40 rounded-2xl skeleton" /> : !data?.docs.length ? (
            <FeatureGuide icon={FileText} title="Write together"
              description="Documents, spreadsheets and presentations everyone can work on at the same time. Comment on anything, look back at earlier versions, and save them as Word, Excel, PowerPoint or PDF."
              steps={['Make a document, spreadsheet or presentation for yourself, a group, or a whole class', 'Share it, or everyone in the class already has it', 'Work together and see each other’s cursors']}
              example={<ExampleRow title="Lab report: plant growth" meta="Edited 2 minutes ago · 3 writing" right="Open" />} />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 stagger">
              {(show === 'all' ? topLevel(data.docs) : listed).map((d) => {
                const inside = show === 'all' ? kids.get(d.id) ?? [] : [];
                const total = show === 'all' ? countBelow(d.id) : 0;
                const K = KINDS[kindOf(d.kind)];
                return (
                  <div key={d.id} className="panel lift p-4 hover:border-indigo-400/50">
                    <Link href={`${K.path}/${d.id}`} className="flex gap-3">
                      <span className={cn('w-10 h-10 rounded-xl bg-gradient-to-br text-white flex items-center justify-center shrink-0', K.tone)} role="img" aria-label={K.one}><K.icon className="w-5 h-5" /></span>
                      <span className="flex-1 min-w-0">
                        <span data-shared={`doc:${d.id}`} className="block font-medium text-zinc-900 dark:text-white truncate">{d.title}</span>
                        <span className="block text-xs text-zinc-500 truncate">{d.course ? `${d.course} · ` : d.mine ? '' : 'Shared with you · '}{new Date(d.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{total ? ` · ${total} page${total === 1 ? '' : 's'} inside` : ''}</span>
                        {d.preview && <span className="block text-xs text-zinc-400 line-clamp-2 mt-1">{d.preview}</span>}
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-400 self-center" />
                    </Link>
                    {inside.length > 0 && (
                      <ul className="mt-2 ml-[3.25rem] space-y-0.5" aria-label={`Pages inside ${d.title}`}>
                        {inside.slice(0, 4).map((c) => <li key={c.id}><Link href={`${KINDS[kindOf(c.kind)].path}/${c.id}`} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300"><CornerDownRight className="w-3 h-3 text-zinc-400 shrink-0" aria-hidden /><span className="truncate">{c.title}</span></Link></li>)}
                        {inside.length > 4 && <li className="text-xs text-zinc-500 pl-[1.125rem]">and {inside.length - 4} more</li>}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
