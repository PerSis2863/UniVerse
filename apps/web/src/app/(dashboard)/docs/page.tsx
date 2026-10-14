'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { ChevronRight, CornerDownRight, FileText, Loader2, Plus, Repeat2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, COLLAB_TABS } from '@/components/layout/SectionTabs';
import { authedJson } from '@/lib/authed-fetch';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { spring } from '@/lib/motion';
import { DOC_TEMPLATES } from '@/lib/doc-templates';
import { childrenOf, topLevel } from '@/lib/doc-pages';

// Docs (Stage 4 · 3.2): documents written together live (src/server/docs.ts). Stage 5 · B9.14: a
// converter for files (Word, PDF, Excel, pictures, sound, video, ZIP), all on the device. B9.2:
// pages inside pages show under their top page.


interface List {
  courses: { id: string; code: string; name: string }[];
  groups?: { id: string; name: string }[];
  docs: { id: string; title: string; preview: string | null; course: string | null; parentId: string | null; mine: boolean; updatedAt: string }[];
}

export default function DocsPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<List>('/api/docs', authedJson);
  const kids = data ? childrenOf(data.docs) : new Map<string, List['docs']>();
  const countBelow = (id: string): number => (kids.get(id) ?? []).reduce((n, c) => n + 1 + countBelow(c.id), 0);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', courseId: '', template: '' }); // courseId holds c:<id> or g:<id>
  const [busy, setBusy] = useState(false);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { const d = await authedJson<{ id: string }>('/api/docs', { method: 'POST', body: JSON.stringify({ title: form.title, courseId: form.courseId.startsWith('c:') ? form.courseId.slice(2) : undefined, groupId: form.courseId.startsWith('g:') ? form.courseId.slice(2) : undefined }) }); router.push(`/docs/${d.id}${form.template ? `?template=${form.template}` : ''}`); }
    catch (err) { toast.error((err as Error).message); setBusy(false); }
  };
  return (
    <>
      <Topbar title="Docs" subtitle="Write together: notes, reports and plans, with comments and history" />
      <SectionTabs tabs={COLLAB_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-end gap-2">
            <Link href="/studio?tool=convert" className="btn-secondary"><Repeat2 className="w-4 h-4" /> Convert files</Link>
            {!creating && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New document</button>}
          </div>
          {creating && (
            <motion.form initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} onSubmit={create} className={`panel p-5 grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end`}>
              <label className="text-sm space-y-1"><span className="text-zinc-600 dark:text-zinc-400">Name</span>
                <input autoFocus maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lab report" className="input" />
              </label>
              <label className="text-sm space-y-1"><span className="text-zinc-600 dark:text-zinc-400">For</span>
                <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="input">
                  <option value="">Me and people I share it with</option>
                  {data?.courses.map((c) => <option key={c.id} value={`c:${c.id}`}>Everyone in {c.code} · {c.name}</option>)}
                  {data?.groups?.map((g) => <option key={g.id} value={`g:${g.id}`}>Everyone in {g.name}</option>)}
                </select>
              </label>
              <button type="submit" className="btn-primary" disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Create</button>
              {/* Start from a template (Stage 5 · B9.1). */}
              <div className="sm:col-span-3" role="radiogroup" aria-label="Start from">
                <p className="text-xs text-zinc-500 mb-1.5">Start from</p>
                <div className="flex flex-wrap gap-1.5">
                  {[{ id: '', name: 'Blank', hint: 'An empty page' }, ...DOC_TEMPLATES].map((t) => (
                    <button key={t.id || 'blank'} type="button" role="radio" aria-checked={form.template === t.id} title={t.hint}
                      onClick={() => setForm((f) => ({ ...f, template: t.id, title: f.title || (t.id ? t.name : '') }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${form.template === t.id ? 'bg-indigo-500 text-white border-transparent' : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 hover:border-indigo-400/60'}`}>{t.name}</button>
                  ))}
                </div>
              </div>
            </motion.form>
          )}
          {isLoading ? <div className="h-40 rounded-2xl skeleton" /> : !data?.docs.length ? (
            <FeatureGuide icon={FileText} title="Write together"
              description="A document everyone can type in at the same time, with headings, lists, checklists, tables and pictures. Comment on any sentence, look back at earlier versions, and save it as PDF or Word."
              steps={['Make a document for yourself, a group, or a whole class', 'Share it, or everyone in the class already has it', 'Write together and see each other’s cursors']}
              example={<ExampleRow title="Lab report: plant growth" meta="Edited 2 minutes ago · 3 writing" right="Open" />} />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 stagger">
              {topLevel(data.docs).map((d) => {
                const inside = kids.get(d.id) ?? [];
                const total = countBelow(d.id);
                return (
                  <div key={d.id} className="panel lift p-4 hover:border-indigo-400/50">
                    <Link href={`/docs/${d.id}`} className="flex gap-3">
                      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex items-center justify-center shrink-0"><FileText className="w-5 h-5" /></span>
                      <span className="flex-1 min-w-0">
                        <span data-shared={`doc:${d.id}`} className="block font-medium text-zinc-900 dark:text-white truncate">{d.title}</span>
                        <span className="block text-xs text-zinc-500 truncate">{d.course ? `${d.course} · ` : d.mine ? '' : 'Shared with you · '}{new Date(d.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{total ? ` · ${total} page${total === 1 ? '' : 's'} inside` : ''}</span>
                        {d.preview && <span className="block text-xs text-zinc-400 line-clamp-2 mt-1">{d.preview}</span>}
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-400 self-center" />
                    </Link>
                    {inside.length > 0 && (
                      <ul className="mt-2 ml-[3.25rem] space-y-0.5" aria-label={`Pages inside ${d.title}`}>
                        {inside.slice(0, 4).map((c) => <li key={c.id}><Link href={`/docs/${c.id}`} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300"><CornerDownRight className="w-3 h-3 text-zinc-400 shrink-0" aria-hidden /><span className="truncate">{c.title}</span></Link></li>)}
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
