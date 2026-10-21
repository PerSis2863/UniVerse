'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';

import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Search, Filter, MoreVertical, UserCheck, UserX, Shield, Clock,
  GraduationCap, User, ChevronDown, X, Mail, Calendar, Trash2, Phone, BookOpen,  LogIn, ClipboardCheck, Download, BookmarkPlus, Loader2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import { TabPill } from '@/components/ui/Glide';
import { SectionTabs, ADMIN_PEOPLE_TABS } from '@/components/layout/SectionTabs';
import Link from '@/components/ui/Link';
import { downloadCsv } from '@/lib/csv-download';
import { useSavedViews } from '@/lib/saved-views';

type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
type Status = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
interface Person {
  id: string; name: string; email: string; role: Role; status: Status; phone: string | null;
  accountType?: string | null; onboardedAt: string | null; createdAt: string; lastSeenAt?: string | null; termsAcceptedAt: string | null;
  studentProfile: { department: string | null; year: number; gpa: number } | null;
  teacherProfile: { department: string | null; designation: string | null } | null;
  _count?: { taughtCourses: number; enrollments: number };
}
interface Overview {
  taught: { id: string; code: string; name: string; status: string; _count: { enrollments: number; quizzes: number } }[];
  enrolled: { enrolledAt: string; course: { id: string; code: string; name: string; status: string; teacher: { name: string } | null } }[];
  signIns: { createdAt: string; kind: string; method: string | null; device: string | null; city: string | null; country: string | null }[];
  quizSubmissions: number;
  attendance: Partial<Record<'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED', number>>;
  applications: { id: string; requestedRole: Role; status: string; submittedAt: string | null; reviewedAt: string | null }[];
}
interface Stats { total: number; students: number; teachers: number; pending: number }

/** The list endpoint returns up to this many people; beyond that, searches go to the server. */
const LIST_CAP = 1000;
const ROLE_FILTERS: ('All' | Role)[] = ['All', 'STUDENT', 'TEACHER', 'ADMIN'];
const STATUS_FILTERS: ('All' | Status)[] = ['All', 'ACTIVE', 'PENDING', 'SUSPENDED'];
const ROLE_LABEL: Record<Role, string> = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Admin' };
const STATUS_STYLE: Record<Status, string> = {
  ACTIVE: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  PENDING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  SUSPENDED: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const errorMessage = (e: unknown, fallback: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
const ago = (d?: string | null) => (d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : null);
type View = { search: string; role: 'All' | Role; status: 'All' | Status };
interface BulkResult { changed: number; skipped: { id: string; name: string; why: string }[] }
const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** The people shown (or chosen) as a CSV file. */
function exportPeople(list: Person[]) {
  downloadCsv(`universe-users-${format(new Date(), 'yyyy-MM-dd')}`,
    ['Name', 'Email', 'Phone', 'Role', 'Status', 'Department', 'Courses', 'Last active', 'Joined'],
    list.map((u) => [u.name, u.email, u.phone, ROLE_LABEL[u.role] ?? u.role, cap(u.status), u.studentProfile?.department ?? u.teacherProfile?.department ?? '', courseLine(u), u.lastSeenAt ? format(new Date(u.lastSeenAt), 'yyyy-MM-dd HH:mm') : '', format(new Date(u.createdAt), 'yyyy-MM-dd')]));
}

/** Department / year / designation in one short line. */
function profileLine(u: Person) {
  if (u.studentProfile) return [u.studentProfile.department, `Year ${u.studentProfile.year}`].filter(Boolean).join(' · ');
  if (u.teacherProfile) return [u.teacherProfile.designation, u.teacherProfile.department].filter(Boolean).join(' · ');
  return '';
}

function RoleBadge({ role }: { role: Role }) {
  const Icon = role === 'ADMIN' ? Shield : role === 'TEACHER' ? GraduationCap : User;
  const cls = role === 'ADMIN' ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
    : role === 'TEACHER' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
  return <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border w-fit', cls)}><Icon className="w-3.5 h-3.5" /> {ROLE_LABEL[role]}</span>;
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border w-fit', STATUS_STYLE[status] ?? STATUS_STYLE.ACTIVE)}>
      {status === 'SUSPENDED' ? <UserX className="w-3.5 h-3.5" /> : status === 'PENDING' ? <Clock className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
      {cap(status)}
    </span>
  );
}

/** "Teaches 3 · Enrolled in 2", only the parts that apply. */
function courseLine(u: Person) {
  const c = u._count;
  if (!c) return '—';
  const parts = [c.taughtCourses ? `Teaches ${c.taughtCourses}` : null, c.enrollments ? `Enrolled in ${c.enrollments}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No courses';
}

export default function AdminUsers() {
  const { data: allUsers, isLoading: loading, mutate: mutateUsers } = useSWR<Person[]>('/users', fetcher);
  const { data: stats } = useSWR<Stats>('/users/stats', fetcher);
  const [searchTerm, setSearchTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState<'All' | Role>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | Status>('All');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Person | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Several people at once (Phase E): ticked rows, then an action for all of them.
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const saved = useSavedViews<View>('uv-admin-users-views');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // The full list is capped; when it is, searches also ask the server so nobody is missed.
  const truncated = (allUsers?.length ?? 0) >= LIST_CAP;
  const { data: serverMatches, isLoading: searching } = useSWR<Person[]>(truncated && debounced ? `/users?search=${encodeURIComponent(debounced)}` : null, fetcher);
  const users = useMemo(() => (truncated && debounced ? serverMatches ?? [] : allUsers ?? []), [truncated, debounced, serverMatches, allUsers]);

  const roleCounts = useMemo(() => {
    const m: Record<string, number> = { All: allUsers?.length ?? 0 };
    for (const u of allUsers ?? []) m[u.role] = (m[u.role] ?? 0) + 1;
    return m;
  }, [allUsers]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      const haystack = [u.name, u.email, u.phone, u.studentProfile?.department, u.teacherProfile?.department, u.teacherProfile?.designation].filter(Boolean).join(' ').toLowerCase();
      return (!term || haystack.includes(term))
        && (roleFilter === 'All' || u.role === roleFilter)
        && (statusFilter === 'All' || u.status === statusFilter);
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const refresh = () => { void mutateUsers(); };

  const setStatus = async (u: Person, status: Status) => {
    try {
      await api.patch(`/users/${u.id}/status`, { status });
      toast.success(status === 'SUSPENDED' ? 'User deactivated.' : 'User activated.');
      refresh();
      setSelectedUser((s) => (s && s.id === u.id ? { ...s, status } : s));
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change the account status'));
    }
    setOpenMenuId(null);
  };

  const handleDelete = async (userId: string) => {
    if (await confirmDialog({ title: 'Delete this user?', message: 'Their account and data will be removed. This can’t be undone.', destructive: true })) {
      try {
        await api.delete(`/users/${userId}`);
        toast.success('User removed from system.');
        setSelectedUser(null);
        refresh();
      } catch (e) {
        toast.error(errorMessage(e, 'Failed to delete user'));
      }
    }
    setOpenMenuId(null);
  };

  const filtersOn = !!searchTerm || roleFilter !== 'All' || statusFilter !== 'All';

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = filteredUsers.length > 0 && filteredUsers.every((u) => picked.has(u.id));
  const toggleAll = () => setPicked((p) => {
    const n = new Set(p);
    for (const u of filteredUsers) { if (allShown) n.delete(u.id); else n.add(u.id); }
    return n;
  });
  const pickedPeople = (allUsers ?? []).filter((u) => picked.has(u.id));

  const runBulk = async (path: string, body: Record<string, unknown>, size: number, done: (n: number) => string) => {
    setBulkBusy(true);
    let changed = 0;
    const skipped: BulkResult['skipped'] = [];
    try {
      for (const ids of chunks([...picked], size)) {
        const { data } = await api.post<BulkResult>(path, { ...body, ids });
        changed += data.changed ?? 0;
        skipped.push(...(data.skipped ?? []));
      }
      if (changed) toast.success(done(changed));
      if (skipped.length) toast.message(`${skipped.length} not changed`, { description: skipped.slice(0, 4).map((x) => `${x.name}: ${x.why}`).join('\n') + (skipped.length > 4 ? '\n…' : '') });
      if (!changed && !skipped.length) toast.message('Nothing to change: they already are.');
      setPicked(new Set());
      refresh();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change these accounts'));
      if (changed) refresh();
    } finally { setBulkBusy(false); }
  };
  const bulkStatus = (status: Status) => runBulk('/users/bulk/status', { status }, 200, (n) => `${n} account${n === 1 ? '' : 's'} ${status === 'SUSPENDED' ? 'deactivated' : 'reactivated'}.`);
  const bulkRole = async (role: 'STUDENT' | 'TEACHER') => {
    const label = role === 'STUDENT' ? 'students' : 'teachers';
    if (!(await confirmDialog({ title: `Make ${picked.size === 1 ? 'this person' : `these ${picked.size} people`} ${label}?`, message: `For fixing a wrong role. Only people with no courses yet change (anyone teaching or enrolled is skipped, and admins aren't changed here). They see the ${role === 'STUDENT' ? 'student' : 'teacher'} pages the next time they open UniVerse.`, confirmLabel: `Make ${label}` }))) return;
    void runBulk('/users/bulk/role', { role }, 20, (n) => `${n} ${n === 1 ? 'person is' : 'people are'} now ${label}.`);
  };
  const saveView = async () => {
    const name = await promptDialog({ title: 'Save these filters', message: 'Saved on this device, for this list.', placeholder: 'Pending teachers', maxLength: 40, confirmLabel: 'Save' });
    if (!name?.trim()) return;
    saved.save(name, { search: searchTerm, role: roleFilter, status: statusFilter });
    toast.success('View saved');
  };
  const applyView = (v: View) => { setSearchTerm(v.search); setRoleFilter(v.role); setStatusFilter(v.status); };

  const rowMenu = (user: Person, up = false) => (
    <div className="relative inline-block text-start">
      <button
        onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
        aria-label={`Actions for ${user.name}`}
        className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {openMenuId === user.id && (
        <div className={cn('absolute end-0 z-30 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl w-44 py-1 text-start animate-in fade-in duration-150', up ? 'bottom-10' : 'top-10')}>
          <button onClick={() => { setSelectedUser(user); setOpenMenuId(null); }} className="w-full px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
            <User className="w-3.5 h-3.5" /> View profile
          </button>
          <a href={`mailto:${user.email}`} onClick={() => setOpenMenuId(null)} className="w-full px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5" /> Send email
          </a>
          {user.status !== 'SUSPENDED' ? (
            <button onClick={() => setStatus(user, 'SUSPENDED')} className="w-full px-4 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
              <UserX className="w-3.5 h-3.5" /> Deactivate
            </button>
          ) : (
            <button onClick={() => setStatus(user, 'ACTIVE')} className="w-full px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2">
              <UserCheck className="w-3.5 h-3.5" /> Reactivate
            </button>
          )}
          <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
          <button onClick={() => handleDelete(user.id)} className="w-full px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5" /> Delete user
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Topbar title="Users" subtitle="Every student, teacher and administrator, with their courses and activity" />
      <SectionTabs tabs={ADMIN_PEOPLE_TABS} />

      <div className="flex-1 p-4 sm:p-8 overflow-y-auto space-y-6">

        {/* Totals */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'All accounts', value: stats?.total },
            { label: 'Students', value: stats?.students },
            { label: 'Teachers', value: stats?.teachers },
            { label: 'Waiting for approval', value: stats?.pending },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4">
              <p className="text-xs text-zinc-500">{c.label}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-white">{c.value ?? '—'}</p>
            </div>
          ))}
        </div>

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
          <div className="relative w-full sm:w-96">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400" />
            <input
              type="text"
              placeholder="Search name, email, phone or department…"
              aria-label="Search users"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full ps-10 pe-9 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} aria-label="Clear search" className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"><X className="w-4 h-4" /></button>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | Status)}
              aria-label="Filter by status"
              className="flex-1 sm:flex-none px-3 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 rounded-lg"
            >
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'All' ? 'Any status' : cap(s)}</option>)}
            </select>
            <button
              onClick={() => setShowFilterDropdown((p) => !p)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap text-sm"
            >
              <Filter className="w-4 h-4" />
              {roleFilter === 'All' ? 'Any role' : ROLE_LABEL[roleFilter]}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showFilterDropdown && (
              <div className="absolute end-0 top-11 z-30 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl w-48 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                {ROLE_FILTERS.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRoleFilter(r); setShowFilterDropdown(false); }}
                    className={cn('relative isolate w-full flex justify-between text-start px-4 py-2 text-sm transition-colors', roleFilter === r ? 'text-indigo-500' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800')}
                  >{roleFilter === r && <TabPill id="p-dashboard-admin-users-page-0" variant="soft" />}
                    <span>{r === 'All' ? 'All roles' : `${ROLE_LABEL[r]}s`}</span>
                    <span className="text-zinc-400">{roleCounts[r] ?? 0}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => exportPeople(filteredUsers)} disabled={!filteredUsers.length} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap text-sm">
              <Download className="w-4 h-4" />Export CSV
            </button>
          </div>
        </div>

        {/* Saved views (this device) */}
        {(filtersOn || saved.views.length > 0) && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Saved views">
            {saved.views.map((v) => {
              const on = v.value.search === searchTerm && v.value.role === roleFilter && v.value.status === statusFilter;
              return (
                <span key={v.name} className={cn('inline-flex items-center rounded-full border text-xs font-medium', on ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300')}>
                  <button type="button" aria-pressed={on} onClick={() => applyView(v.value)} className="ps-3 pe-1.5 py-1">{v.name}</button>
                  <button type="button" onClick={() => saved.remove(v.name)} className="min-w-6 min-h-6 me-0.5 inline-flex items-center justify-center rounded-full opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10"><X className="w-3 h-3" /><span className="sr-only">Remove the view {v.name}</span></button>
                </span>
              );
            })}
            {filtersOn && <button type="button" onClick={() => void saveView()} className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-indigo-500"><BookmarkPlus className="w-3.5 h-3.5" />Save view</button>}
          </div>
        )}

        {/* What to do with the ticked people */}
        {picked.size > 0 && (
          <div role="region" aria-label="Selected people" className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/80 backdrop-blur px-3 py-2 shadow-lg">
            <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 me-1">{picked.size} selected</span>
            {bulkBusy && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" aria-label="Working" />}
            <button type="button" disabled={bulkBusy} onClick={() => void bulkStatus('SUSPENDED')} className="btn-secondary btn-sm"><UserX className="w-3.5 h-3.5" />Deactivate</button>
            <button type="button" disabled={bulkBusy} onClick={() => void bulkStatus('ACTIVE')} className="btn-secondary btn-sm"><UserCheck className="w-3.5 h-3.5" />Reactivate</button>
            <button type="button" disabled={bulkBusy} onClick={() => void bulkRole('STUDENT')} className="btn-secondary btn-sm"><User className="w-3.5 h-3.5" />Make students</button>
            <button type="button" disabled={bulkBusy} onClick={() => void bulkRole('TEACHER')} className="btn-secondary btn-sm"><GraduationCap className="w-3.5 h-3.5" />Make teachers</button>
            <button type="button" onClick={() => exportPeople(pickedPeople)} className="btn-secondary btn-sm"><Download className="w-3.5 h-3.5" />Export</button>
            <button type="button" onClick={() => setPicked(new Set())} className="btn-ghost btn-sm ms-auto">Clear</button>
          </div>
        )}

        {(filtersOn || truncated) && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {searching ? 'Searching all accounts…' : <>Showing <strong className="text-zinc-900 dark:text-white">{filteredUsers.length}</strong> of {truncated && debounced ? `${users.length} matching` : users.length} users</>}
            {truncated && !debounced && ` (the newest ${LIST_CAP.toLocaleString()}; search to find anyone else)`}
          </p>
        )}

        {/* People */}
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl min-h-[300px]">
          {loading ? (
            <ContentSkeleton variant="table" />
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">{filtersOn ? 'No users match these filters.' : 'No users yet.'}</div>
          ) : (
            <>
              {/* Phones: cards */}
              <ul className="md:hidden divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {filteredUsers.map((user) => (
                  <li key={user.id} className={cn('p-4 flex gap-3', picked.has(user.id) && 'bg-indigo-500/[0.06]')}>
                    <input type="checkbox" checked={picked.has(user.id)} onChange={() => toggle(user.id)} aria-label={`Select ${user.name}`} className="mt-3 w-5 h-5 shrink-0 accent-indigo-600" />
                    <button onClick={() => setSelectedUser(user)} className="flex-1 min-w-0 flex gap-3 text-start">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium shrink-0">{user.name.charAt(0).toUpperCase()}</div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-zinc-900 dark:text-white truncate">{user.name}</p>
                        <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5"><RoleBadge role={user.role} /><StatusBadge status={user.status} /></div>
                        <p className="mt-2 text-xs text-zinc-500">{courseLine(user)}{profileLine(user) ? ` · ${profileLine(user)}` : ''}</p>
                        <p className="text-xs text-zinc-400">Last active {ago(user.lastSeenAt) ?? 'never'} · joined {format(new Date(user.createdAt), 'd MMM yyyy')}</p>
                      </div>
                    </button>
                    {rowMenu(user)}
                  </li>
                ))}
              </ul>

              {/* Desktop: table */}
              {/* Its own scroll box, so the column names stay on top while the list scrolls. */}
              <div className="hidden md:block overflow-auto max-h-[calc(100dvh-16rem)] min-h-[300px] rounded-xl">
                <table className="w-full text-start border-collapse">
                  <thead className="sticky top-0 z-10 bg-white dark:bg-zinc-900 shadow-[inset_0_-1px_0_var(--separator)]">
                    <tr className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                      <th className="p-4 w-10"><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label={allShown ? 'Clear the shown users' : 'Select every shown user'} className="w-4 h-4 accent-indigo-600" /></th>
                      <th className="p-4">User</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Courses</th>
                      <th className="p-4">Last active</th>
                      <th className="p-4">Joined</th>
                      <th className="p-4 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                    {filteredUsers.map((user, i) => (
                      <tr key={user.id} className={cn('hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors', picked.has(user.id) && 'bg-indigo-500/[0.06]')}>
                        <td className="p-4"><input type="checkbox" checked={picked.has(user.id)} onChange={() => toggle(user.id)} aria-label={`Select ${user.name}`} className="w-4 h-4 accent-indigo-600" /></td>
                        <td className="p-4">
                          <button onClick={() => setSelectedUser(user)} className="flex items-center gap-3 text-start hover:opacity-80 transition-opacity">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium shadow-lg flex-shrink-0">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-zinc-900 dark:text-white">{user.name}</div>
                              <div className="text-sm text-zinc-500">{user.email}</div>
                              {user.phone && <div className="text-xs text-zinc-400">{user.phone}</div>}
                            </div>
                          </button>
                        </td>
                        <td className="p-4">
                          <RoleBadge role={user.role} />
                          {profileLine(user) && <div className="mt-1 text-xs text-zinc-500">{profileLine(user)}</div>}
                        </td>
                        <td className="p-4"><StatusBadge status={user.status} /></td>
                        <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400">{courseLine(user)}</td>
                        <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400" title={user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : undefined}>{ago(user.lastSeenAt) ?? 'Never'}</td>
                        <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400">{format(new Date(user.createdAt), 'd MMM yyyy')}</td>
                        <td className="p-4 text-end">{rowMenu(user, filteredUsers.length > 3 && i >= filteredUsers.length - 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {selectedUser && (
        <UserDetail
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onDelete={() => handleDelete(selectedUser.id)}
          onStatus={(s) => setStatus(selectedUser, s)}
        />
      )}
    </>
  );
}

function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl min-w-0', wide && 'col-span-2')}>
      <div className="text-zinc-500 text-xs mb-1">{label}</div>
      <div className="font-semibold text-zinc-900 dark:text-white text-sm break-words">{children}</div>
    </div>
  );
}

function UserDetail({ user, onClose, onDelete, onStatus }: { user: Person; onClose: () => void; onDelete: () => void; onStatus: (s: Status) => void }) {
  const { data: o, isLoading, error } = useSWR<Overview>(`/users/${user.id}/overview`, fetcher);
  const att = o?.attendance ?? {};
  const attTotal = (att.PRESENT ?? 0) + (att.ABSENT ?? 0) + (att.LATE ?? 0) + (att.EXCUSED ?? 0);

  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${user.name}'s profile`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet-in tone-panel border border-zinc-200 dark:border-zinc-800 w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">User profile</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold text-zinc-900 dark:text-white break-words">{user.name}</div>
              <a href={`mailto:${user.email}`} className="text-sm text-indigo-500 break-all inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5 shrink-0" />{user.email}</a>
              {user.phone && <a href={`tel:${user.phone}`} className="block text-sm text-zinc-500"><Phone className="w-3.5 h-3.5 inline me-1" />{user.phone}</a>}
              <div className="mt-2 flex flex-wrap gap-1.5"><RoleBadge role={user.role} /><StatusBadge status={user.status} /></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {user.studentProfile && <Fact label="Department">{user.studentProfile.department || 'Not set'}</Fact>}
            {user.studentProfile && <Fact label="Year · GPA">Year {user.studentProfile.year} · {user.studentProfile.gpa ? user.studentProfile.gpa.toFixed(2) : 'no GPA yet'}</Fact>}
            {user.teacherProfile && <Fact label="Department">{user.teacherProfile.department || 'Not set'}</Fact>}
            {user.teacherProfile && <Fact label="Position">{user.teacherProfile.designation || 'Not set'}</Fact>}
            <Fact label="Last active">{user.lastSeenAt ? <span title={new Date(user.lastSeenAt).toLocaleString()}>{ago(user.lastSeenAt)}</span> : 'No activity recorded'}</Fact>
            <Fact label="Last sign-in">{isLoading ? '…' : o?.signIns[0] ? ago(o.signIns[0].createdAt) : 'None recorded'}</Fact>
            <Fact label="Member since"><Calendar className="w-3.5 h-3.5 inline me-1 -mt-0.5" />{format(new Date(user.createdAt), 'd MMMM yyyy')}</Fact>
            <Fact label="Registration">{user.onboardedAt ? `Completed ${format(new Date(user.onboardedAt), 'd MMM yyyy')}` : 'Not finished'}{user.accountType ? ` · ${cap(user.accountType)}` : ''}</Fact>
            <Fact label="Terms accepted">{user.termsAcceptedAt ? format(new Date(user.termsAcceptedAt), 'd MMM yyyy') : 'Not yet'}</Fact>
            <Fact label="Courses">{courseLine(user)}</Fact>
          </div>

          {isLoading ? (
            <div className="space-y-2"><div className="h-16 rounded-xl skeleton" /><div className="h-24 rounded-xl skeleton" /></div>
          ) : error || !o ? (
            <p className="text-sm text-rose-500">Could not load this person’s courses and activity.</p>
          ) : (
            <>
              {(user.role === 'TEACHER' || o.taught.length > 0) && (
                <section>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-indigo-500" /> Courses taught ({o.taught.length})</h3>
                  {o.taught.length ? (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800">
                      {o.taught.map((c) => (
                        <li key={c.id} className="px-3 py-2 text-sm flex flex-wrap justify-between gap-x-3">
                          <span className="text-zinc-900 dark:text-white min-w-0 break-words"><b>{c.code}</b> · {c.name}</span>
                          <span className="text-xs text-zinc-500">{cap(c.status)} · {c._count.enrollments} student{c._count.enrollments === 1 ? '' : 's'} · {c._count.quizzes} quiz{c._count.quizzes === 1 ? '' : 'zes'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-zinc-500">Not teaching any course.</p>}
                </section>
              )}

              {(user.role === 'STUDENT' || o.enrolled.length > 0) && (
                <section>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2 flex items-center gap-1.5"><GraduationCap className="w-4 h-4 text-indigo-500" /> Enrolled courses ({o.enrolled.length})</h3>
                  {o.enrolled.length ? (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800">
                      {o.enrolled.map((e) => (
                        <li key={e.course.id} className="px-3 py-2 text-sm flex flex-wrap justify-between gap-x-3">
                          <span className="text-zinc-900 dark:text-white min-w-0 break-words"><b>{e.course.code}</b> · {e.course.name}</span>
                          <span className="text-xs text-zinc-500">{e.course.teacher?.name ?? 'No teacher'} · since {format(new Date(e.enrolledAt), 'd MMM yyyy')}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-zinc-500">Not enrolled in any course.</p>}
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <Fact label="Quizzes submitted"><ClipboardCheck className="w-3.5 h-3.5 inline me-1 -mt-0.5" />{o.quizSubmissions}</Fact>
                    <Fact label="Attendance">{attTotal ? `${Math.round((((att.PRESENT ?? 0) + (att.LATE ?? 0)) / attTotal) * 100)}% present · ${att.ABSENT ?? 0} absent of ${attTotal}` : 'No records yet'}</Fact>
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2 flex items-center gap-1.5"><LogIn className="w-4 h-4 text-indigo-500" /> Recent sign-ins</h3>
                {o.signIns.length ? (
                  <ul className="space-y-1.5">
                    {o.signIns.map((s, i) => (
                      <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300 flex flex-wrap gap-x-2">
                        <span>{format(new Date(s.createdAt), 'd MMM yyyy, HH:mm')}</span>
                        <span className="text-zinc-500">{[s.kind === 'SIGN_UP' ? 'signed up' : null, s.method, s.device, [s.city, s.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-zinc-500">No sign-ins recorded.</p>}
              </section>

              {o.applications.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Applications</h3>
                  <ul className="space-y-1.5">
                    {o.applications.map((a) => (
                      <li key={a.id} className="text-sm text-zinc-700 dark:text-zinc-300">
                        <Link href={`/admin/approvals?id=${a.id}`} className="text-indigo-500 hover:underline">{ROLE_LABEL[a.requestedRole]} access</Link>
                        <span className="text-zinc-500"> · {cap(a.status.replace('_', ' '))}{a.submittedAt ? ` · sent ${format(new Date(a.submittedAt), 'd MMM yyyy')}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-3">
            <button onClick={onDelete} className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-400 transition-colors">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
            {user.status !== 'SUSPENDED' ? (
              <button onClick={() => onStatus('SUSPENDED')} className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400"><UserX className="w-4 h-4" /> Deactivate</button>
            ) : (
              <button onClick={() => onStatus('ACTIVE')} className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400"><UserCheck className="w-4 h-4" /> Reactivate</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">Close</button>
            <a href={`mailto:${user.email}`} className="btn-primary"><Mail className="w-4 h-4" /> Email</a>
          </div>
        </div>
      </div>
    </div>
  );
}
