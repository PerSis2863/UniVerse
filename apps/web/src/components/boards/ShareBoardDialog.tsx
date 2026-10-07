'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Copy, Globe2, Loader2, Lock, Search, UserPlus, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

export type BoardMeta = {
  id: string;
  title: string;
  linkAccess: 'NONE' | 'VIEW' | 'EDIT';
  owner: { id: string; name: string; avatar: string | null; role: string };
  members: { id: string; name: string; avatar: string | null; role: string; boardRole: 'EDITOR' | 'VIEWER' }[];
  myRole: 'OWNER' | 'EDITOR' | 'VIEWER';
  me: string;
};
type Person = { id: string; name: string; avatar: string | null; role: string };

const ROLE_LABEL: Record<string, string> = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Admin', NGO: 'NGO', STARTUP: 'Startup' };
const LINK_OPTIONS = [
  { value: 'NONE', label: 'Only people added here', icon: Lock },
  { value: 'VIEW', label: 'Anyone on UniVerse with the link can view', icon: Globe2 },
  { value: 'EDIT', label: 'Anyone on UniVerse with the link can edit', icon: Globe2 },
] as const;

/** Share a whiteboard with classmates, teachers or anyone on UniVerse, as editors or viewers. */
export function ShareBoardDialog({ board, onClose, onChanged }: { board: BoardMeta; onClose: () => void; onChanged: () => void }) {
  const owner = board.myRole === 'OWNER';
  const canInvite = board.myRole !== 'VIEWER';
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data: people, isLoading } = useSWR<Person[]>(canInvite ? `/api/chat/users?q=${encodeURIComponent(debounced)}` : null, authedJson);
  const inBoard = new Set([board.owner.id, ...board.members.map((m) => m.id)]);
  const link = typeof window !== 'undefined' ? `${location.origin}/boards/${board.id}` : '';

  const run = async (key: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await work();
      if (done) toast.success(done);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const add = (p: Person) =>
    run(`add:${p.id}`, () => authedJson(`/api/boards/${board.id}/members`, { method: 'POST', body: JSON.stringify({ userIds: [p.id], role }) }), `Shared with ${p.name}`);
  const change = (id: string, next: string) =>
    next === 'REMOVE'
      ? run(`m:${id}`, () => authedJson(`/api/boards/${board.id}/members?userId=${encodeURIComponent(id)}`, { method: 'DELETE' }), 'Removed')
      : run(`m:${id}`, () => authedJson(`/api/boards/${board.id}/members`, { method: 'POST', body: JSON.stringify({ userIds: [id], role: next }) }));
  const setLink = (linkAccess: string) =>
    run('link', () => authedJson(`/api/boards/${board.id}`, { method: 'PATCH', body: JSON.stringify({ linkAccess }) }), 'Link sharing updated');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Couldn’t copy. Select the link and copy it instead.');
    }
  };

  const select = 'h-8 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 px-2 text-xs text-zinc-700 dark:text-zinc-200';

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Share board" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Share “{board.title}”</h2>
            <p className="text-sm text-zinc-500 mt-0.5">Editors draw together with you live. Viewers watch.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
        </div>

        {canInvite && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <label className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search classmates, teachers or anyone" aria-label="Search people"
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/50 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
              </label>
              <select value={role} onChange={(e) => setRole(e.target.value as 'EDITOR' | 'VIEWER')} aria-label="Access for people you add" className={cn(select, 'h-10 rounded-xl text-sm')}>
                <option value="EDITOR">Can edit</option>
                <option value="VIEWER">Can view</option>
              </select>
            </div>
            <div className="max-h-52 overflow-y-auto -mx-2">
              {isLoading && <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-zinc-400" /></div>}
              {people?.filter((p) => !inBoard.has(p.id)).slice(0, 12).map((p) => (
                <button key={p.id} onClick={() => add(p)} disabled={!!busy} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.04] text-left disabled:opacity-60">
                  <Avatar name={p.name} src={p.avatar} size={32} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{p.name}</span>
                    <span className="block text-[11px] text-zinc-500">{ROLE_LABEL[p.role] ?? p.role}</span>
                  </span>
                  {busy === `add:${p.id}` ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> : <UserPlus className="w-4 h-4 text-indigo-500" />}
                </button>
              ))}
              {people && !isLoading && people.filter((p) => !inBoard.has(p.id)).length === 0 && <p className="px-2 py-3 text-sm text-zinc-500">No one found{debounced ? ` for “${debounced}”` : ''}.</p>}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">People with access</p>
          <div className="space-y-1">
            <div className="flex items-center gap-3 p-2">
              <Avatar name={board.owner.name} src={board.owner.avatar} size={32} />
              <span className="flex-1 text-sm font-medium text-zinc-900 dark:text-white truncate">{board.owner.id === board.me ? 'You' : board.owner.name}</span>
              <span className="text-xs text-zinc-500">Owner</span>
            </div>
            {board.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2">
                <Avatar name={m.name} src={m.avatar} size={32} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{m.id === board.me ? 'You' : m.name}</span>
                  <span className="block text-[11px] text-zinc-500">{ROLE_LABEL[m.role] ?? m.role}</span>
                </span>
                {owner ? (
                  <select value={m.boardRole} disabled={busy === `m:${m.id}`} onChange={(e) => change(m.id, e.target.value)} aria-label={`Access for ${m.name}`} className={select}>
                    <option value="EDITOR">Can edit</option>
                    <option value="VIEWER">Can view</option>
                    <option value="REMOVE">Remove</option>
                  </select>
                ) : <span className="text-xs text-zinc-500">{m.boardRole === 'EDITOR' ? 'Can edit' : 'Can view'}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Link</p>
          {owner ? (
            <select value={board.linkAccess} disabled={busy === 'link'} onChange={(e) => setLink(e.target.value)} aria-label="Who can open the link" className={cn(select, 'w-full h-10 rounded-xl text-sm')}>
              {LINK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{LINK_OPTIONS.find((o) => o.value === board.linkAccess)?.label}</p>
          )}
          <div className="flex gap-2">
            <input readOnly value={link} aria-label="Board link" onFocus={(e) => e.target.select()} className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/50 text-xs text-zinc-600 dark:text-zinc-300" />
            <button onClick={copy} className="btn-primary">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {board.linkAccess === 'NONE' && <p className="text-xs text-zinc-500">Only the people listed above can open this link.</p>}
        </div>
      </div>
    </div>
  );
}
