'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronRight, Code2, Loader2, Lock, Plus } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';

interface Data {
  courses: { id: string; code: string; name: string }[];
  rooms: { id: string; courseId: string; title: string; language: string; locked: boolean; updatedAt: string; createdBy: { name: string } | null }[];
}

const LANG_LABEL: Record<string, string> = { javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', java: 'Java', cpp: 'C++' };
const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const field = 'w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500';

/** Shared code editors for your courses: write code together, live. */
export default function CodeRoomsPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<Data>('/api/code', authedJson);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ courseId: '', title: '', language: 'javascript' });
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const room = await authedJson<{ id: string }>('/api/code', { method: 'POST', body: JSON.stringify({ ...form, courseId: form.courseId || data?.courses[0]?.id }) });
      router.push(`/code/${room.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  const byCourse = (data?.courses ?? []).map((c) => ({ ...c, rooms: (data?.rooms ?? []).filter((r) => r.courseId === c.id) })).filter((c) => c.rooms.length);

  return (
    <>
      <Topbar title="Code together" subtitle="Shared code editors for your courses: edit at the same time and see each other’s cursors" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-end">
            {!creating && !!data?.courses.length && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New code room</button>}
          </div>
          {creating && data && (
            <form onSubmit={create} className={`${card} p-5 grid sm:grid-cols-[1fr_1fr_10rem_auto] gap-2 items-end`}>
              <label className="text-sm space-y-1"><span className="text-zinc-600 dark:text-zinc-400">Course</span>
                <select value={form.courseId || data.courses[0]?.id} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className={field}>
                  {data.courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                </select>
              </label>
              <label className="text-sm space-y-1"><span className="text-zinc-600 dark:text-zinc-400">Name</span>
                <input required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lab 3: linked lists" className={field} />
              </label>
              <label className="text-sm space-y-1"><span className="text-zinc-600 dark:text-zinc-400">Language</span>
                <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className={field}>
                  {Object.entries(LANG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <button type="submit" className="btn-primary" disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Create</button>
            </form>
          )}
          {isLoading ? (
            <div className="h-32 rounded-2xl skeleton" />
          ) : !data?.courses.length ? (
            <p className={`${card} p-6 text-sm text-zinc-500`}>Code rooms belong to a course. Join or teach a course to use them.</p>
          ) : byCourse.length === 0 ? (
            <FeatureGuide
              icon={Code2}
              title="Write code together"
              description="A code room is a shared editor for a course: everyone in the room types in the same file at once, sees each other's cursors, and can run JavaScript right in the browser. Teachers can lock a room so only they edit."
              steps={['Create a room for a course', 'Share it: everyone in the course can open it', 'Edit together; run JavaScript to see the output']}
              example={<ExampleRow title="Lab 3: linked lists" meta="CS201 · JavaScript · 3 people here" right="Open" />}
            />
          ) : (
            byCourse.map((c) => (
              <section key={c.id} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">{c.code} · {c.name}</h2>
                {c.rooms.map((r) => (
                  <Link key={r.id} href={`/code/${r.id}`} className={`${card} p-4 flex items-center gap-3 hover:border-indigo-400/50 transition-colors`}>
                    <Code2 className="w-5 h-5 text-indigo-500 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-zinc-900 dark:text-white truncate">{r.title}</span>
                      <span className="block text-xs text-zinc-500">{LANG_LABEL[r.language] ?? r.language}{r.createdBy ? ` · by ${r.createdBy.name}` : ''} · {new Date(r.updatedAt).toLocaleDateString()}</span>
                    </span>
                    {r.locked && <Lock className="w-4 h-4 text-zinc-400" aria-label="Locked: only the teacher edits" />}
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </Link>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}
