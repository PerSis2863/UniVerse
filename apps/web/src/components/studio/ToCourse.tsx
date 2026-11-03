'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { authedJson } from '@/lib/authed-fetch';

// M80: a teacher puts a piece of Create work on a course: a view link (anyone, read-only, updates
// by itself) added as a link in one of the course's modules (a new "Shared work" module when the
// course has none). Only the course's own module rules decide who may add (the teacher).

type Course = { id: string; code?: string | null; name: string };
type Modules = { canManage: boolean; modules: { id: string; title: string }[] };
const get = <T,>(url: string) => authedJson<T>(url);
const post = <T,>(url: string, body: unknown) => authedJson<T>(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

export function ToCourse({ title, viewLink, onClose }: { title: string; viewLink: () => Promise<string | null>; onClose: () => void }) {
  const { data: courses } = useSWR<Course[]>('/api/core/courses/my', get);
  const [course, setCourse] = useState('');
  const { data: mods } = useSWR<Modules>(course ? `/api/courses/${course}/modules` : null, get);
  const [module, setModule] = useState('');
  const [busy, setBusy] = useState(false);
  const list = mods?.canManage ? mods.modules : [];
  const chosen = module || list[0]?.id || '';
  const add = async () => {
    setBusy(true);
    try {
      const url = await viewLink();
      if (!url) return;
      let moduleId = chosen;
      if (!moduleId) moduleId = (await post<{ id: string }>(`/api/courses/${course}/modules`, { action: 'create-module', title: 'Shared work', published: true })).id;
      await post(`/api/courses/${course}/modules`, { action: 'add-item', moduleId, kind: 'LINK', title, url });
      toast.success('Added to the course: students see it in the module, read-only, always up to date.');
      onClose();
    } catch (e) { toast.error((e as Error).message || 'Not added.'); }
    finally { setBusy(false); }
  };
  const field = 'mt-1 w-full rounded-xl border border-zinc-300 dark:border-white/15 bg-white dark:bg-indigo-950/40 px-3 py-2 text-sm text-zinc-900 dark:text-white';
  return (
    <Sheet title="Add to a course" onClose={onClose}
      footer={<button type="button" className="btn-primary w-full sm:w-auto" disabled={!course || !mods || !mods.canManage || busy} onClick={() => void add()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Add “{title}”</button>}>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Students get a read-only link that always shows your latest version.</p>
      {!courses ? <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400" role="status">Loading your courses…</p>
        : !courses.length ? <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">You don’t teach a course yet.</p>
        : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">Course
              <select className={field} value={course} onChange={(e) => { setCourse(e.target.value); setModule(''); }}>
                <option value="">Pick a course</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ''}{c.name}</option>)}
              </select>
            </label>
            {course && mods && (mods.canManage ? (
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">Module
                <select className={field} value={chosen} onChange={(e) => setModule(e.target.value)}>
                  {list.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                  {!list.length && <option value="">A new module, “Shared work”</option>}
                </select>
              </label>
            ) : <p className="text-sm text-amber-700 dark:text-amber-300">Only the course’s teacher can add to it.</p>)}
          </div>
        )}
    </Sheet>
  );
}
