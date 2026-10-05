'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Globe2, Loader2, LogOut, MoreHorizontal, PenTool, Plus, Search, Trash2, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { NewBoardDialog } from '@/components/boards/NewBoardDialog';
import type { TemplateId } from '@/components/boards/templates';
import { Avatar } from '@/components/chat/MessageBubble';
import { cn } from '@/lib/utils';

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

export default function BoardsPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<BoardSummary[]>('/api/boards', authedJson);
  const [tab, setTab] = useState<'all' | 'mine' | 'shared'>('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
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

  const remove = async (b: BoardSummary) => {
    setMenu(null);
    if (!(await confirmDialog({ title: `Delete “${b.title}”?`, message: 'The board is deleted for everyone it is shared with. This can’t be undone.', confirmLabel: 'Delete', destructive: true }))) return;
    mutate((list) => list?.filter((x) => x.id !== b.id), { revalidate: false });
    try {
      await authedJson(`/api/boards/${b.id}`, { method: 'DELETE' });
      toast.success('Board deleted');
    } catch (e) {
      toast.error((e as Error).message);
      mutate();
    }
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
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto" onClick={() => setMenu(null)}>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="inline-flex p-1 rounded-2xl bg-zinc-100 dark:bg-white/[0.04] text-sm font-semibold">
              {(['all', 'mine', 'shared'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cn('px-4 py-1.5 rounded-xl transition-colors', tab === t ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500')}>
                  {t === 'all' ? 'All' : t === 'mine' ? 'My boards' : 'Shared with me'}
                </button>
              ))}
            </div>
            <label className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search boards" aria-label="Search boards"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
            </label>
            <button onClick={create} aria-busy={creating || undefined} disabled={creating} className="btn-primary sm:ml-auto">
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
                <div key={b.id} className="group relative rounded-3xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 overflow-hidden hover:border-indigo-500/40 transition-colors">
                  <Link href={`/boards/${b.id}`} className="block">
                    <div className="aspect-[16/9] bg-zinc-50 dark:bg-white/[0.03] flex items-center justify-center overflow-hidden border-b border-zinc-100 dark:border-white/[0.05]">
                      {b.thumbnail
                        ? <img loading="lazy" decoding="async" src={b.thumbnail} alt="" className="w-full h-full object-contain" />
                        : <PenTool className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />}
                    </div>
                    <div className="p-4">
                      <p className="font-bold text-zinc-900 dark:text-white truncate">{b.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-500 truncate">
                        {b.mine ? 'You' : b.owner.name} · edited {ago(b.updatedAt)}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {[b.owner, ...b.people].slice(0, 4).map((p) => (
                            <div key={p.id} className="rounded-full ring-2 ring-white dark:ring-zinc-900"><Avatar name={p.name} src={p.avatar} size={24} /></div>
                          ))}
                        </div>
                        {b.memberCount > 0 && <span className="text-xs text-zinc-500 inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {b.memberCount + 1}</span>}
                        {b.linkAccess !== 'NONE' && <span className="text-xs text-zinc-500 inline-flex items-center gap-1"><Globe2 className="w-3.5 h-3.5" /> Link</span>}
                        {b.myRole === 'VIEWER' && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500">View only</span>}
                      </div>
                    </div>
                  </Link>
                  <button onClick={(e) => { e.stopPropagation(); setMenu(menu === b.id ? null : b.id); }} aria-label={`More for ${b.title}`}
                    className="absolute right-3 top-3 w-9 h-9 rounded-xl inline-flex items-center justify-center text-zinc-700 dark:text-zinc-200 bg-white/85 dark:bg-zinc-900/75 backdrop-blur border border-zinc-200 dark:border-white/10 shadow-sm hover:bg-white dark:hover:bg-zinc-800">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menu === b.id && (
                    <div onClick={(e) => e.stopPropagation()} className="absolute right-3 top-14 z-10 w-44 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-xl py-1 text-sm">
                      <button onClick={() => copy(b)} className="w-full px-3 py-2 flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200"><Copy className="w-4 h-4" /> Make a copy</button>
                      {b.mine
                        ? <button onClick={() => remove(b)} className="w-full px-3 py-2 flex items-center gap-2 hover:bg-rose-500/10 text-rose-500"><Trash2 className="w-4 h-4" /> Delete</button>
                        : <button onClick={() => leave(b)} className="w-full px-3 py-2 flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200"><LogOut className="w-4 h-4" /> Leave board</button>}
                    </div>
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
