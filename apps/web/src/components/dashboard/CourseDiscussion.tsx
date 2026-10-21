'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatDistanceStrict } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft, Award, CheckCircle2, ChevronUp, HelpCircle, Loader2, Lock, MessageSquare, MessagesSquare, Pencil, Pin, Plus, Sparkles, Trash2, Unlock,
} from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/use-now';
import { Avatar } from '@/components/ui/Avatar';
import { Segmented } from '@/components/ui/Segmented';
import { SearchField } from '@/components/ui/Field';
import { confirmDialog } from '@/components/ui/Dialogs';

// The course's discussion board (Stage 5 · B2, src/server/course-discussion.ts): ask a question or
// start a discussion, reply, upvote, mark the answer; the teacher endorses, pins, locks and can get
// an AI draft answer from the course's materials. Live: changes refresh it for everyone in a thread.

interface Author { id: string | null; name: string; avatar: string | null; staff: boolean; mine: boolean; anonymous: boolean }
interface ThreadRow { id: string; kind: 'QUESTION' | 'DISCUSSION'; title: string; excerpt: string; pinned: boolean; locked: boolean; answered: boolean; endorsed: boolean; votes: number; replies: number; voted: boolean; author: Author; createdAt: string; lastActivityAt: string }
interface ListData { canManage: boolean; threads: ThreadRow[] }
interface Reply { id: string; body: string; votes: number; voted: boolean; endorsed: boolean; accepted: boolean; editedAt: string | null; createdAt: string; author: Author; canEdit: boolean; canDelete: boolean }
interface ThreadData {
  canManage: boolean;
  thread: { id: string; kind: 'QUESTION' | 'DISCUSSION'; title: string; body: string; pinned: boolean; locked: boolean; answered: boolean; votes: number; voted: boolean; editedAt: string | null; createdAt: string; author: Author; canEdit: boolean; canDelete: boolean; canAccept: boolean; canReply: boolean };
  replies: Reply[];
}

type Filter = 'all' | 'unanswered' | 'mine';
type ThreadKind = 'QUESTION' | 'DISCUSSION';

function useAgo() {
  const now = useNow();
  return (iso: string) => (now ? `${formatDistanceStrict(new Date(iso), now)} ago` : new Date(iso).toLocaleDateString());
}

function Who({ a, size = 28 }: { a: Author; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Avatar name={a.anonymous && !a.id ? '?' : a.name} src={a.avatar} size={size} />
      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">{a.mine ? 'You' : a.name}</span>
      {a.staff && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">Teacher</span>}
      {a.anonymous && a.id && <span className="text-[11px] text-zinc-600 dark:text-zinc-400">(hidden from classmates)</span>}
    </span>
  );
}

function Upvote({ votes, voted, disabled, onClick, label }: { votes: number; voted: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={voted} aria-label={`${label}: ${votes} upvote${votes === 1 ? '' : 's'}`}
      className={cn('flex flex-col items-center justify-center w-11 h-12 rounded-xl border text-xs font-bold tabular-nums shrink-0 transition-colors disabled:opacity-60',
        voted ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 hover:border-indigo-400')}>
      <ChevronUp className="w-4 h-4" aria-hidden />{votes}
    </button>
  );
}

export function CourseDiscussion({ courseId, openId, onOpen }: { courseId: string; openId: string | null; onOpen: (id: string | null) => void }) {
  return openId
    ? <ThreadView key={openId} courseId={courseId} threadId={openId} onBack={() => onOpen(null)} />
    : <ThreadList courseId={courseId} onOpen={onOpen} />;
}

function ThreadList({ courseId, onOpen }: { courseId: string; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [writing, setWriting] = useState(false);
  const key = `/api/courses/${courseId}/discussion?filter=${filter}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<ListData>(key, authedJson, { keepPreviousData: true });
  const ago = useAgo();

  return (
    <section aria-labelledby="discussion-title">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="discussion-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><MessagesSquare className="w-4 h-4 text-indigo-500" /> Discussion</h2>
        {!writing && <button type="button" onClick={() => setWriting(true)} className="btn-primary text-xs py-2"><Plus className="w-3.5 h-3.5" /> New post</button>}
      </div>
      {writing && <NewThread courseId={courseId} canManage={!!data?.canManage} onCancel={() => setWriting(false)} onDone={(id) => { setWriting(false); void mutate(); onOpen(id); }} />}
      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <Segmented<Filter> label="Show" value={filter} onChange={setFilter} segments={[{ value: 'all', label: 'All' }, { value: 'unanswered', label: 'Unanswered' }, { value: 'mine', label: 'Mine' }]} />
        <SearchField value={q} onChange={setQ} placeholder="Search the discussion" className="flex-1" />
      </div>
      <div className="mt-4 space-y-2">
        {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'The discussion couldn’t load.')}</p>
          : isLoading && !data ? [0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)
          : !data?.threads.length ? (
            <div className="text-center py-10 rounded-2xl border border-dashed border-zinc-300 dark:border-white/10">
              <MessageSquare className="w-8 h-8 mx-auto text-zinc-400" aria-hidden />
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{q.trim() || filter !== 'all' ? 'Nothing matches.' : 'No posts yet. Ask the first question: others probably wonder too.'}</p>
            </div>
          ) : data.threads.map((t) => (
            <button key={t.id} type="button" onClick={() => onOpen(t.id)} className="w-full text-start flex gap-3 p-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] hover:border-indigo-400/60 transition-colors">
              <span className="flex flex-col items-center justify-center w-11 shrink-0 text-xs font-bold tabular-nums text-zinc-700 dark:text-zinc-200" aria-label={`${t.votes} upvotes`}><ChevronUp className="w-4 h-4" aria-hidden />{t.votes}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.pinned && <Pin className="w-3.5 h-3.5 text-amber-600" aria-label="Pinned" />}
                  {t.locked && <Lock className="w-3.5 h-3.5 text-zinc-500" aria-label="Closed" />}
                  <span className="font-semibold text-zinc-900 dark:text-white break-words">{t.title}</span>
                </span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 break-words">{t.excerpt}</span>
                <span className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-zinc-600 dark:text-zinc-400">
                  <span className={cn('px-1.5 py-0.5 rounded font-semibold', t.kind === 'QUESTION' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-violet-500/10 text-violet-700 dark:text-violet-300')}>{t.kind === 'QUESTION' ? 'Question' : 'Discussion'}</span>
                  {t.answered && <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Answered</span>}
                  {t.endorsed && <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300"><Award className="w-3 h-3" /> Teacher endorsed</span>}
                  <span>{t.replies} repl{t.replies === 1 ? 'y' : 'ies'}</span>
                  <span>·</span>
                  <span>{t.author.mine ? 'You' : t.author.name}, {ago(t.lastActivityAt)}</span>
                </span>
              </span>
            </button>
          ))}
      </div>
    </section>
  );
}

function NewThread({ courseId, canManage, onCancel, onDone }: { courseId: string; canManage: boolean; onCancel: () => void; onDone: (id: string) => void }) {
  const [kind, setKind] = useState<ThreadKind>('QUESTION');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await authedJson<{ id: string }>(`/api/courses/${courseId}/discussion`, { method: 'POST', body: JSON.stringify({ kind, title, body, anonymous }) });
      onDone(id);
    } catch (err) {
      toast.error(errorMessage(err, 'Your post couldn’t be sent.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-4 p-4 rounded-2xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-500/[0.05] space-y-3">
      <Segmented<ThreadKind> label="Kind of post" value={kind} onChange={setKind} segments={[{ value: 'QUESTION', label: 'Question', icon: <HelpCircle className="w-3.5 h-3.5" /> }, { value: 'DISCUSSION', label: 'Discussion', icon: <MessagesSquare className="w-3.5 h-3.5" /> }]} />
      <div>
        <label htmlFor="thread-title" className="label">Title</label>
        <input id="thread-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required minLength={3} className="input" placeholder={kind === 'QUESTION' ? 'What do you want to know?' : 'What do you want to talk about?'} />
      </div>
      <div>
        <label htmlFor="thread-body" className="label">Details</label>
        <textarea id="thread-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required rows={4} className="input" />
      </div>
      {!canManage && (
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Hide my name from classmates (your teacher still sees it)
        </label>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
        <button type="submit" disabled={busy} className="btn-primary text-sm">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Post</button>
      </div>
    </form>
  );
}

function ThreadView({ courseId, threadId, onBack }: { courseId: string; threadId: string; onBack: () => void }) {
  const url = `/api/courses/${courseId}/discussion/${threadId}`;
  const { data, error, mutate } = useSWR<ThreadData>(url, authedJson);
  const [reply, setReply] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [sources, setSources] = useState<{ n: number; title: string }[] | null>(null);
  const [editing, setEditing] = useState<{ target: string; title?: string; body: string } | null>(null);
  const ago = useAgo();

  const act = async (action: string, extra: Record<string, unknown> = {}, label = action) => {
    setBusy(label);
    try {
      const out = await authedJson<{ deleted?: string }>(url, { method: 'POST', body: JSON.stringify({ action, ...extra }) });
      if (out.deleted === 'thread') { toast.success('Post deleted'); onBack(); return true; }
      await mutate();
      return true;
    } catch (e) {
      toast.error(errorMessage(e, 'That didn’t work. Try again.'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const draft = async () => {
    setDrafting(true);
    try {
      const out = await authedJson<{ draft: string | null; message?: string; sources?: { n: number; title: string }[]; grounded?: boolean }>(`${url}/suggest`, { method: 'POST', body: '{}' });
      if (!out.draft) return void toast.error(out.message ?? 'No draft this time.');
      setReply(out.draft);
      setSources(out.sources ?? []);
      if (out.grounded === false) toast('The materials don’t fully cover this: check the draft carefully.');
    } catch (e) {
      toast.error(errorMessage(e, 'The AI couldn’t draft an answer this time.'));
    } finally {
      setDrafting(false);
    }
  };

  if (error) return <div><BackButton onBack={onBack} /><p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'This post couldn’t load.')}</p></div>;
  if (!data) return <div><BackButton onBack={onBack} /><div className="mt-4 h-40 rounded-2xl skeleton" /></div>;
  const { thread: t, replies, canManage } = data;

  return (
    <article aria-labelledby="thread-title-h">
      <BackButton onBack={onBack} />
      <div className="mt-3 flex gap-3">
        <Upvote votes={t.votes} voted={t.voted} disabled={t.author.mine || busy === 'vote-thread'} onClick={() => void act('vote', {}, 'vote-thread')} label="Upvote this post" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[11px] px-1.5 py-0.5 rounded font-semibold', t.kind === 'QUESTION' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-violet-500/10 text-violet-700 dark:text-violet-300')}>{t.kind === 'QUESTION' ? 'Question' : 'Discussion'}</span>
            {t.answered && <span className="text-[11px] inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Answered</span>}
            {t.pinned && <span className="text-[11px] inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400"><Pin className="w-3 h-3" /> Pinned</span>}
            {t.locked && <span className="text-[11px] inline-flex items-center gap-1 font-semibold text-zinc-600 dark:text-zinc-400"><Lock className="w-3 h-3" /> Closed to replies</span>}
          </div>
          {editing?.target === t.id ? (
            <EditBox value={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={async () => { if (await act('edit', { target: t.id, title: editing.title, body: editing.body }, 'edit')) setEditing(null); }} withTitle />
          ) : (
            <>
              <h2 id="thread-title-h" className="mt-1 text-lg font-bold text-zinc-900 dark:text-white break-words">{t.title}</h2>
              <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">{t.body}</p>
            </>
          )}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <Who a={t.author} />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{ago(t.createdAt)}{t.editedAt ? ' · edited' : ''}</span>
          </div>
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {t.canEdit && !editing && <SmallBtn icon={Pencil} label="Edit" onClick={() => setEditing({ target: t.id, title: t.title, body: t.body })} />}
            {canManage && <SmallBtn icon={Pin} label={t.pinned ? 'Unpin' : 'Pin'} onClick={() => void act('pin', { on: !t.pinned })} />}
            {canManage && <SmallBtn icon={t.locked ? Unlock : Lock} label={t.locked ? 'Open to replies' : 'Close to replies'} onClick={() => void act('lock', { on: !t.locked })} />}
            {t.canDelete && <SmallBtn icon={Trash2} label="Delete" danger onClick={async () => { if (await confirmDialog({ title: 'Delete this post?', message: 'Its replies go too.', confirmLabel: 'Delete', destructive: true })) void act('delete', { target: t.id }); }} />}
          </div>
        </div>
      </div>

      <h3 className="mt-6 text-sm font-bold text-zinc-900 dark:text-white">{replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</h3>
      <ul className="mt-2 space-y-2">
        {replies.map((r) => (
          <li key={r.id} className={cn('flex gap-3 p-3 rounded-2xl border', r.accepted ? 'border-emerald-400/60 bg-emerald-50/60 dark:bg-emerald-500/[0.06]' : 'border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.03]')}>
            <Upvote votes={r.votes} voted={r.voted} disabled={r.author.mine || busy === `vote-${r.id}`} onClick={() => void act('vote', { target: r.id }, `vote-${r.id}`)} label="Upvote this reply" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {r.accepted && <span className="text-[11px] inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-3 h-3" /> The answer</span>}
                {r.endorsed && <span className="text-[11px] inline-flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300"><Award className="w-3 h-3" /> Endorsed by the teacher</span>}
              </div>
              {editing?.target === r.id ? (
                <EditBox value={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={async () => { if (await act('edit', { target: r.id, body: editing.body }, 'edit')) setEditing(null); }} />
              ) : <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">{r.body}</p>}
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <Who a={r.author} size={24} />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{ago(r.createdAt)}{r.editedAt ? ' · edited' : ''}</span>
              </div>
              <div className="mt-1.5 flex gap-1.5 flex-wrap">
                {t.canAccept && <SmallBtn icon={CheckCircle2} label={r.accepted ? 'Not the answer' : 'Mark as the answer'} onClick={() => void act('accept', { post: r.accepted ? null : r.id })} />}
                {canManage && <SmallBtn icon={Award} label={r.endorsed ? 'Remove endorsement' : 'Endorse'} onClick={() => void act('endorse', { post: r.id, on: !r.endorsed })} />}
                {r.canEdit && !editing && <SmallBtn icon={Pencil} label="Edit" onClick={() => setEditing({ target: r.id, body: r.body })} />}
                {r.canDelete && <SmallBtn icon={Trash2} label="Delete" danger onClick={async () => { if (await confirmDialog({ title: 'Delete this reply?', confirmLabel: 'Delete', destructive: true })) void act('delete', { target: r.id }); }} />}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {t.canReply ? (
        <form className="mt-4 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await act('reply', { body: reply, anonymous }, 'reply')) { setReply(''); setSources(null); } }}>
          <label htmlFor="reply-body" className="label">Your reply</label>
          <textarea id="reply-body" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} rows={4} className="input" required />
          {sources && sources.length > 0 && <p className="text-xs text-zinc-600 dark:text-zinc-400">AI draft from: {sources.map((s) => `[${s.n}] ${s.title}`).join(', ')}. Check it before you post.</p>}
          <div className="flex items-center gap-2 flex-wrap justify-between">
            {canManage ? (
              <button type="button" onClick={() => void draft()} disabled={drafting} className="btn-secondary text-xs py-2">
                {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Draft an answer with AI
              </button>
            ) : (
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Hide my name from classmates
              </label>
            )}
            <button type="submit" disabled={busy === 'reply' || !reply.trim()} className="btn-primary text-sm">{busy === 'reply' && <Loader2 className="w-4 h-4 animate-spin" />} Reply</button>
          </div>
        </form>
      ) : <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5"><Lock className="w-4 h-4" /> The teacher closed this post to new replies.</p>}
    </article>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return <button type="button" onClick={onBack} className="text-sm font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> All posts</button>;
}

function SmallBtn({ icon: Icon, label, onClick, danger }: { icon: typeof Pin; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('text-xs font-semibold px-2 py-1 rounded-lg inline-flex items-center gap-1 transition-colors', danger ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10')}>
      <Icon className="w-3.5 h-3.5" aria-hidden /> {label}
    </button>
  );
}

function EditBox({ value, onChange, onCancel, onSave, withTitle }: { value: { target: string; title?: string; body: string }; onChange: (v: { target: string; title?: string; body: string }) => void; onCancel: () => void; onSave: () => void; withTitle?: boolean }) {
  return (
    <div className="mt-2 space-y-2">
      {withTitle && <input aria-label="Title" value={value.title ?? ''} onChange={(e) => onChange({ ...value, title: e.target.value })} maxLength={150} className="input" />}
      <textarea aria-label="Text" value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} maxLength={5000} rows={4} className="input" />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary text-xs py-1.5">Cancel</button>
        <button type="button" onClick={onSave} className="btn-primary text-xs py-1.5">Save</button>
      </div>
    </div>
  );
}
