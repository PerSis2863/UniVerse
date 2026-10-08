'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowLeft, CalendarClock, Check, CheckSquare, KanbanSquare, List, Loader2, MessageSquare, Plus, Send, Share2, Trash2, UserMinus, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { TabPill } from '@/components/ui/Glide';
import { MentionInput } from '@/components/ui/MentionInput';

// A task board (Stage 4 · 3.3): lists of cards, dragged across as work moves on (on phones, "Move
// to" in the card), or as one list. Changes from others arrive live (src/server/tasks.ts).

interface CheckItem { text: string; done: boolean }
interface Card { id: string; listId: string; title: string; notes: string | null; assigneeId: string | null; dueAt: string | null; position: number; checklist: CheckItem[]; doneAt: string | null; comments: number }
interface Board {
  id: string; title: string; course: { code: string; name: string } | null; canEdit: boolean; canManage: boolean; me: string;
  people: { id: string; name: string; avatar: string | null }[];
  members: { userId: string; role: string }[];
  lists: { id: string; title: string; position: number }[];
  tasks: Card[];
}

const call = (url: string, method: string, body?: unknown) => authedJson(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export default function TaskBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const key = `/api/tasks/${id}`;
  const { data, error, mutate } = useSWR<Board>(key, authedJson);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [open, setOpen] = useState<string | null>(() => search.get('task'));
  const [sharing, setSharing] = useState(false);
  const [newList, setNewList] = useState('');
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  const [now] = useState(() => Date.now());

  /** Optimistic change, then the server; on failure, the board as the server has it. */
  const act = async (change: (b: Board) => Board, url: string, method: string, body?: unknown) => {
    if (data) mutate(change(data), { revalidate: false });
    try { await call(url, method, body); } catch (e) { toast.error((e as Error).message); } finally { void mutate(); }
  };
  const patchTask = (t: Card, p: Record<string, unknown>) => act(
    (b) => ({ ...b, tasks: b.tasks.map((x) => (x.id === t.id ? { ...x, ...p, ...('done' in p ? { doneAt: p.done ? new Date().toISOString() : null } : {}) } as Card : x)) }),
    `/api/tasks/items/${t.id}`, 'PATCH', p,
  );
  /** Puts a card at the end of a list, or just before another card. */
  const moveTo = (t: Card, listId: string, before?: Card) => {
    const inList = (data?.tasks ?? []).filter((x) => x.listId === listId && x.id !== t.id).sort((a, b) => a.position - b.position);
    let position: number;
    if (!before) position = (inList.at(-1)?.position ?? 0) + 1;
    else { const i = inList.findIndex((x) => x.id === before.id); position = ((inList[i - 1]?.position ?? before.position - 2) + before.position) / 2; }
    haptic('tap');
    void patchTask(t, { listId, position });
  };

  if (error) return <div className="p-8 text-sm text-rose-500">{(error as Error).message}</div>;
  if (!data) return <div className="flex-1 p-6"><div className="h-64 rounded-2xl skeleton" /></div>;
  const person = (uid: string | null) => data.people.find((p) => p.id === uid) ?? null;
  const current = data.tasks.find((t) => t.id === open) ?? null;
  const lists = [...data.lists].sort((a, b) => a.position - b.position);

  const cardView = (t: Card) => {
    const who = person(t.assigneeId);
    const checks = t.checklist.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : null;
    const late = !t.doneAt && t.dueAt && new Date(t.dueAt).getTime() < now;
    return (
      <motion.button layout="position" transition={spring.smooth} key={t.id} type="button" onClick={() => setOpen(t.id)}
        draggable={data.canEdit} onDragStart={(e) => { (e as unknown as DragEvent).dataTransfer?.setData('text/plain', t.id); setDrag({ id: t.id, over: null }); }} onDragEnd={() => setDrag(null)}
        onDragOver={(e) => { if (drag) { e.preventDefault(); if (drag.over !== t.id) setDrag({ ...drag, over: t.id }); } }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const moving = data.tasks.find((x) => x.id === drag?.id); if (moving && moving.id !== t.id) moveTo(moving, t.listId, t); setDrag(null); }}
        className={cn('w-full text-left rounded-xl bg-white dark:bg-zinc-900 border p-3 shadow-sm hover:border-indigo-400/60 transition-colors', drag?.over === t.id ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-zinc-200 dark:border-white/[0.07]', drag?.id === t.id && 'opacity-50')}>
        <p className={cn('text-sm font-medium text-zinc-900 dark:text-white', t.doneAt && 'line-through text-zinc-400')}>{t.title}</p>
        {(t.dueAt || checks || t.comments > 0 || who) && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
            {t.dueAt && <span className={cn('inline-flex items-center gap-1', late && 'text-rose-500 font-semibold')}><CalendarClock className="w-3 h-3" />{new Date(t.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
            {checks && <span className="inline-flex items-center gap-1"><CheckSquare className="w-3 h-3" />{checks}</span>}
            {t.comments > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" />{t.comments}</span>}
            <span className="flex-1" />
            {who && <Avatar name={who.name} src={who.avatar} size={22} />}
          </div>
        )}
      </motion.button>
    );
  };

  return (
    <>
      <Topbar title={data.title} sharedId={`task-board:${id}`} subtitle={data.course ? `${data.course.code} · everyone in ${data.course.name}` : 'Task board'} />
      <div className="px-4 md:px-8 pt-3 flex flex-wrap items-center gap-2">
        <Link href="/tasks" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-indigo-500"><ArrowLeft className="w-4 h-4" />Tasks</Link>
        <span className="flex-1" />
        <div className="flex p-1 rounded-full bg-zinc-100 dark:bg-white/[0.06]">
          {([['board', 'Board', KanbanSquare], ['list', 'List', List]] as const).map(([v, label, Icon]) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn('relative isolate px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1', view === v ? 'text-white' : 'text-zinc-500')}>
              {view === v && <TabPill id="task-view" />}<Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
        {data.canManage && !data.course && <button type="button" onClick={() => setSharing(true)} className="px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-xs font-semibold inline-flex items-center gap-1"><Share2 className="w-3.5 h-3.5" />Share</button>}
        {data.canManage && <button type="button" aria-label="Delete board" onClick={async () => { if (await confirmDialog({ title: 'Delete this board?', message: 'All its lists and cards go too.', destructive: true })) { await call(key, 'DELETE').catch((e) => toast.error((e as Error).message)); router.push('/tasks'); } }} className="p-2 rounded-full text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>}
      </div>

      {view === 'board' ? (
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 md:px-8">
          <div className="flex gap-3 items-start h-full min-w-max">
            {lists.map((l) => {
              const cards = data.tasks.filter((t) => t.listId === l.id).sort((a, b) => a.position - b.position);
              return (
                <section key={l.id} onDragOver={(e) => { if (drag) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const moving = data.tasks.find((x) => x.id === drag?.id); if (moving) moveTo(moving, l.id); setDrag(null); }}
                  className="w-72 shrink-0 max-h-full flex flex-col rounded-2xl bg-zinc-100/80 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/[0.06]">
                  <ListHeader title={l.title} count={cards.length} canEdit={data.canEdit}
                    onRename={(title) => act((b) => ({ ...b, lists: b.lists.map((x) => (x.id === l.id ? { ...x, title } : x)) }), `/api/tasks/lists/${l.id}`, 'PATCH', { title })}
                    onDelete={async () => { if (await confirmDialog({ title: `Delete “${l.title}”?`, message: cards.length ? `Its ${cards.length} card${cards.length === 1 ? '' : 's'} go too.` : 'It’s empty.', destructive: true })) void act((b) => ({ ...b, lists: b.lists.filter((x) => x.id !== l.id) }), `/api/tasks/lists/${l.id}`, 'DELETE'); }} />
                  <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                    <AnimatePresence initial={false}>{cards.map(cardView)}</AnimatePresence>
                  </div>
                  {data.canEdit && <AddCard onAdd={(title) => act((b) => b, `/api/tasks/${id}/items`, 'POST', { listId: l.id, title })} />}
                </section>
              );
            })}
            {data.canEdit && data.lists.length < 12 && (
              <form onSubmit={(e) => { e.preventDefault(); const t = newList.trim(); if (!t) return; setNewList(''); void act((b) => b, `/api/tasks/${id}/lists`, 'POST', { title: t }); }} className="w-72 shrink-0 rounded-2xl border border-dashed border-zinc-300 dark:border-white/15 p-2">
                <input value={newList} onChange={(e) => setNewList(e.target.value)} maxLength={60} placeholder="+ Add a list" className="w-full bg-transparent px-2 py-1.5 text-sm outline-none" />
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 md:px-8">
          <div className="max-w-4xl mx-auto rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {lists.flatMap((l) => data.tasks.filter((t) => t.listId === l.id).sort((a, b) => a.position - b.position).map((t) => {
              const who = person(t.assigneeId);
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button type="button" disabled={!data.canEdit} onClick={() => void patchTask(t, { done: !t.doneAt })} aria-label={t.doneAt ? 'Mark not done' : 'Mark done'} className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0', t.doneAt ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-300 dark:border-white/20')}>{t.doneAt && <Check className="w-3 h-3" />}</button>
                  <button type="button" onClick={() => setOpen(t.id)} className={cn('flex-1 min-w-0 text-left text-sm truncate', t.doneAt ? 'line-through text-zinc-400' : 'text-zinc-900 dark:text-white')}>{t.title}</button>
                  <span className="text-xs text-zinc-500 w-24 truncate">{l.title}</span>
                  <span className="text-xs text-zinc-500 w-20">{t.dueAt ? new Date(t.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</span>
                  <span className="w-6">{who && <Avatar name={who.name} src={who.avatar} size={22} />}</span>
                </div>
              );
            }))}
            {!data.tasks.length && <p className="p-5 text-sm text-zinc-500">No cards yet. Switch to Board to add some.</p>}
          </div>
        </div>
      )}

      {current && <CardSheet card={current} board={data} onClose={() => setOpen(null)} onPatch={(p) => patchTask(current, p)}
        onDelete={async () => { setOpen(null); await act((b) => ({ ...b, tasks: b.tasks.filter((x) => x.id !== current.id) }), `/api/tasks/items/${current.id}`, 'DELETE'); }} />}
      {sharing && <ShareSheet board={data} onClose={() => setSharing(false)} onChanged={() => void mutate()} />}
    </>
  );
}

function ListHeader({ title, count, canEdit, onRename, onDelete }: { title: string; count: number; canEdit: boolean; onRename: (t: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-2">
      {editing ? (
        <input autoFocus value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} onBlur={() => { setEditing(false); if (value.trim() && value.trim() !== title) onRename(value.trim()); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="flex-1 rounded-lg bg-white dark:bg-zinc-900 px-2 py-1 text-sm font-semibold outline-none" />
      ) : (
        <button type="button" disabled={!canEdit} onClick={() => { setValue(title); setEditing(true); }} className="flex-1 text-left text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">{title}</button>
      )}
      <span className="text-xs text-zinc-500">{count}</span>
      {canEdit && <button type="button" onClick={onDelete} aria-label={`Delete ${title}`} className="p-1 rounded-full text-zinc-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>}
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); const t = value.trim(); if (!t) return; setValue(''); void onAdd(t); }} className="p-2 pt-0">
      <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} placeholder="+ Add a card" className="w-full rounded-xl bg-transparent hover:bg-white/60 dark:hover:bg-white/[0.04] focus:bg-white dark:focus:bg-zinc-900 px-3 py-2 text-sm outline-none" />
    </form>
  );
}

function CardSheet({ card, board, onClose, onPatch, onDelete }: { card: Card; board: Board; onClose: () => void; onPatch: (p: Record<string, unknown>) => Promise<void>; onDelete: () => Promise<void> }) {
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes ?? '');
  const [item, setItem] = useState('');
  const [comment, setComment] = useState('');
  const ckey = `/api/tasks/items/${card.id}/comments`;
  const { data: comments, mutate } = useSWR<{ id: string; body: string; createdAt: string; user: { id: string; name: string; avatar: string | null } }[]>(ckey, authedJson);
  const ro = !board.canEdit;
  const setChecklist = (list: CheckItem[]) => void onPatch({ checklist: list });
  const day = card.dueAt ? new Date(card.dueAt) : null;
  const dateValue = day ? `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` : '';
  return (
    <Sheet title="Card" onClose={onClose} footer={!ro ? (
      <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Delete this card?', destructive: true })) void onDelete(); }} className="text-sm font-semibold text-rose-600 inline-flex items-center gap-1.5"><Trash2 className="w-4 h-4" />Delete card</button>
    ) : undefined}>
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <button type="button" disabled={ro} onClick={() => void onPatch({ done: !card.doneAt })} aria-label={card.doneAt ? 'Mark not done' : 'Mark done'} className={cn('mt-1.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors', card.doneAt ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-300 dark:border-white/20')}>{card.doneAt && <Check className="w-4 h-4" />}</button>
          <textarea value={title} readOnly={ro} rows={1} maxLength={200} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== card.title && void onPatch({ title: title.trim() })} className="flex-1 resize-none bg-transparent text-lg font-semibold text-zinc-900 dark:text-white outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs space-y-1"><span className="text-zinc-500">List</span>
            <select disabled={ro} value={card.listId} onChange={(e) => void onPatch({ listId: e.target.value, position: Date.now() / 1e9 })} className="input">
              {board.lists.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1"><span className="text-zinc-500">Given to</span>
            <select disabled={ro} value={card.assigneeId ?? ''} onChange={(e) => void onPatch({ assigneeId: e.target.value || null })} className="input">
              <option value="">Nobody</option>
              {board.people.map((p) => <option key={p.id} value={p.id}>{p.id === board.me ? `${p.name} (me)` : p.name}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1 col-span-2"><span className="text-zinc-500">Due</span>
            <input type="date" disabled={ro} value={dateValue} onChange={(e) => void onPatch({ dueAt: e.target.value ? new Date(`${e.target.value}T17:00:00`).toISOString() : null })} className="input" />
          </label>
        </div>
        <textarea value={notes} readOnly={ro} rows={3} maxLength={5000} placeholder="Notes" onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (card.notes ?? '') && void onPatch({ notes })} className={cn('input', 'resize-y')} />
        <section className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Checklist {card.checklist.length > 0 && `· ${card.checklist.filter((c) => c.done).length}/${card.checklist.length}`}</p>
          {card.checklist.map((c, i) => (
            <div key={i} className="flex items-center gap-2 group">
              <button type="button" disabled={ro} onClick={() => setChecklist(card.checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} className={cn('w-4 h-4 rounded border-2 flex items-center justify-center', c.done ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-300 dark:border-white/20')}>{c.done && <Check className="w-3 h-3" />}</button>
              <span className={cn('flex-1 text-sm', c.done && 'line-through text-zinc-400')}>{c.text}</span>
              {!ro && <button type="button" onClick={() => setChecklist(card.checklist.filter((_, j) => j !== i))} aria-label="Remove" className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          {!ro && card.checklist.length < 30 && (
            <form onSubmit={(e) => { e.preventDefault(); const t = item.trim(); if (!t) return; setItem(''); setChecklist([...card.checklist, { text: t, done: false }]); }}>
              <input value={item} onChange={(e) => setItem(e.target.value)} maxLength={200} placeholder="+ Add an item" className="w-full bg-transparent text-sm py-1 outline-none" />
            </form>
          )}
        </section>
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Comments</p>
          {comments?.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Avatar name={c.user.name} src={c.user.avatar} size={28} />
              <div className="min-w-0 flex-1 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2">
                <p className="text-[11px] text-zinc-500">{c.user.name} · {new Date(c.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-sm text-zinc-900 dark:text-white whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            </div>
          ))}
          <form onSubmit={async (e) => { e.preventDefault(); const t = comment.trim(); if (!t) return; setComment(''); try { await call(ckey, 'POST', { body: t }); void mutate(); } catch (err) { setComment(t); toast.error((err as Error).message); } }} className="flex gap-2">
            <MentionInput kind="tasks" id={board.id} value={comment} onChange={setComment} maxLength={2000} placeholder="Write a comment (@name to notify someone)" aria-label="Comment" className="input" />
            <button type="submit" aria-label="Send" className="w-10 shrink-0 rounded-xl btn-primary flex items-center justify-center"><Send className="w-4 h-4" /></button>
          </form>
        </section>
      </div>
    </Sheet>
  );
}

function ShareSheet({ board, onClose, onChanged }: { board: Board; onClose: () => void; onChanged: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [busy, setBusy] = useState(false);
  const name = (uid: string) => board.people.find((p) => p.id === uid)?.name ?? 'Someone';
  return (
    <Sheet title="Share board" onClose={onClose}>
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await call(`/api/tasks/${board.id}/members`, 'POST', { email, role }); setEmail(''); toast.success('Shared'); onChanged(); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); } }} className="flex gap-2 mb-4">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" className="input" />
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as 'EDITOR' | 'VIEWER')} className={cn('input', 'w-28')}><option value="EDITOR">Can edit</option><option value="VIEWER">Can view</option></select>
        <button type="submit" disabled={busy} className="btn-primary shrink-0">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}</button>
      </form>
      <div className="space-y-1">
        {board.members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 p-2">
            <span className="flex-1 text-sm text-zinc-900 dark:text-white">{name(m.userId)} <span className="text-xs text-zinc-500">· {m.role === 'VIEWER' ? 'can view' : 'can edit'}</span></span>
            <button type="button" onClick={async () => { await call(`/api/tasks/${board.id}/members`, 'POST', { userId: m.userId, remove: true }).catch((e) => toast.error((e as Error).message)); onChanged(); }} aria-label="Stop sharing" className="p-1.5 text-zinc-400 hover:text-rose-500"><UserMinus className="w-4 h-4" /></button>
          </div>
        ))}
        {!board.members.length && <p className="text-sm text-zinc-500">Only you so far.</p>}
      </div>
    </Sheet>
  );
}
