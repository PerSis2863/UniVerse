'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Ban, Bell, ChevronDown, Crown, Download, Loader2, LogOut, MessageSquare, Pencil, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { type Rec, type Schema, RecordEditor, SearchBox, card, errorMessage, fetcher, formatValue, matches, refreshConsole, summarize, toastWithUndo } from './shared';
import { ComposeDialog, LiveChat } from './chats';
import { TabPill } from '@/components/ui/Glide';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

interface Section { model: string; field: string; title: string; count: number; records: Rec[] }
interface Dossier { user: Rec & { owner?: boolean }; sections: Section[]; empty: string[] }
interface Convo { id: string; name: string | null; isGroup: boolean; updatedAt: string; participants: { user: { id: string; name: string; role: string } }[]; _count: { messages: number } }

const PROFILE_FIELDS = ['email', 'phone', 'role', 'status', 'accountType', 'dateOfBirth', 'createdAt', 'onboardedAt', 'lastSeenAt', 'updatedAt', 'termsVersion', 'termsAcceptedAt', 'chatMutedUntil', 'emailNotifications', 'impactXP', 'impactLevel', 'googleId', 'firebaseUid'];

export function PersonPanel({ id, schema, onBack }: { id: string; schema: Schema; onBack: () => void }) {
  const { data, isLoading, error } = useSWR<Dossier>(`/owner/people/${id}`, fetcher);
  const [editing, setEditing] = useState<{ model: string; record: Rec } | null>(null);
  const [chats, setChats] = useState(false);
  const [compose, setCompose] = useState<'message' | 'notify' | null>(null);
  const [saving, setSaving] = useState(false);
  const [shownAt] = useState(() => Date.now());
  const [q, setQ] = useState('');

  if (isLoading) return <div className="p-12"><ContentSkeleton variant="dashboard" /></div>;
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

  const ban = async (on: boolean) => {
    const name = String(u.name);
    if (on && !(await confirmDialog({ title: `Ban ${name}?`, message: "They're signed out straight away and can't sign in again until you let them back in. Everything they made stays.", confirmLabel: 'Ban', destructive: true }))) return;
    try {
      const { data: res } = await api.post(`/owner/people/${u.id}/ban`, { ban: on });
      toastWithUndo(on ? `${name} is banned` : `${name} can sign in again`, res.changeId);
      await refreshConsole();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const signOutEverywhere = async () => {
    const name = String(u.name);
    if (!(await confirmDialog({ title: `Sign ${name} out everywhere?`, message: 'Every phone, tablet and computer they are signed in on is signed out. They can sign in again straight away with their password or Google. Use this if their account may have been taken over.', confirmLabel: 'Sign out everywhere', destructive: true }))) return;
    try {
      await api.post(`/owner/people/${u.id}/sign-out`);
      toast.success(`${name} is signed out on every device`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const purge = async () => {
    const email = String(u.email);
    const typed = await promptDialog({
      title: `Delete ${String(u.name)} permanently?`,
      message: `Their account and everything that's only theirs is removed. This can't be undone. To keep them out but keep their data, use Ban instead. Type ${email} to confirm.`,
      placeholder: email,
      confirmLabel: 'Delete forever',
    });
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== email.toLowerCase()) return void toast.error("The email didn't match, so nothing was deleted.");
    try {
      const { data: res } = await api.delete(`/owner/people/${u.id}?confirm=${encodeURIComponent(typed.trim())}`);
      toast.success(res.how === 'erased' ? `${String(u.name)} was deleted. Their name now shows as “Deleted user” where others still need the record.` : `${String(u.name)} was deleted.`);
      onBack();
      await refreshConsole();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const mutedUntil = u.chatMutedUntil ? new Date(String(u.chatMutedUntil)) : null;
  const muted = !!mutedUntil && mutedUntil.getTime() > shownAt;
  const mute = async (hours: number) => {
    try {
      const { data: res } = await api.post(`/owner/people/${u.id}/mute`, { hours });
      toastWithUndo(hours === 0 ? `${String(u.name)} can send messages again` : `${String(u.name)} is muted in chat`, res.changeId);
      await refreshConsole();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const send = async (path: string, payload: unknown, done: string) => {
    try {
      await api.post(`/owner/people/${u.id}/${path}`, payload);
      toast.success(done);
      void refreshConsole();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  const download = async () => {
    setSaving(true);
    try {
      const { data: all } = await api.get(`/owner/people/${u.id}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ ...all, records: data.sections }, null, 2)], { type: 'application/json' }));
      const slug = String(u.name ?? 'person').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person';
      Object.assign(document.createElement('a'), { href: url, download: `${slug}-${new Date().toISOString().slice(0, 10)}.json` }).click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
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
            <button onClick={() => setEditing({ model: 'User', record: u })} className="btn-secondary"><Pencil className="w-4 h-4" /> Edit all</button>
            <button onClick={() => setChats(true)} className="btn-primary"><MessageSquare className="w-4 h-4" /> Messages & calls</button>
            {!u.owner && (
              <select aria-label="Chat mute" value="" onChange={(e) => e.target.value && void mute(Number(e.target.value))}
                className={cn('rounded-xl border px-3 py-2 text-sm', muted ? 'border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10' : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900')}>
                <option value="">{muted ? `Muted in chat until ${mutedUntil!.getFullYear() > new Date(shownAt).getFullYear() + 1 ? 'lifted' : format(mutedUntil!, 'd MMM, HH:mm')}` : 'Mute in chat…'}</option>
                <option value="1">Mute for 1 hour</option>
                <option value="24">Mute for 1 day</option>
                <option value="168">Mute for 1 week</option>
                <option value="-1">Mute until I lift it</option>
                {muted && <option value="0">Unmute now</option>}
              </select>
            )}
            <button onClick={() => setCompose('message')} className="btn-secondary"><Send className="w-4 h-4" /> Message as UniVerse</button>
            <button onClick={() => setCompose('notify')} className="btn-secondary"><Bell className="w-4 h-4" /> Notify</button>
            <button onClick={() => void download()} disabled={saving} aria-busy={saving || undefined} className="btn-secondary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download data</button>
            <button onClick={() => void signOutEverywhere()} className="btn-secondary"><LogOut className="w-4 h-4" /> Sign out everywhere</button>
            {!u.owner && (u.status === 'SUSPENDED' ? (
              <button onClick={() => void ban(false)} className="btn-secondary !text-emerald-600 dark:!text-emerald-400 !border-emerald-500/30"><ShieldCheck className="w-4 h-4" /> Let back in</button>
            ) : (
              <button onClick={() => void ban(true)} className="btn-secondary !text-amber-600 dark:!text-amber-400 !border-amber-500/30"><Ban className="w-4 h-4" /> Ban</button>
            ))}
            {!u.owner && <button onClick={() => void purge()} className="btn-secondary !text-rose-600 dark:!text-rose-400 !border-rose-500/30"><Trash2 className="w-4 h-4" /> Delete permanently</button>}
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
      {chats && <Conversations personId={u.id} personName={String(u.name)} onClose={() => setChats(false)} />}
      {compose === 'message' && (
        <ComposeDialog title={`Message ${String(u.name)}`} confirm="Send"
          hint="Sent from the official UniVerse Impact account, in their chat with it. They can reply there and you’ll see it in Live chats."
          onSend={(v) => send('message', { body: v.body }, 'Message sent from UniVerse Impact')} onClose={() => setCompose(null)} />
      )}
      {compose === 'notify' && (
        <ComposeDialog title={`Notify ${String(u.name)}`} confirm="Send" withTitle withEmail
          hint="Shows in their notifications (the bell). Tick the box to email them a copy too."
          onSend={(v) => send('notify', v, 'Notification sent')} onClose={() => setCompose(null)} />
      )}
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

function Conversations({ personId, personName, onClose }: { personId: string; personName: string; onClose: () => void }) {
  const { data: convos, isLoading } = useSWR<Convo[]>(`/owner/people/${personId}/conversations`, fetcher);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Messages and calls">
      <div className="w-full sm:max-w-4xl h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-white/[0.06]">
          <h2 className="font-bold text-zinc-900 dark:text-white">{personName}: messages & calls</h2>
          <button onClick={onClose} className="text-sm text-zinc-500">Close</button>
        </div>
        <div className="flex-1 grid md:grid-cols-[260px_1fr] min-h-0">
          <ul className={cn('overflow-y-auto border-r border-zinc-100 dark:border-white/[0.06]', open && 'hidden md:block')}>
            {isLoading ? <li className="p-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></li> : !convos?.length ? <li className="p-6 text-sm text-zinc-500">No conversations.</li> : convos.map((c) => (
              <li key={c.id}>
                <button onClick={() => setOpen(c.id)} className={cn('relative isolate w-full text-left p-3 hover:bg-zinc-50 dark:hover:bg-white/[0.03]', open === c.id && '')}>{open === c.id && <TabPill id="app-dashboard-console-person-0" variant="soft" />}
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{c.isGroup ? c.name ?? 'Group' : c.participants.map((p) => p.user.name).filter((n) => n !== personName).join(', ') || 'Chat'}</p>
                  <p className="text-xs text-zinc-500">{c._count.messages} messages · {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}</p>
                </button>
              </li>
            ))}
          </ul>
          <div className={cn('min-h-0', !open && 'hidden md:block')}>
            {open ? <LiveChat key={open} id={open} onBack={() => setOpen(null)} /> : <p className="p-10 text-center text-sm text-zinc-500">Choose a conversation.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
