'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { CalendarClock, ChevronRight, KanbanSquare, Loader2, Plus } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, COLLAB_TABS } from '@/components/layout/SectionTabs';
import { authedJson } from '@/lib/authed-fetch';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Tasks (Stage 4 · 3.3): my open tasks from every board, and my boards (src/server/tasks.ts).

interface Overview {
  courses: { id: string; code: string; name: string }[];
  groups?: { id: string; name: string }[];
  boards: { id: string; title: string; course: string | null; mine: boolean; tasks: number; updatedAt: string }[];
  mine: { id: string; title: string; dueAt: string | null; boardId: string; board: string; list: string }[];
}


function groupOf(due: string | null, now: number) {
  if (!due) return 'No date';
  const d = new Date(due), start = new Date(now); start.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  return days < 0 ? 'Overdue' : days === 0 ? 'Today' : days < 7 ? 'This week' : 'Later';
}
const ORDER = ['Overdue', 'Today', 'This week', 'Later', 'No date'];

export default function TasksPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<Overview>('/api/tasks', authedJson);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', courseId: '' }); // courseId holds c:<id> or g:<id>
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const b = await authedJson<{ id: string }>('/api/tasks', { method: 'POST', body: JSON.stringify({ title: form.title, courseId: form.courseId.startsWith('c:') ? form.courseId.slice(2) : undefined, groupId: form.courseId.startsWith('g:') ? form.courseId.slice(2) : undefined }) });
      router.push(`/tasks/${b.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };
  const groups = ORDER.map((g) => ({ g, items: (data?.mine ?? []).filter((t) => groupOf(t.dueAt, now) === g) })).filter((x) => x.items.length);

  return (
    <>
      <Topbar title="Tasks" subtitle="Boards of cards for projects and classes: who does what, by when" />
      <SectionTabs tabs={COLLAB_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-end">
            {!creating && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New board</button>}
          </div>
          {creating && (
            <motion.form initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} onSubmit={create} className={`panel p-5 grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end`}>
              <label className="text-sm space-y-1"><span className="text-zinc-600 dark:text-zinc-400">Name</span>
                <input required autoFocus maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Science fair project" className="input" />
              </label>
              <label className="text-sm space-y-1"><span className="text-zinc-600 dark:text-zinc-400">For</span>
                <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="input">
                  <option value="">Me and people I add</option>
                  {data?.courses.map((c) => <option key={c.id} value={`c:${c.id}`}>Everyone in {c.code} · {c.name}</option>)}
                  {data?.groups?.map((g) => <option key={g.id} value={`g:${g.id}`}>Everyone in {g.name}</option>)}
                </select>
              </label>
              <button type="submit" className="btn-primary" disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Create</button>
            </motion.form>
          )}

          {isLoading ? <div className="h-40 rounded-2xl skeleton" /> : (
            <>
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">My tasks</h2>
                {groups.length === 0 ? (
                  <p className={`panel p-5 text-sm text-zinc-500`}>Nothing given to you right now. Cards assigned to you on any board show up here, and the ones with a due date go into your study planner.</p>
                ) : groups.map(({ g, items }) => (
                  <div key={g} className="space-y-1.5 stagger">
                    <p className={cn('text-xs font-semibold', g === 'Overdue' ? 'text-rose-500' : 'text-zinc-500')}>{g} · {items.length}</p>
                    {items.map((t) => (
                      <Link key={t.id} href={`/tasks/${t.boardId}?task=${t.id}`} className={`panel lift px-4 py-3 flex items-center gap-3 hover:border-indigo-400/50`}>
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium text-zinc-900 dark:text-white truncate">{t.title}</span>
                          <span className="block text-xs text-zinc-500 truncate">{t.board} · {t.list}</span>
                        </span>
                        {t.dueAt && <span className={cn('text-xs inline-flex items-center gap-1 shrink-0', g === 'Overdue' ? 'text-rose-500' : 'text-zinc-500')}><CalendarClock className="w-3.5 h-3.5" />{new Date(t.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      </Link>
                    ))}
                  </div>
                ))}
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Boards</h2>
                {!data?.boards.length ? (
                  <FeatureGuide
                    icon={KanbanSquare}
                    title="Plan work together"
                    description="A board has lists (To do, Doing, Done) of cards. Give a card to someone, set a due date, tick off a checklist, and talk about it in comments. Everyone on the board sees changes as they happen."
                    steps={['Make a board for yourself, a group, or a whole class', 'Add cards and give them to people', 'Drag cards across as work moves on']}
                    example={<ExampleRow title="Science fair project" meta="3 lists · 12 cards" right="Open" />}
                  />
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3 stagger">
                    {data.boards.map((b) => (
                      <Link key={b.id} href={`/tasks/${b.id}`} className={`panel lift p-4 flex items-center gap-3 hover:border-indigo-400/50`}>
                        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex items-center justify-center shrink-0"><KanbanSquare className="w-5 h-5" /></span>
                        <span className="flex-1 min-w-0">
                          <span data-shared={`task-board:${b.id}`} className="block font-medium text-zinc-900 dark:text-white truncate">{b.title}</span>
                          <span className="block text-xs text-zinc-500 truncate">{b.course ? `${b.course} · ` : b.mine ? '' : 'Shared with you · '}{b.tasks} card{b.tasks === 1 ? '' : 's'}</span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
