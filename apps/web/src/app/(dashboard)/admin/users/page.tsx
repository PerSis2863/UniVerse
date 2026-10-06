'use client';
import { confirmDialog } from '@/components/ui/Dialogs';

import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Search, Filter, MoreVertical, UserCheck, UserX, Shield, Clock,
  GraduationCap, User, ChevronDown, X, Mail, Calendar, Trash2, Phone, BookOpen, Loader2, LogIn, ClipboardCheck,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import { TabPill } from '@/components/ui/Glide';

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

  const rowMenu = (user: Person, up = false) => (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
        aria-label={`Actions for ${user.name}`}
        className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {openMenuId === user.id && (
        <div className={cn('absolute right-0 z-30 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl w-44 py-1 text-left animate-in fade-in duration-150', up ? 'bottom-10' : 'top-10')}>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400" />
            <input
              type="text"
              placeholder="Search name, email, phone or department…"
              aria-label="Search users"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"><X className="w-4 h-4" /></button>
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
              <div className="absolute right-0 top-11 z-30 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl w-48 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                {ROLE_FILTERS.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRoleFilter(r); setShowFilterDropdown(false); }}
                    className={cn('relative isolate w-full flex justify-between text-left px-4 py-2 text-sm transition-colors', roleFilter === r ? 'text-indigo-500' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800')}
                  >{roleFilter === r && <TabPill id="p-dashboard-admin-users-page-0" variant="soft" />}
                    <span>{r === 'All' ? 'All roles' : `${ROLE_LABEL[r]}s`}</span>
                    <span className="text-zinc-400">{roleCounts[r] ?? 0}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {(filtersOn || truncated) && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {searching ? 'Searching all accounts…' : <>Showing <strong className="text-zinc-900 dark:text-white">{filteredUsers.length}</strong> of {truncated && debounced ? `${users.length} matching` : users.length} users</>}
            {truncated && !debounced && ` (the newest ${LIST_CAP.toLocaleString()}; search to find anyone else)`}
          </p>
        )}

        {/* People */}
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-zinc-500">Loading users…</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">{filtersOn ? 'No users match these filters.' : 'No users yet.'}</div>
          ) : (
            <>
              {/* Phones: cards */}
              <ul className="md:hidden divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {filteredUsers.map((user) => (
                  <li key={user.id} className="p-4 flex gap-3">
                    <button onClick={() => setSelectedUser(user)} className="flex-1 min-w-0 flex gap-3 text-left">
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
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                      <th className="p-4">User</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Courses</th>
                      <th className="p-4">Last active</th>
                      <th className="p-4">Joined</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                    {filteredUsers.map((user, i) => (
                      <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="p-4">
                          <button onClick={() => setSelectedUser(user)} className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity">
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
                        <td className="p-4 text-right">{rowMenu(user, filteredUsers.length > 3 && i >= filteredUsers.length - 2)}</td>
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
              {user.phone && <a href={`tel:${user.phone}`} className="block text-sm text-zinc-500"><Phone className="w-3.5 h-3.5 inline mr-1" />{user.phone}</a>}
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
            <Fact label="Member since"><Calendar className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />{format(new Date(user.createdAt), 'd MMMM yyyy')}</Fact>
            <Fact label="Registration">{user.onboardedAt ? `Completed ${format(new Date(user.onboardedAt), 'd MMM yyyy')}` : 'Not finished'}{user.accountType ? ` · ${cap(user.accountType)}` : ''}</Fact>
            <Fact label="Terms accepted">{user.termsAcceptedAt ? format(new Date(user.termsAcceptedAt), 'd MMM yyyy') : 'Not yet'}</Fact>
            <Fact label="Courses">{courseLine(user)}</Fact>
          </div>

          {isLoading ? (
            <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
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
                    <Fact label="Quizzes submitted"><ClipboardCheck className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />{o.quizSubmissions}</Fact>
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
                        <a href={`/admin/approvals?id=${a.id}`} className="text-indigo-500 hover:underline">{ROLE_LABEL[a.requestedRole]} access</a>
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
