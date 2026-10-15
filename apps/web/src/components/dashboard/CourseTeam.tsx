'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, LogOut, Trash2, UserPlus } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';

// A course's teaching team (Stage 5 · B2, src/server/course-staff.ts): the teacher adds co-teachers
// and teaching assistants by email; everyone on the team sees it and can leave.

type Role = 'CO_TEACHER' | 'TA';
interface Person { id: string; name: string; email: string; avatar: string | null }
interface Team { canEdit: boolean; teacher: Person | null; staff: (Person & { role: Role; me: boolean })[] }

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'CO_TEACHER', label: 'Co-teacher', hint: 'Everything you can do, except changing the team, copying or deleting the course.' },
  { value: 'TA', label: 'Teaching assistant', hint: 'Grades work, takes attendance and helps in the discussion. Can’t change the course’s content.' },
];

export function CourseTeam({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const key = `/api/courses/${courseId}/staff`;
  const { data, error, mutate } = useSWR<Team>(key, authedJson);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('CO_TEACHER');
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (body: Record<string, unknown>, label: string, ok?: string) => {
    setBusy(label);
    try {
      await authedJson(key, { method: 'POST', body: JSON.stringify(body) });
      await mutate();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(errorMessage(e, 'That didn’t work. Try again.'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet title="Teaching team" onClose={onClose}>
      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'The team couldn’t load.')}</p> : !data ? (
        <div className="h-32 rounded-2xl skeleton" />
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
            {data.teacher && (
              <li className="py-2.5 flex items-center gap-3">
                <Avatar name={data.teacher.name} src={data.teacher.avatar} size={36} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{data.teacher.name}</span><span className="block text-xs text-zinc-600 dark:text-zinc-400 truncate">{data.teacher.email}</span></span>
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Teacher</span>
              </li>
            )}
            {data.staff.map((p) => (
              <li key={p.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <Avatar name={p.name} src={p.avatar} size={36} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{p.name}{p.me ? ' (you)' : ''}</span><span className="block text-xs text-zinc-600 dark:text-zinc-400 truncate">{p.email}</span></span>
                {data.canEdit ? (
                  <>
                    <label className="sr-only" htmlFor={`role-${p.id}`}>Role for {p.name}</label>
                    <select id={`role-${p.id}`} className="input w-auto py-1.5 text-xs" value={p.role} disabled={!!busy} onChange={(e) => void act({ action: 'role', userId: p.id, role: e.target.value }, `role-${p.id}`, 'Role changed')}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button type="button" aria-label={`Remove ${p.name} from the team`} disabled={!!busy} onClick={async () => { if (await confirmDialog({ title: `Remove ${p.name}?`, message: 'They lose access to this course’s teaching tools.', confirmLabel: 'Remove', destructive: true })) void act({ action: 'remove', userId: p.id }, `rm-${p.id}`, 'Removed from the team'); }} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                  </>
                ) : (
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{ROLES.find((r) => r.value === p.role)?.label}</span>
                )}
                {!data.canEdit && p.me && (
                  <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Leave this course’s team?', confirmLabel: 'Leave', destructive: true })) { if (await act({ action: 'remove', userId: p.id }, 'leave', 'You left the team')) onClose(); } }} className="btn-secondary text-xs py-1.5"><LogOut className="w-3.5 h-3.5" /> Leave</button>
                )}
              </li>
            ))}
          </ul>
          {!data.staff.length && <p className="text-sm text-zinc-600 dark:text-zinc-400">No co-teachers or teaching assistants yet.</p>}
          {data.canEdit && (
            <form className="space-y-3 pt-2 border-t border-zinc-200/70 dark:border-white/[0.07]" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: 'add', email, role }, 'add', 'Added to the team')) setEmail(''); }}>
              <p className="pt-2 text-sm font-semibold text-zinc-900 dark:text-white">Add someone</p>
              <div>
                <label htmlFor="team-email" className="label">Their email address</label>
                <input id="team-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="name@school.edu" autoComplete="off" />
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">They need a teacher account at your school.</p>
              </div>
              <fieldset>
                <legend className="label">Role</legend>
                <div className="space-y-2 mt-1">
                  {ROLES.map((r) => (
                    <label key={r.value} className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                      <input type="radio" name="team-role" className="mt-1" checked={role === r.value} onChange={() => setRole(r.value)} />
                      <span>{r.label}<span className="block text-xs text-zinc-600 dark:text-zinc-400">{r.hint}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" disabled={busy === 'add'} className="btn-primary w-full justify-center">{busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Add to the team</button>
            </form>
          )}
        </div>
      )}
    </Sheet>
  );
}
