'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Shuffle, Trash2, Users } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { GROUP_LABEL, GROUP_MODES, type GroupMode } from '@/lib/group-maker';

// Groups for a group assignment (Stage 5 · B3.2, src/server/assignment-groups.ts): who hands in,
// random groups or the course's sections, renaming, and who's in which group.

export interface Group { id: string; name: string; members: { id: string; name: string }[] }

export function GroupModePicker({ assignmentId, mode, disabled, onChanged }: { assignmentId: string; mode: GroupMode | null; disabled: boolean; onChanged: () => void }) {
  const set = async (v: string) => {
    try {
      await authedJson(`/api/assignments/${assignmentId}/groups`, { method: 'POST', body: JSON.stringify({ action: 'mode', groupMode: v === 'NONE' ? null : v }) });
      toast.success(`Who hands in: ${GROUP_LABEL[v as 'NONE' | GroupMode].label.toLowerCase()}`);
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'That didn’t change.')); }
  };
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">Who hands in
      <select className="input w-auto py-1.5" value={mode ?? 'NONE'} disabled={disabled} onChange={(e) => void set(e.target.value)}>
        {(['NONE', ...GROUP_MODES] as const).map((k) => <option key={k} value={k}>{GROUP_LABEL[k].label}</option>)}
      </select>
      <span className="text-xs text-zinc-500 dark:text-zinc-400 basis-full">{GROUP_LABEL[mode ?? 'NONE'].hint}</span>
    </label>
  );
}

export function GroupsEditor({ assignmentId, groups, students, canManage, onChanged }: {
  assignmentId: string; groups: Group[]; students: { id: string; name: string }[]; canManage: boolean; onChanged: () => void;
}) {
  const [size, setSize] = useState('3');
  const [busy, setBusy] = useState<string | null>(null);
  const send = async (body: Record<string, unknown>, label: string, ok?: string) => {
    setBusy(label);
    try {
      const out = await authedJson<{ groups?: number }>(`/api/assignments/${assignmentId}/groups`, { method: 'POST', body: JSON.stringify(body) });
      toast.success(out.groups ? `${out.groups} groups made` : ok ?? 'Saved');
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, 'That didn’t work. Try again.'));
    } finally {
      setBusy(null);
    }
  };
  const replace = async (body: Record<string, unknown>, label: string) => {
    if (groups.length && !(await confirmDialog({ title: 'Make new groups?', message: 'The groups you have now are replaced.', confirmLabel: 'Make them' }))) return;
    void send(body, label);
  };
  const groupOf = new Map(groups.flatMap((g) => g.members.map((m) => [m.id, g.id] as const)));
  const loose = students.filter((s) => !groupOf.has(s.id));
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-zinc-800 dark:text-zinc-200"><span className="block text-xs font-medium mb-1">Students a group</span>
            <input type="number" min={2} max={10} value={size} onChange={(e) => setSize(e.target.value)} className="input w-20 py-1.5" />
          </label>
          <button type="button" disabled={!!busy} onClick={() => void replace({ action: 'make', size: Number(size) || 3 }, 'make')} className="btn-secondary btn-sm">{busy === 'make' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />} Make random groups</button>
          <button type="button" disabled={!!busy} onClick={() => void replace({ action: 'sections' }, 'sections')} className="btn-secondary btn-sm"><Users className="w-3.5 h-3.5" /> Use the course’s sections</button>
          <button type="button" disabled={!!busy} onClick={async () => { const name = await promptDialog({ title: 'New group', defaultValue: `Group ${groups.length + 1}`, maxLength: 60, confirmLabel: 'Add' }); if (name?.trim()) void send({ action: 'add', name }, 'add', 'Group added'); }} className="btn-ghost btn-sm"><Plus className="w-3.5 h-3.5" /> Add a group</button>
        </div>
      )}
      {groups.length ? (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {groups.map((g) => (
            <li key={g.id} className="rounded-xl border border-zinc-200 dark:border-white/10 p-3">
              <div className="flex items-center gap-1">
                <span className="flex-1 min-w-0 text-sm font-semibold text-zinc-900 dark:text-white truncate">{g.name} <span className="font-normal text-zinc-600 dark:text-zinc-400">· {g.members.length}</span></span>
                {canManage && <>
                  <button type="button" aria-label={`Rename ${g.name}`} onClick={async () => { const name = await promptDialog({ title: 'Rename group', defaultValue: g.name, maxLength: 60, confirmLabel: 'Rename' }); if (name?.trim() && name !== g.name) void send({ action: 'rename', groupId: g.id, name }, 'rn', 'Renamed'); }} className="p-1.5 rounded-lg text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" aria-label={`Delete ${g.name}`} onClick={async () => { if (await confirmDialog({ title: `Delete ${g.name}?`, message: 'Its students go back to having no group.', confirmLabel: 'Delete', destructive: true })) void send({ action: 'delete', groupId: g.id }, 'del', 'Group deleted'); }} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
                </>}
              </div>
              <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">{g.members.length ? g.members.map((m) => m.name).join(', ') : 'Nobody yet'}</p>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-zinc-600 dark:text-zinc-400">No groups yet. Students can’t hand in until they’re in one.</p>}
      {loose.length > 0 && groups.length > 0 && <p className="text-sm text-amber-800 dark:text-amber-200">Not in a group: {loose.map((s) => s.name).join(', ')}.</p>}
      {canManage && groups.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white">Move students</summary>
          <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
            {students.map((s) => (
              <li key={s.id} className="py-1.5 flex items-center gap-3">
                <span className="flex-1 min-w-0 text-sm text-zinc-900 dark:text-white truncate">{s.name}</span>
                <label htmlFor={`grp-${s.id}`} className="sr-only">Group for {s.name}</label>
                <select id={`grp-${s.id}`} disabled={!!busy} value={groupOf.get(s.id) ?? ''} onChange={(e) => void send({ action: 'move', studentId: s.id, groupId: e.target.value || null }, `m-${s.id}`, 'Moved')} className="input w-auto py-1 text-xs">
                  <option value="">No group</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
