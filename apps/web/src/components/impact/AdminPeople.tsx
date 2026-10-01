'use client';

import { Search, X } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';

// Small shared pieces for the admin Global Impact pages: the search box, the text matcher behind it,
// and the chips / dates used when showing a person.

export function SearchBox({ value, onChange, placeholder, summary }: { value: string; onChange: (v: string) => void; placeholder: string; summary?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={80}
          className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {summary && <p className="text-xs text-zinc-500 shrink-0" aria-live="polite">{summary}</p>}
    </div>
  );
}

/** True when every word of `q` appears in at least one of the fields (case-insensitive). */
export function matchesQuery(q: string, ...fields: (string | number | null | undefined)[]) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.filter((f) => f !== null && f !== undefined && f !== '').join(' \u0001 ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

const ROLE_STYLE: Record<string, string> = {
  ADMIN: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  TEACHER: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  STUDENT: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  INDUSTRY_MENTOR: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};
export const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', TEACHER: 'Teacher', STUDENT: 'Student', INDUSTRY_MENTOR: 'Industry mentor', LEAD: 'Lead' };

export function RoleChip({ role }: { role?: string | null }) {
  if (!role) return null;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ROLE_STYLE[role] ?? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20'}`}>{ROLE_LABEL[role] ?? role}</span>;
}

export function StatusChip({ status }: { status?: string | null }) {
  if (!status) return null;
  const style = status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : status === 'SUSPENDED' ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10' : 'text-amber-600 dark:text-amber-400 bg-amber-500/10';
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

export function fmtDate(d?: string | Date | null) {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(+date) ? null : format(date, 'd MMM yyyy');
}

export function fmtAgo(d?: string | Date | null) {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(+date) ? null : `${formatDistanceToNowStrict(date)} ago`;
}

/** "Showing 3 of 12" style summary for a filtered list. */
export function shownSummary(shown: number, total: number, noun: string) {
  return shown === total ? `${total} ${noun}${total === 1 ? '' : 's'}` : `Showing ${shown} of ${total} ${noun}${total === 1 ? '' : 's'}`;
}
