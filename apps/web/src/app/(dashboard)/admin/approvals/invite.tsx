'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Building2, Check, Copy, Globe, GraduationCap, Loader2, Mail, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// Approvals → Invite people: paste a class list of email addresses. Invited people are approved
// automatically when they sign up with that (verified) address: students are verified, staff and
// organizations get their role. No email is sent from here; share the sign-up link yourself
// (class group, LMS, email from your school address).

type InviteRole = 'STUDENT' | 'TEACHER' | 'ADMIN';
const ROLES: { id: InviteRole; label: string; icon: typeof GraduationCap }[] = [
  { id: 'STUDENT', label: 'Students', icon: GraduationCap },
  { id: 'TEACHER', label: 'Staff', icon: Building2 },
  { id: 'ADMIN', label: 'Organizations', icon: Globe },
];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
interface Result { invited: number; alreadyMembers: string[]; invalid: string[]; expiresAt: string }

export function InviteDialog({ onClose }: { onClose: () => void }) {
  const [role, setRole] = useState<InviteRole>('STUDENT');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const { data: pending, mutate } = useSWR<{ total: number }>('/users/invitations', (u: string) => api.get(u).then((r) => r.data));

  const parsed = useMemo(() => {
    const all = [...new Set(text.toLowerCase().split(/[\s,;]+/).map((e) => e.replace(/^<|>$/g, '')).filter(Boolean))];
    return { valid: all.filter((e) => EMAIL_RE.test(e)).length, invalid: all.filter((e) => !EMAIL_RE.test(e)).length };
  }, [text]);

  const link = typeof window === 'undefined' ? '/register' : `${window.location.origin}/register`;

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post<Result>('/users/invitations/bulk', { emails: text, role });
      setResult(data);
      setText('');
      await mutate();
      toast.success(`${data.invited} ${data.invited === 1 ? 'person' : 'people'} invited`);
    } catch (e) {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(m || 'Could not send the invitations.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Invite people"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Invite people</h2>
            <p className="text-sm text-zinc-500 mt-0.5">They&apos;re approved automatically when they sign up with the invited, verified email. No review needed.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"><X className="w-5 h-5" /></button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Invite as">
          {ROLES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={role === r.id} onClick={() => setRole(r.id)}
              className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-colors',
                role === r.id ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400')}>
              <r.icon className="w-4 h-4" /> {r.label}
            </button>
          ))}
        </div>

        <label className="block mt-4">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email addresses</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} spellCheck={false}
            placeholder={'Paste from a spreadsheet or class list:\nana.silva@univ.fr\nkarim.benali@univ.fr, li.wei@univ.fr'}
            className="mt-1.5 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/50 px-3.5 py-2.5 text-sm font-mono text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
          <span className="block mt-1 text-xs text-zinc-500">
            {parsed.valid} valid{parsed.invalid ? `, ${parsed.invalid} not an email address` : ''} · up to 1,000 at a time · valid for 30 days
          </span>
        </label>

        <button onClick={send} disabled={busy || !parsed.valid || parsed.valid > 1000}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          Invite {parsed.valid || ''} {ROLES.find((r) => r.id === role)!.label.toLowerCase()}
        </button>

        {result && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4 text-sm">
            <p className="font-semibold text-zinc-900 dark:text-white">{result.invited} invited.</p>
            {result.alreadyMembers.length > 0 && <p className="mt-1 text-zinc-600 dark:text-zinc-300">{result.alreadyMembers.length} already have an account (not invited): {result.alreadyMembers.slice(0, 5).join(', ')}{result.alreadyMembers.length > 5 ? '…' : ''}</p>}
            {result.invalid.length > 0 && <p className="mt-1 text-zinc-600 dark:text-zinc-300">Skipped {result.invalid.length} that aren&apos;t email addresses: {result.invalid.slice(0, 5).join(', ')}{result.invalid.length > 5 ? '…' : ''}</p>}
          </div>
        )}

        <div className="mt-5 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06] p-4">
          <p className="text-sm font-medium text-zinc-900 dark:text-white">Then share the sign-up link</p>
          <p className="text-xs text-zinc-500 mt-0.5">Send it to them yourself (class group, your LMS or school email). They should sign up with the address you invited.</p>
          <div className="mt-2 flex gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">{link}</code>
            <button onClick={copy} className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg border border-zinc-200 dark:border-white/10 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {pending && <p className="mt-2 text-xs text-zinc-500">{pending.total} invitation{pending.total === 1 ? '' : 's'} waiting for sign-up.</p>}
        </div>
      </div>
    </div>
  );
}
