'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowLeft, ChevronDown, Crown, Loader2, MessageSquare, Paperclip, Pencil, Phone, Trash2, Video } from 'lucide-react';
import { api } from '@/lib/api';
import { safeHref } from '@/lib/safe-href';
import { cn } from '@/lib/utils';
import { type Rec, type Schema, RecordEditor, SearchBox, card, errorMessage, fetcher, formatValue, matches, refreshConsole, summarize, toastWithUndo } from './shared';

interface Section { model: string; field: string; title: string; count: number; records: Rec[] }
interface Dossier { user: Rec & { owner?: boolean }; sections: Section[]; empty: string[] }
interface Convo { id: string; name: string | null; isGroup: boolean; updatedAt: string; participants: { user: { id: string; name: string; role: string } }[]; _count: { messages: number } }

const PROFILE_FIELDS = ['email', 'phone', 'role', 'status', 'dateOfBirth', 'createdAt', 'lastSeenAt', 'emailNotifications', 'impactXP', 'impactLevel', 'googleId', 'firebaseUid'];

export function PersonPanel({ id, schema, onBack }: { id: string; schema: Schema; onBack: () => void }) {
  const { data, isLoading, error } = useSWR<Dossier>(`/owner/people/${id}`, fetcher);
  const [editing, setEditing] = useState<{ model: string; record: Rec } | null>(null);
  const [chats, setChats] = useState(false);
  const [q, setQ] = useState('');

  if (isLoading) return <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>;
  if (error || !data) return <p className="p-12 text-center text-sm text-rose-500">Could not load this person.</p>;
  const u = data.user;

  const quick = async (patch: Record<string, unknown>, label: string) => {
    try {
      const { data: res } = await api.patch(`/owner/records/User/${u.id}`, { data: patch });
      toastWithUndo(label, res.changeId);
      await refreshConsole();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-zinc-500"><ArrowLeft className="w-4 h-4" /> Back</button>

      <div className={cn(card, 'p-5 sm:p-6')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4 min-w-0">
            <div className="w-14 h-14 shrink-0 rounded-full bg-indigo-500/10 flex items-center justify-center text-xl font-bold text-indigo-500">{String(u.name ?? '?').charAt(0)}</div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">{String(u.name)} {u.owner && <Crown className="w-4 h-4 text-amber-500" aria-label="Owner" />}</h2>
              <p className="text-sm text-zinc-500 break-all">{String(u.email)}</p>
              <p className="text-xs text-zinc-400 mt-1">
                Joined {format(new Date(String(u.createdAt)), 'd MMM yyyy')}
                {u.lastSeenAt ? ` · last active ${formatDistanceToNow(new Date(String(u.lastSeenAt)), { addSuffix: true })}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Role" disabled={u.owner} className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 px-3 py-2 text-sm" value={String(u.role)} onChange={(e) => quick({ role: e.target.value }, `Role set to ${e.target.value}`)}>
              {(schema.enums.Role ?? []).map((r) => <option key={r}>{r}</option>)}
            </select>
            <select aria-label="Status" disabled={u.owner} className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 px-3 py-2 text-sm" value={String(u.status)} onChange={(e) => quick({ status: e.target.value }, `Status set to ${e.target.value}`)}>
              {(schema.enums.UserStatus ?? []).map((r) => <option key={r}>{r}</option>)}
            </select>
            <button onClick={() => setEditing({ model: 'User', record: u })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-200"><Pencil className="w-4 h-4" /> Edit all</button>
            <button onClick={() => setChats(true)} className="btn-primary"><MessageSquare className="w-4 h-4" /> Messages & calls</button>
          </div>
        </div>
        <dl className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          {PROFILE_FIELDS.map((k) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-zinc-500">{k}</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{formatValue(u[k])}</dd>
            </div>
          ))}
          <div className="sm:col-span-2 lg:col-span-3 min-w-0">
            <dt className="text-xs text-zinc-500">emergencyContacts</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{formatValue(u.emergencyContacts)}</dd>
          </div>
        </dl>
      </div>

      <SearchBox value={q} onChange={setQ} placeholder={`Search everything about ${String(u.name)}`} />
      {data.sections
        .map((s) => (q ? { ...s, records: s.records.filter((r) => matches(q, s.title, ...Object.values(r))) } : s))
        .filter((s) => !q || s.records.length > 0)
        .map((s) => <SectionBlock key={`${s.model}-${s.field}-${q ? 'q' : ''}`} s={q ? { ...s, count: s.records.length } : s} forceOpen={!!q} onEdit={(record) => setEditing({ model: s.model, record })} />)}
      {q && data.sections.every((s) => !s.records.some((r) => matches(q, s.title, ...Object.values(r)))) && <p className="text-sm text-zinc-500">Nothing about this person matches “{q}”.</p>}
      {data.empty.length > 0 && <p className="text-xs text-zinc-400">Nothing in: {data.empty.join(', ')}.</p>}

      {editing && <RecordEditor model={editing.model} record={editing.record} schema={schema} onClose={() => setEditing(null)} />}
      {chats && <Conversations personId={u.id} personName={String(u.name)} schema={schema} onClose={() => setChats(false)} />}
    </div>
  );
}

function SectionBlock({ s, onEdit, forceOpen }: { s: Section; onEdit: (r: Rec) => void; forceOpen?: boolean }) {
  const [open, setOpen] = useState(forceOpen || s.count <= 5);
  const editable = s.model !== 'AuditLog';
  return (
    <div className={card}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <span className="font-semibold text-zinc-900 dark:text-white">{s.title} <span className="text-zinc-400 font-normal">· {s.count}</span></span>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05] border-t border-zinc-100 dark:border-white/[0.05]">
          {s.records.map((r) => (
            <li key={r.id} className="p-4 flex gap-3 items-start">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-900 dark:text-white break-words">{summarize(r)}</p>
                <p className="text-xs text-zinc-500 mt-0.5 break-words">
                  {Object.entries(r)
                    .filter(([k, v]) => !['id', 'userId', 'studentId', 'authorId', 'body', 'name', 'title', 'subject', 'summary'].includes(k) && v !== null && v !== '' && typeof v !== 'object')
                    .slice(0, 6)
                    .map(([k, v]) => `${k}: ${typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? format(new Date(v), 'd MMM yyyy HH:mm') : String(v).slice(0, 40)}`)
                    .join(' · ')}
                </p>
              </div>
              {editable && <button onClick={() => onEdit(r)} aria-label="Edit" className="text-zinc-400 hover:text-indigo-500 shrink-0"><Pencil className="w-4 h-4" /></button>}
            </li>
          ))}
          {s.count > s.records.length && <li className="p-3 text-xs text-zinc-500">Showing the latest {s.records.length} of {s.count}. See all in Data → {s.model}.</li>}
        </ul>
      )}
    </div>
  );
}

function Conversations({ personId, personName, schema, onClose }: { personId: string; personName: string; schema: Schema; onClose: () => void }) {
  const { data: convos, isLoading } = useSWR<Convo[]>(`/owner/people/${personId}/conversations`, fetcher);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Messages and calls">
      <div className="w-full sm:max-w-4xl h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-white/[0.06]">
          <h2 className="font-bold text-zinc-900 dark:text-white">{personName}: messages & calls</h2>
          <button onClick={onClose} className="text-sm text-zinc-500">Close</button>
        </div>
        <div className="flex-1 grid md:grid-cols-[260px_1fr] min-h-0">
          <ul className={cn('overflow-y-auto border-r border-zinc-100 dark:border-white/[0.06]', open && 'hidden md:block')}>
            {isLoading ? <li className="p-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></li> : !convos?.length ? <li className="p-6 text-sm text-zinc-500">No conversations.</li> : convos.map((c) => (
              <li key={c.id}>
                <button onClick={() => setOpen(c.id)} className={cn('w-full text-left p-3 hover:bg-zinc-50 dark:hover:bg-white/[0.03]', open === c.id && 'bg-indigo-500/[0.07]')}>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{c.isGroup ? c.name ?? 'Group' : c.participants.map((p) => p.user.name).filter((n) => n !== personName).join(', ') || 'Chat'}</p>
                  <p className="text-xs text-zinc-500">{c._count.messages} messages · {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}</p>
                </button>
              </li>
            ))}
          </ul>
          <div className={cn('min-h-0', !open && 'hidden md:block')}>
            {open ? <Thread id={open} schema={schema} onBack={() => setOpen(null)} /> : <p className="p-10 text-center text-sm text-zinc-500">Choose a conversation.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Thread({ id, schema, onBack }: { id: string; schema: Schema; onBack: () => void }) {
  const { data, isLoading } = useSWR<{ conversation: { name: string | null; isGroup: boolean; participants: { user: { id: string; name: string } }[] }; messages: (Rec & { sender: { id: string; name: string } | null })[] }>(`/owner/conversations/${id}/messages`, fetcher);
  const [editing, setEditing] = useState<Rec | null>(null);
  const del = async (m: Rec) => {
    try {
      const { data: res } = await api.delete(`/owner/records/Message/${m.id}`);
      toastWithUndo('Message deleted', res.changeId);
      await refreshConsole();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  if (isLoading || !data) return <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>;
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-zinc-100 dark:border-white/[0.06] flex items-center gap-2">
        <button onClick={onBack} className="md:hidden text-zinc-500"><ArrowLeft className="w-4 h-4" /></button>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{data.conversation.participants.map((p) => p.user.name).join(', ')}</p>
      </div>
      <ol className="flex-1 overflow-y-auto p-4 space-y-3">
        {data.messages.length === 0 && <li className="text-sm text-zinc-500">No messages.</li>}
        {data.messages.map((m) => {
          const meta = (m.metadata ?? {}) as { kind?: string; url?: string };
          return (
            <li key={m.id} className={cn('group rounded-xl p-3 bg-zinc-50 dark:bg-white/[0.03]', m.deletedAt ? 'opacity-60' : '')}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-indigo-500">{m.sender?.name ?? 'System'} <span className="text-zinc-400 font-normal">· {format(new Date(String(m.createdAt)), 'd MMM yyyy, HH:mm')}{m.editedAt ? ' · edited' : ''}{m.deletedAt ? ' · deleted by user' : ''}</span></p>
                <span className="opacity-0 group-hover:opacity-100 flex gap-2">
                  <button onClick={() => setEditing(m)} aria-label="Edit message" className="text-zinc-400 hover:text-indigo-500"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => void del(m)} aria-label="Delete message" className="text-zinc-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </span>
              </div>
              {m.type === 'CALL' ? (
                <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5">{meta.kind === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />} {String(m.body)} {meta.url && <a href={safeHref(meta.url)} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500">room</a>}</p>
              ) : (
                <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">{String(m.body ?? '')}</p>
              )}
              {!!m.attachmentUrl && <a href={safeHref(String(m.attachmentUrl))} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-500"><Paperclip className="w-3 h-3" />{String(m.attachmentName ?? 'attachment')}</a>}
              {m.type !== 'TEXT' && m.type !== 'CALL' && <p className="mt-1 text-[11px] text-zinc-400">{String(m.type)}</p>}
            </li>
          );
        })}
      </ol>
      {editing && <RecordEditor model="Message" record={editing} schema={schema} onClose={() => setEditing(null)} />}
    </div>
  );
}
