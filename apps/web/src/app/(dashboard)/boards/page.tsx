'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Clock, Copy, Globe2, Loader2, LogOut, MoreHorizontal, PenLine, PenTool, Plus, Search, Trash2, Users } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { CollabTabs } from '@/components/layout/SectionTabs';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { NewBoardDialog } from '@/components/boards/NewBoardDialog';
import { useOnceParam } from '@/lib/use-once-param';
import type { TemplateId } from '@/components/boards/templates';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { TabPill } from '@/components/ui/Glide';
import { removeWithUndo } from '@/lib/undo';
import { useAuthStore } from '@/store/auth';
import { GUIDE_TITLE, GUIDE_VERSION, guideHref } from '@/components/boards/guide-title';

// Whiteboards: every student, teacher and admin can draw on a board, add photos, and share it so
// classmates and teachers draw on it together live (see /boards/[id]).

type Person = { id: string; name: string; avatar: string | null };
type BoardSummary = {
  id: string;
  title: string;
  thumbnail: string | null;
  linkAccess: 'NONE' | 'VIEW' | 'EDIT';
  updatedAt: string;
  owner: Person;
  mine: boolean;
  myRole: 'OWNER' | 'EDITOR' | 'VIEWER';
  people: Person[];
  memberCount: number;
};

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString();
}

/** A guide board is being made (the list can load twice before it lands). */
let making = false;

export default function BoardsPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<BoardSummary[]>('/api/boards', authedJson);
  const owner = useAuthStore((s) => !!s.user?.owner);
  // The owner's "UniVerse explained" board is there without asking: made once per design version (on
  // this device). A board from an older design is renamed "(old)" and the new one is made, so a new
  // design shows up by itself. Deleted on purpose later: it stays deleted (the console can make one).
  useEffect(() => {
    if (!owner || !data) return;
    try { if (making || localStorage.getItem('uv-guide-made') === GUIDE_VERSION) return; } catch { return; }
    making = true;
    const old = data.filter((b) => b.mine && b.title === GUIDE_TITLE);
    void Promise.all(old.map((b) => authedJson(`/api/boards/${b.id}`, { method: 'PATCH', body: JSON.stringify({ title: `${GUIDE_TITLE} (old)` }) }).catch(() => {})))
      .then(() => authedJson('/api/boards', { method: 'POST', body: JSON.stringify({ title: GUIDE_TITLE }) }))
      .then(() => { try { localStorage.setItem('uv-guide-made', GUIDE_VERSION); } catch { /* private mode */ } return mutate(); }, () => {})
      .finally(() => { making = false; });
  }, [owner, data, mutate]);
  const [tab, setTab] = useState<'all' | 'mine' | 'shared'>('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  useOnceParam('new', () => setNewOpen(true)); // Collaborate → Home's "New whiteboard" (and its b shortcut)
  const create = () => setNewOpen(true);
  const createBoard = async (title: string, template: TemplateId) => {
    setCreating(true);
    try {
      const board = await authedJson<{ id: string }>('/api/boards', { method: 'POST', body: JSON.stringify({ title }) });
      router.push(`/boards/${board.id}${template !== 'blank' ? `?template=${template}` : ''}`);
    } catch (e) {
      toast.error((e as Error).message);
      setCreating(false);
    }
  };

  // Gone at once with Undo (for everyone it's shared with, once the message goes).
  const remove = (b: BoardSummary) => {
    setMenu(null);
    removeWithUndo(`Deleted “${b.title}”`, {
      hide: () => void mutate((list) => list?.filter((x) => x.id !== b.id), { revalidate: false }),
      restore: () => void mutate(),
      commit: async () => { await authedJson(`/api/boards/${b.id}`, { method: 'DELETE' }); void mutate(); },
    });
  };

  // Rename (anyone who can edit the board): shows the new name at once, and puts the old one back if
  // the server says no.
  const rename = async (b: BoardSummary) => {
    setMenu(null);
    const title = (await promptDialog({ title: 'Rename board', defaultValue: b.title, confirmLabel: 'Rename', maxLength: 120 }))?.trim();
    if (!title || title === b.title) return;
    void mutate((list) => list?.map((x) => (x.id === b.id ? { ...x, title } : x)), { revalidate: false });
    try {
      await authedJson(`/api/boards/${b.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      toast.success('Board renamed');
    } catch (e) {
      toast.error((e as Error).message);
    }
    void mutate();
  };

  const leave = async (b: BoardSummary) => {
    setMenu(null);
    if (!(await confirmDialog({ title: `Leave “${b.title}”?`, message: 'It will no longer appear in your boards. The owner can share it with you again.', confirmLabel: 'Leave' }))) return;
    mutate((list) => list?.filter((x) => x.id !== b.id), { revalidate: false });
    try {
      await authedJson(`/api/boards/${b.id}/members`, { method: 'DELETE' });
    } catch (e) {
      toast.error((e as Error).message);
      mutate();
    }
  };

  const copy = async (b: BoardSummary) => {
    setMenu(null);
    try {
      const board = await authedJson<{ id: string }>(`/api/boards/${b.id}/copy`, { method: 'POST' });
      toast.success('Copy created');
      router.push(`/boards/${board.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const list = (data ?? [])
    .filter((b) => (tab === 'mine' ? b.mine : tab === 'shared' ? !b.mine : true))
    .filter((b) => !q.trim() || b.title.toLowerCase().includes(q.trim().toLowerCase()) || b.owner.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <Topbar title="Whiteboards" subtitle="Draw, add photos and work on a canvas together, live" />
      <CollabTabs />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto" onClick={() => setMenu(null)}>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="inline-flex p-1 rounded-2xl bg-zinc-100 dark:bg-white/[0.04] text-sm font-semibold">
              {(['all', 'mine', 'shared'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cn('relative isolate px-4 py-1.5 rounded-xl transition-colors', tab === t ? 'text-zinc-900 dark:text-white' : 'text-zinc-500')}>
                  {tab === t && <TabPill id="boards-tab" variant="soft" />}
                  {t === 'all' ? 'All' : t === 'mine' ? 'My boards' : 'Shared with me'}
                </button>
              ))}
            </div>
            <label className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search boards" aria-label="Search boards"
                className="w-full h-10 ps-9 pe-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
            </label>
            <button onClick={create} aria-busy={creating || undefined} disabled={creating} className="btn-primary sm:ms-auto">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} New board
            </button>
          </div>

          {error ? (
            <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-8 text-center text-sm text-rose-500">
              Couldn’t load your boards. <button onClick={() => mutate()} className="font-semibold underline">Try again</button>
            </div>
          ) : isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => <div key={i} className="h-60 rounded-3xl skeleton" />)}
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-300 dark:border-white/10 p-10 sm:p-14 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-500 flex items-center justify-center"><PenTool className="w-7 h-7" /></div>
              <h2 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">{q || tab !== 'all' ? 'No boards here' : 'Start your first whiteboard'}</h2>
              <p className="mt-1 text-sm text-zinc-500 max-w-md mx-auto">
                Sketch ideas, annotate a photo of your notes, plan a project or solve problems with your class, all on one live canvas.
              </p>
              <button onClick={create} className="btn-primary mt-5"><Plus className="w-4 h-4" /> New board</button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {list.map((b) => (
                <div key={b.id} className="group relative rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white dark:bg-[#11212d]/80 overflow-hidden shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-indigo-400/50 hover:shadow-[0_24px_60px_-28px_rgba(37,55,69,0.55)]">
                  <Link href={b.mine && b.title === GUIDE_TITLE ? guideHref(b.id) : `/boards/${b.id}`} className="block">
                    {/* The preview on a canvas of dots; in dark mode it's inverted like the board itself, so it isn't a white box. */}
                    <div className="relative aspect-[16/10] overflow-hidden bg-zinc-50 dark:bg-[#11212d] bg-[radial-gradient(circle_at_1px_1px,rgb(99_102_241/0.18)_1px,transparent_0)] [background-size:18px_18px]">
                      {b.thumbnail
                        ? <img loading="lazy" decoding="async" src={b.thumbnail} alt="" className="w-full h-full object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.04] dark:invert dark:hue-rotate-180 dark:opacity-90" />
                        : <div className="w-full h-full grid place-items-center"><span className="w-14 h-14 rounded-2xl grid place-items-center bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-500 dark:text-indigo-300"><PenTool className="w-7 h-7" /></span></div>}
                      <span aria-hidden className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white dark:from-[#06141b] to-transparent" />
                    </div>
                    <div className="px-4 pb-4 pt-1">
                      <p className="font-semibold text-zinc-900 dark:text-white truncate">{b.title}</p>
                      <p className="mt-1 text-xs text-zinc-500 flex items-center gap-1.5 truncate">
                        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden /> {b.mine ? 'You' : b.owner.name} · edited {ago(b.updatedAt)}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {[b.owner, ...b.people].slice(0, 4).map((p) => (
                            <div key={p.id} className="rounded-full ring-2 ring-white dark:ring-[#06141b]"><Avatar name={p.name} src={p.avatar} size={24} /></div>
                          ))}
                        </div>
                        {b.memberCount > 0 && <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1 h-6 px-2 rounded-full border border-zinc-200 dark:border-white/10"><Users className="w-3.5 h-3.5" aria-hidden /> {b.memberCount + 1}</span>}
                        {b.linkAccess !== 'NONE' && <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1 h-6 px-2 rounded-full border border-zinc-200 dark:border-white/10"><Globe2 className="w-3.5 h-3.5" aria-hidden /> Link</span>}
                        {b.myRole === 'VIEWER' && <span className="ms-auto text-[11px] font-semibold h-6 px-2 inline-flex items-center rounded-full bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">View only</span>}
                      </div>
                    </div>
                  </Link>
                  <button onClick={(e) => { e.stopPropagation(); setMenu(menu === b.id ? null : b.id); }} aria-label={`More for ${b.title}`} aria-expanded={menu === b.id}
                    className={cn('absolute end-3 top-3 w-9 h-9 rounded-xl inline-flex items-center justify-center text-zinc-700 dark:text-zinc-100 bg-white/85 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-white/10 shadow-sm transition-[opacity,background-color] duration-200 hover:bg-white dark:hover:bg-zinc-800 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100', menu === b.id && '[@media(hover:hover)]:opacity-100')}>
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menu === b.id && (
                    <motion.div onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                      className="absolute end-3 top-14 z-10 w-48 origin-top-right rtl:origin-top-left rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-1.5 text-sm">
                      {b.myRole !== 'VIEWER' && <button onClick={() => void rename(b)} className="w-full px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200"><PenLine className="w-4 h-4" /> Rename</button>}
                      <button onClick={() => copy(b)} className="w-full px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200"><Copy className="w-4 h-4" /> Make a copy</button>
                      {b.mine
                        ? <button onClick={() => remove(b)} className="w-full px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Delete</button>
                        : <button onClick={() => leave(b)} className="w-full px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200"><LogOut className="w-4 h-4" /> Leave board</button>}
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {newOpen && <NewBoardDialog onCreate={createBoard} onClose={() => setNewOpen(false)} />}
    </>
  );
}
