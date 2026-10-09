'use client';

// Small building blocks shared by the admin pages that list people: a search box, a person
// cell (name, email, role, status, phone) and a tolerant text matcher for client-side search.

import type { ReactNode } from 'react';
import { Mail, Phone, Search, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export interface PersonInfo {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
  phone?: string | null;
  lastSeenAt?: string | Date | null;
}

export const ROLE_LABEL: Record<string, string> = {
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  ADMIN: 'Admin',
  INDUSTRY_MENTOR: 'Industry mentor',
  GUARDIAN: 'Parent or guardian',
};

const ROLE_TONE: Record<string, string> = {
  STUDENT: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  TEACHER: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  ADMIN: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  INDUSTRY_MENTOR: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20',
  GUARDIAN: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20',
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'text-emerald-600 dark:text-emerald-400',
  PENDING: 'text-amber-600 dark:text-amber-400',
  SUSPENDED: 'text-rose-600 dark:text-rose-400',
};

export function roleLabel(role?: string | null) {
  if (!role) return '';
  return ROLE_LABEL[role] ?? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function RoleBadge({ role, className }: { role?: string | null; className?: string }) {
  if (!role) return null;
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap', ROLE_TONE[role] ?? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20', className)}>
      {roleLabel(role)}
    </span>
  );
}

export function lastActive(value?: string | Date | null) {
  if (!value) return 'Never active';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Never active' : `Active ${formatDistanceToNow(d, { addSuffix: true })}`;
}

/** A person's name with email, role and (when known) status, phone and last activity. */
export function PersonCell({ person, extra, showActivity, className }: {
  person?: PersonInfo | null;
  extra?: ReactNode;
  showActivity?: boolean;
  className?: string;
}) {
  if (!person) return <span className="text-sm text-zinc-500">Unknown person</span>;
  const name = person.name?.trim() || person.email || 'Unnamed';
  return (
    <div className={cn('flex items-start gap-3 min-w-0', className)}>
      <span aria-hidden className="w-8 h-8 shrink-0 rounded-full bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300">
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-zinc-900 dark:text-white break-words">{name}</span>
          <RoleBadge role={person.role} />
          {person.status && person.status !== 'ACTIVE' && (
            <span className={cn('text-[10px] font-bold uppercase', STATUS_TONE[person.status] ?? 'text-zinc-500')}>{person.status.toLowerCase()}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          {person.email && (
            <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1 hover:text-indigo-500 break-all">
              <Mail className="w-3 h-3 shrink-0" />{person.email}
            </a>
          )}
          {person.phone && (
            <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1 hover:text-indigo-500">
              <Phone className="w-3 h-3 shrink-0" />{person.phone}
            </a>
          )}
          {showActivity && <span>{lastActive(person.lastSeenAt)}</span>}
        </div>
        {extra && <div className="mt-1 text-xs text-zinc-500">{extra}</div>}
      </div>
    </div>
  );
}

/** Search input used across the admin people pages. */
export function AdminSearch({ value, onChange, placeholder = 'Search…', label, shown, total, className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  shown?: number;
  total?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center gap-2', className)}>
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 pl-9 pr-9 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
        {value && (
          <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {total !== undefined && (
        <span className="text-xs text-zinc-500 tabular-nums shrink-0">
          {value.trim() && shown !== undefined ? `${shown} of ${total}` : `${total}`} shown
        </span>
      )}
    </div>
  );
}

/** True when every word of `q` appears somewhere in the given values (case-insensitive). */
export function matchesQuery(q: string, ...values: unknown[]) {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = values
    .flat()
    .map((v) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''))
    .join(' ')
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** The searchable text of a person (name, email, role, status, phone). */
export function personText(p?: PersonInfo | null) {
  if (!p) return [];
  return [p.name, p.email, p.role, roleLabel(p.role), p.status, p.phone];
}
