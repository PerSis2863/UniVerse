'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Hash, Headphones, Loader2, Lock, Megaphone, Plus, Settings2, Tag, Trash2, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Switch } from '@/components/ui/Switch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { ROLE_COLORS } from '@/lib/community-roles';
import { cn } from '@/lib/utils';
import { chatJson } from './chat-client';

// A community's own roles and channel permissions (Stage 5 · B7.4; src/server/communities.ts):
// moderators make roles with a colour and give them to members, give channels a category, make
// them private to chosen roles, and choose which roles may post in announcements.

export interface CommunityRole { id: string; name: string; color: string; position: number }
export interface ManagedChannel { id: string; name: string; kind: 'TEXT' | 'ANNOUNCE' | 'VOICE'; category: string | null; private: boolean; slowModeSec: number; rules: { view: string[]; post: string[] } }

const errorOf = (e: unknown) => (e as Error).message || 'Couldn’t save that.';

/** A role as a coloured chip. */
export function RoleChip({ role, className }: { role: CommunityRole; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold border', className)} style={{ color: role.color, borderColor: `${role.color}55`, background: `${role.color}14` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: role.color }} aria-hidden />{role.name}
    </span>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
      {ROLE_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={`Colour ${c}`} onClick={() => onChange(c)}
          className={cn('w-7 h-7 rounded-full grid place-items-center ring-offset-2 ring-offset-white dark:ring-offset-[#11212d]', value === c && 'ring-2 ring-zinc-900 dark:ring-white')} style={{ background: c }}>
          {value === c && <Check className="w-3.5 h-3.5 text-white" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

/** Moderators: the community's roles. */
export function RolesSection({ communityId, roles, counts, onChanged }: { communityId: string; roles: CommunityRole[]; counts: Record<string, number>; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(ROLE_COLORS[0]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>, ok: string, key: string) => {
    setBusy(key);
    try { await chatJson(`/api/chat/communities/${communityId}`, { method: 'POST', body: JSON.stringify(body) }); toast.success(ok); onChanged(); return true; }
    catch (e) { toast.error(errorOf(e)); return false; }
    finally { setBusy(null); }
  };
  return (
    <section className="space-y-2" aria-labelledby={`roles-${communityId}`}>
      <div className="flex items-center justify-between">
        <p id={`roles-${communityId}`} className="text-xs font-semibold text-zinc-500">Roles</p>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-xs font-semibold text-indigo-500 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" />New role</button>
      </div>
      {roles.length === 0 && !open && <p className="text-xs text-zinc-500">Roles like “Class rep” or “Volunteers” colour people’s names, and can open private channels or let them post in announcements.</p>}
      {roles.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <li key={r.id} className="inline-flex items-center gap-1 rounded-full bg-zinc-50 dark:bg-white/[0.03] pe-1">
              <RoleChip role={r} className="text-[11px]" />
              <span className="text-[10px] text-zinc-500 tabular-nums">{counts[r.id] ?? 0}</span>
              <button type="button" disabled={busy === r.id} aria-label={`Delete role ${r.name}`} onClick={async () => { if (await confirmDialog({ title: `Delete the ${r.name} role?`, message: 'It comes off everyone who has it, and private channels it opened close to them.', destructive: true, confirmLabel: 'Delete' })) void post({ action: 'role-delete', roleId: r.id }, 'Role deleted', r.id); }} className="p-1 rounded-full text-zinc-400 hover:text-rose-500"><X className="w-3 h-3" /></button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form className="rounded-2xl border border-zinc-200 dark:border-white/10 p-3 space-y-2.5" onSubmit={async (e) => { e.preventDefault(); if (await post({ action: 'role-create', name, color }, 'Role made', 'new')) { setName(''); setOpen(false); } }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Role name, like Class rep" aria-label="Role name" className="input" />
          <ColorPicker value={color} onChange={setColor} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">Cancel</button>
            <button type="submit" disabled={!name.trim() || busy === 'new'} className="btn-primary btn-sm">{busy === 'new' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Make role</button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Moderators: give a member roles (a small list of toggles). */
export function MemberRolesButton({ communityId, userId, name, roles, held, onChanged }: { communityId: string; userId: string; name: string; roles: CommunityRole[]; held: string[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!roles.length) return null;
  const toggle = async (id: string) => {
    setBusy(true);
    const next = held.includes(id) ? held.filter((x) => x !== id) : [...held, id];
    try { await chatJson(`/api/chat/communities/${communityId}`, { method: 'POST', body: JSON.stringify({ action: 'member-roles', userId, roleIds: next }) }); onChanged(); }
    catch (e) { toast.error(errorOf(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Roles for ${name}`} title="Roles" className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-500"><Tag className="w-3.5 h-3.5" /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div role="group" aria-label={`Roles for ${name}`} className="absolute end-0 top-full mt-1 z-20 w-52 rounded-xl bg-white dark:bg-[#11212d] border border-zinc-200 dark:border-white/10 shadow-xl p-1">
            {roles.map((r) => (
              <button key={r.id} type="button" role="checkbox" aria-checked={held.includes(r.id)} disabled={busy} onClick={() => void toggle(r.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                <span className={cn('w-4 h-4 rounded border grid place-items-center', held.includes(r.id) ? 'border-transparent' : 'border-zinc-300 dark:border-white/20')} style={held.includes(r.id) ? { background: r.color } : undefined}>{held.includes(r.id) && <Check className="w-3 h-3 text-white" aria-hidden />}</span>
                <span className="flex-1 truncate" style={{ color: r.color }}>{r.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RoleToggles({ roles, value, onChange, label }: { roles: CommunityRole[]; value: string[]; onChange: (ids: string[]) => void; label: string }) {
  if (!roles.length) return <p className="text-xs text-zinc-500">Make a role first (under Roles) to choose who.</p>;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {roles.map((r) => {
        const on = value.includes(r.id);
        return (
          <button key={r.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
            className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border transition-colors', on ? 'text-white border-transparent' : 'text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-white/10')} style={on ? { background: r.color } : undefined}>
            {on && <Check className="w-3 h-3" aria-hidden />}{r.name}
          </button>
        );
      })}
    </div>
  );
}

/** Moderators: a channel row with its settings. */
export function ChannelSettingsRow({ channel, first, last, roles, categories, onChanged }: { channel: ManagedChannel; first: boolean; last: boolean; roles: CommunityRole[]; categories: string[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const move = async (dir: 'up' | 'down') => {
    try { await chatJson(`/api/chat/channels/${channel.id}`, { method: 'PATCH', body: JSON.stringify({ move: dir }) }); onChanged(); }
    catch (e) { toast.error(errorOf(e)); }
  };
  const Icon = channel.kind === 'VOICE' ? Headphones : channel.kind === 'ANNOUNCE' ? Megaphone : Hash;
  return (
    <li className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 bg-zinc-50 dark:bg-white/[0.03]">
      <Icon className={cn('w-4 h-4 shrink-0', channel.kind === 'VOICE' ? 'text-emerald-500' : channel.kind === 'ANNOUNCE' ? 'text-amber-500' : 'text-zinc-400')} aria-hidden />
      <span className="flex-1 min-w-0 text-sm truncate text-zinc-800 dark:text-zinc-200">
        {channel.name}{channel.private && <Lock className="inline w-3 h-3 ms-1 -mt-0.5 text-zinc-400" aria-label="private" />}
        {channel.category && <span className="block text-[10px] text-zinc-500 truncate">{channel.category}</span>}
      </span>
      <button type="button" disabled={first} onClick={() => void move('up')} aria-label={`Move ${channel.name} up`} className="p-1 rounded-lg text-zinc-400 hover:text-indigo-500 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
      <button type="button" disabled={last} onClick={() => void move('down')} aria-label={`Move ${channel.name} down`} className="p-1 rounded-lg text-zinc-400 hover:text-indigo-500 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${channel.name} settings`} className="p-1 rounded-lg text-zinc-400 hover:text-indigo-500"><Settings2 className="w-3.5 h-3.5" /></button>
      {/* Above the community sheet, outside it (its animation would otherwise hold a fixed sheet inside it). */}
      {open && createPortal(<ChannelSettings channel={channel} roles={roles} categories={categories} onClose={() => setOpen(false)} onChanged={onChanged} />, document.body)}
    </li>
  );
}

function ChannelSettings({ channel, roles, categories, onClose, onChanged }: { channel: ManagedChannel; roles: CommunityRole[]; categories: string[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(channel.name);
  const [category, setCategory] = useState(channel.category ?? '');
  const [priv, setPriv] = useState(channel.private);
  const [view, setView] = useState(channel.rules.view);
  const [post, setPost] = useState(channel.rules.post);
  const [slow, setSlow] = useState(channel.slowModeSec);
  const [busy, setBusy] = useState(false);
  const listId = `cats-${channel.id}`;
  const save = async () => {
    setBusy(true);
    try {
      await chatJson(`/api/chat/channels/${channel.id}`, { method: 'PATCH', body: JSON.stringify({ name, category, private: priv, viewRoles: view, postRoles: post, ...(channel.kind !== 'VOICE' ? { slowModeSec: slow } : {}) }) });
      toast.success('Channel saved');
      onChanged();
      onClose();
    } catch (e) { toast.error(errorOf(e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: `Delete ${channel.name}?`, message: 'Its messages are deleted for everyone.', destructive: true, confirmLabel: 'Delete' }))) return;
    try { await chatJson(`/api/chat/channels/${channel.id}`, { method: 'PATCH', body: JSON.stringify({ delete: true }) }); toast.success('Channel deleted'); onChanged(); onClose(); }
    catch (e) { toast.error(errorOf(e)); }
  };
  return (
    <Sheet title={`${channel.kind === 'VOICE' ? '' : '#'}${channel.name}`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button type="button" onClick={() => void save()} disabled={busy || !name.trim()} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save</button></div>}>
      <div className="space-y-4">
        <label className="block"><span className="text-xs font-semibold text-zinc-500">Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="input mt-1" /></label>
        <label className="block">
          <span className="text-xs font-semibold text-zinc-500">Category</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={30} list={listId} placeholder="None, or like Study or Fun" className="input mt-1" />
          <datalist id={listId}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <span className="block text-[11px] text-zinc-500 mt-1">Channels with the same category are listed together under it.</span>
        </label>
        <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm"><span className="font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" aria-hidden />Private</span><span className="block text-xs text-zinc-500">Only moderators and the roles chosen see it.</span></span>
            <Switch checked={priv} onChange={setPriv} label="Private channel" />
          </div>
          {priv && <RoleToggles roles={roles} value={view} onChange={setView} label="Roles that see it" />}
        </div>
        {channel.kind === 'ANNOUNCE' && (
          <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3 space-y-2">
            <p className="text-sm"><span className="font-semibold text-zinc-900 dark:text-white">Who can post</span><span className="block text-xs text-zinc-500">Moderators always can; choose roles that can too. Everyone else reads.</span></p>
            <RoleToggles roles={roles} value={post} onChange={setPost} label="Roles that can post" />
          </div>
        )}
        {channel.kind !== 'VOICE' && (
          <label className="block"><span className="text-xs font-semibold text-zinc-500">Slow mode</span>
            <select value={slow} onChange={(e) => setSlow(Number(e.target.value))} className="input mt-1">
              <option value={0}>Off</option><option value={10}>10 seconds</option><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={300}>5 minutes</option><option value={900}>15 minutes</option>
            </select>
          </label>
        )}
        <button type="button" onClick={() => void remove()} className="text-sm font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5"><Trash2 className="w-4 h-4" />Delete channel</button>
      </div>
    </Sheet>
  );
}
