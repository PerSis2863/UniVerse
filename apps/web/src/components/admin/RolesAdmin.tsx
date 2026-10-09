'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ChevronRight, KeyRound, Loader2, Plus, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { Field, SearchField } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import type { Permission } from '@/lib/permissions';

// Custom roles for admins (Stage 5 · B15.6; src/server/permissions.ts): make roles as sets of
// permissions (Accountant: school fees; Admissions officer: admissions…) and put staff in them.
// They then see those areas under "Office" in their menu. Admins can always do everything.

interface Person { id: string; name: string; email: string; avatar: string | null }
interface Role { id: string; name: string; description: string | null; permissions: Permission[]; members: Person[] }
interface Data { permissions: { key: Permission; area: string; label: string }[]; roles: Role[] }

const KEY = '/api/admin/roles';
const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';

export function RolesAdmin() {
  const { data, error, mutate } = useSWR<Data>(KEY, authedJson);
  const [open, setOpen] = useState<Role | 'new' | null>(null);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;
  const label = (k: Permission) => data.permissions.find((p) => p.key === k);
  const current = open && open !== 'new' ? data.roles.find((r) => r.id === open.id) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-xl">Give staff the parts of school admin they need, like fees for the accountant, without making them admins. They find them under “Office” in their menu.</p>
        <button type="button" onClick={() => setOpen('new')} className="btn-primary btn-sm shrink-0"><Plus className="w-4 h-4" /> New role</button>
      </div>
      {data.roles.length === 0 ? (
        <section className={`${card} p-8 text-center`}>
          <KeyRound className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" aria-hidden />
          <p className="font-semibold text-zinc-900 dark:text-white">No roles yet</p>
          <p className="text-sm text-zinc-500 mt-1">For example “Accountant” with the school fees permissions.</p>
        </section>
      ) : (
        <motion.ul variants={list} initial="hidden" animate="show" className="space-y-3">
          {data.roles.map((r) => (
            <motion.li key={r.id} variants={fadeUp}>
              <button type="button" onClick={() => { haptic('tap'); setOpen(r); }} className={`${card} w-full p-4 flex items-start gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors`}>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-zinc-900 dark:text-white">{r.name}</span>
                  {r.description && <span className="block text-xs text-zinc-500">{r.description}</span>}
                  <span className="mt-1.5 flex flex-wrap gap-1">{r.permissions.map((p) => <span key={p} className="text-[11px] rounded-full border border-zinc-200 dark:border-white/10 px-2 py-0.5 text-zinc-700 dark:text-zinc-200">{label(p)?.area}: {p.endsWith('.view') || p.endsWith('.review') ? 'see' : p.endsWith('.manage') ? 'manage' : p.startsWith('import') ? 'import' : p.startsWith('export') ? 'export' : 'whole school'}</span>)}</span>
                  <span className="block mt-1.5 text-xs text-zinc-500">{r.members.length ? `${r.members.length} staff: ${r.members.slice(0, 3).map((m) => m.name).join(', ')}${r.members.length > 3 ? '…' : ''}` : 'Nobody yet'}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0 mt-1" aria-hidden />
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
      {open && <RoleSheet key={open === 'new' ? 'new' : open.id} role={open === 'new' ? null : current ?? open} permissions={data.permissions} onClose={() => setOpen(null)} onChanged={() => void mutate()} onCreated={(id) => { void mutate().then((d) => setOpen(d?.roles.find((r) => r.id === id) ?? null)); }} />}
    </div>
  );
}

function RoleSheet({ role, permissions, onClose, onChanged, onCreated }: { role: Role | null; permissions: Data['permissions']; onClose: () => void; onChanged: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [chosen, setChosen] = useState<Set<Permission>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const areas = useMemo(() => [...new Set(permissions.map((p) => p.area))], [permissions]);
  const changed = !role || name !== role.name || (description || null) !== role.description || [...chosen].sort().join() !== [...role.permissions].sort().join();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const body = JSON.stringify({ action: 'save', name, description, permissions: [...chosen] });
      if (role) { await authedJson(`${KEY}/${role.id}`, { method: 'POST', body }); toast.success('Role saved'); onChanged(); }
      else { const r = await authedJson<{ id: string }>(KEY, { method: 'POST', body }); haptic('success'); toast.success('Role made: now add staff to it'); onCreated(r.id); }
    } catch (err) { setProblem(errorMessage(err, 'Couldn’t save the role.')); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!role || !(await confirmDialog({ title: `Delete “${role.name}”?`, message: role.members.length ? `${role.members.length} staff lose what this role gave them.` : undefined, confirmLabel: 'Delete role', destructive: true }))) return;
    try { await authedJson(`${KEY}/${role.id}`, { method: 'POST', body: JSON.stringify({ action: 'delete' }) }); toast.success('Role deleted'); onChanged(); onClose(); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t delete the role.')); }
  };

  return (
    <Sheet title={role ? role.name : 'New role'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">{(p) => <input {...p} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Accountant" />}</Field>
        <Field label="What it’s for (optional)">{(p) => <input {...p} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="Runs fees and receipts at the office" />}</Field>
        <fieldset className="space-y-3">
          <legend className="label">Permissions</legend>
          {areas.map((area) => (
            <div key={area}>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">{area}</p>
              <div className="space-y-1">
                {permissions.filter((p) => p.area === area).map((p) => (
                  <label key={p.key} className="flex items-start gap-3 rounded-xl px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer">
                    <input type="checkbox" checked={chosen.has(p.key)} onChange={() => setChosen((cur) => { const n = new Set(cur); if (n.has(p.key)) n.delete(p.key); else n.add(p.key); return n; })} className="mt-0.5 w-5 h-5 accent-indigo-600 shrink-0" />
                    <span className="text-sm text-zinc-800 dark:text-zinc-100">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-zinc-500">“Manage” includes “see” in the same area.</p>
        </fieldset>
        {problem && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{problem}</p>}
        <button type="submit" disabled={busy || !changed || !name.trim() || !chosen.size} className="btn-primary w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} {role ? 'Save' : 'Make role'}</button>
      </form>
      {role && <Members role={role} onChanged={onChanged} />}
      {role && <button type="button" onClick={() => void remove()} className="btn-ghost btn-sm mt-4 text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Delete role</button>}
    </Sheet>
  );
}

function Members({ role, onChanged }: { role: Role; onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data } = useSWR<{ people: Person[] }>(dq.length >= 2 ? `${KEY}/people?q=${encodeURIComponent(dq)}` : null, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (action: 'add' | 'remove', p: Person) => {
    setBusy(p.id);
    try {
      await authedJson(`${KEY}/${role.id}`, { method: 'POST', body: JSON.stringify({ action, userId: p.id }) });
      toast.success(action === 'add' ? `${p.name} is now ${/^[aeiou]/i.test(role.name) ? 'an' : 'a'} ${role.name}` : `${p.name} removed`);
      if (action === 'add') setQ('');
      onChanged();
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t do that.')); }
    finally { setBusy(null); }
  };
  const results = (data?.people ?? []).filter((p) => !role.members.some((m) => m.id === p.id));
  return (
    <section className="mt-6 space-y-3" aria-label="Staff in this role">
      <p className="label">Staff in this role</p>
      {role.members.length === 0 ? <p className="text-sm text-zinc-500">Nobody yet.</p> : (
        <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
          {role.members.map((m) => (
            <li key={m.id} className="py-2 flex items-center gap-3">
              <Avatar name={m.name} src={m.avatar} size={32} />
              <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{m.name}</span><span className="block text-xs text-zinc-500 truncate">{m.email}</span></span>
              <button type="button" aria-label={`Remove ${m.name}`} disabled={busy === m.id} onClick={() => void act('remove', m)} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10">{busy === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}</button>
            </li>
          ))}
        </ul>
      )}
      <SearchField value={q} onChange={setQ} placeholder="Add staff: name or email" />
      {dq.length >= 2 && (
        <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
          {!data ? <li className="py-2 text-sm text-zinc-500">Searching…</li> : results.length === 0 ? <li className="py-2 text-sm text-zinc-500">No staff accounts match. Roles are for staff (teacher) accounts.</li> : results.map((p) => (
            <li key={p.id} className="py-2 flex items-center gap-3">
              <Avatar name={p.name} src={p.avatar} size={32} />
              <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{p.name}</span><span className="block text-xs text-zinc-500 truncate">{p.email}</span></span>
              <button type="button" disabled={busy === p.id} onClick={() => void act('add', p)} className="btn-secondary btn-sm">{busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Add</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
