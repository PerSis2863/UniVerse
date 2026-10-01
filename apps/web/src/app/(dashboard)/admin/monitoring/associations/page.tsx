'use client';

import { Topbar } from '@/components/layout/Topbar';
import { useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Crown, Users } from 'lucide-react';
import { format } from 'date-fns';
import useSWR from 'swr';
import { api, fetcher } from '@/lib/fetcher';
import { isSampleMode } from '@/lib/sample-mode';
import { toast } from 'sonner';
import { ManageAssociationModal } from './ManageAssociationModal';
import { AdminSearch, PersonCell, matchesQuery, personText, type PersonInfo } from '@/components/admin/AdminPeople';

interface Association {
  id: string; name: string; category: string; description: string; members: number; status: string; budget: number;
  createdAt?: string; _count?: { memberships: number };
}
type Member = PersonInfo & { studentProfile?: { department: string | null; year: number } | null };
interface Membership { id: string; role: string; joinedAt: string; associationId: string; user: Member }

const STATUS_FILTERS = ['ALL', 'PENDING', 'ACTIVE', 'REJECTED'] as const;
const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
const fmtDate = (v?: string) => (v ? format(new Date(v), 'd MMM yyyy') : '—');

/** Every membership with member details (admin only). Not available in sample mode. */
async function loadMembers(): Promise<Membership[] | null> {
  if (isSampleMode()) return null;
  try {
    return (await api.get<Membership[]>('/associations/admin/members')).data;
  } catch {
    return null;
  }
}

function memberFacts(m: Membership) {
  const sp = m.user.studentProfile;
  return [humanize(m.role), sp?.department, sp?.year ? `Year ${sp.year}` : null, `Joined ${fmtDate(m.joinedAt)}`].filter(Boolean).join(' · ');
}

export default function AdminAssociationsMonitoringPage() {
  const { data: associationsData, isLoading, mutate } = useSWR<Association[]>('/associations', fetcher);
  const { data: membershipData, isLoading: membersLoading } = useSWR('admin-association-members', loadMembers);
  const [managingAssociation, setManagingAssociation] = useState<Association | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('ALL');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const allAssociations = useMemo(() => (Array.isArray(associationsData) ? associationsData : []), [associationsData]);
  const memberships = useMemo(() => membershipData ?? [], [membershipData]);
  const membersByAssoc = useMemo(() => {
    const map = new Map<string, Membership[]>();
    for (const m of memberships) map.set(m.associationId, [...(map.get(m.associationId) ?? []), m]);
    return map;
  }, [memberships]);
  const assocName = useMemo(() => new Map(allAssociations.map((a) => [a.id, a.name])), [allAssociations]);
  const pendingCount = allAssociations.filter((a) => a.status === 'PENDING').length;

  const associations = useMemo(() => allAssociations.filter((a) =>
    (statusFilter === 'ALL' || a.status === statusFilter) &&
    matchesQuery(q, a.name, a.category, a.description, a.status, (membersByAssoc.get(a.id) ?? []).flatMap((m) => [...personText(m.user), m.role])),
  ), [allAssociations, statusFilter, q, membersByAssoc]);

  // One row per person with every association they belong to.
  const people = useMemo(() => {
    const map = new Map<string, { user: Member; clubs: Membership[] }>();
    for (const m of memberships) {
      const row = map.get(m.user.id ?? m.id) ?? { user: m.user, clubs: [] };
      row.clubs.push(m);
      map.set(m.user.id ?? m.id, row);
    }
    return [...map.values()]
      .filter((p) => matchesQuery(q, personText(p.user), p.user.studentProfile?.department, p.clubs.flatMap((c) => [assocName.get(c.associationId), c.role])))
      .sort((a, b) => (a.user.name ?? '').localeCompare(b.user.name ?? ''));
  }, [memberships, q, assocName]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/associations/${id}/status`, { status });
      toast.success(`Association ${status.toLowerCase()} successfully`);
      mutate();
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to update status');
    }
  };

  return (
    <>
      <Topbar title="Associations Monitoring" subtitle="Student clubs and societies, and every member in them" />

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Registered Associations</h2>
              <div className="flex flex-wrap gap-1">
                {STATUS_FILTERS.map((s) => (
                  <button key={s} onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${statusFilter === s ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'}`}>
                    {s === 'ALL' ? 'All' : humanize(s)}{s === 'PENDING' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </button>
                ))}
              </div>
            </div>
            <AdminSearch value={q} onChange={setQ} placeholder="Search associations or members (name, email, role)…" shown={associations.length} total={allAssociations.length} />
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-zinc-500">Loading associations...</div>
          ) : allAssociations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-sm text-zinc-500">No associations have been created yet.</div>
          ) : associations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-sm text-zinc-500">No associations match your search.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
              {associations.map((assoc) => {
                const members = membersByAssoc.get(assoc.id);
                const count = assoc._count?.memberships ?? assoc.members;
                const founders = (members ?? []).filter((m) => m.role === 'FOUNDER');
                const nameMatch = matchesQuery(q, assoc.name, assoc.category, assoc.description, assoc.status);
                const shownMembers = members && q.trim() && !nameMatch ? members.filter((m) => matchesQuery(q, personText(m.user), m.role)) : members;
                const isOpen = openId === assoc.id || (!!q.trim() && !nameMatch);
                return (
                  <div key={assoc.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl relative overflow-hidden">
                    <div className="p-5 sm:p-6">
                      {assoc.status === 'PENDING' && (
                        <div className="absolute top-0 right-0 p-2 text-amber-500" title="Waiting for review">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                      )}
                      <h3 className="font-semibold text-zinc-900 dark:text-white pr-6">{assoc.name}</h3>
                      <p className="text-xs text-zinc-500 mb-4">{assoc.category}{assoc.createdAt ? ` · Created ${fmtDate(assoc.createdAt)}` : ''}</p>

                      <div className="space-y-2 mb-4 text-sm">
                        <div className="flex justify-between"><span className="text-zinc-500">Members</span><span className="text-zinc-800 dark:text-zinc-300 tabular-nums">{count}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Allocated Budget</span><span className="text-zinc-800 dark:text-zinc-300 tabular-nums">${assoc.budget || 0}</span></div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Status</span>
                          <span className={assoc.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : assoc.status === 'REJECTED' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}>{humanize(assoc.status)}</span>
                        </div>
                      </div>

                      {founders.length > 0 && (
                        <div className="mb-4 rounded-lg bg-zinc-50 dark:bg-zinc-950/40 p-3 space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 inline-flex items-center gap-1"><Crown className="w-3 h-3" /> Founder</p>
                          {founders.map((f) => <PersonCell key={f.id} person={f.user} />)}
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <button onClick={() => setOpenId(openId === assoc.id ? null : assoc.id)} disabled={!members} aria-expanded={isOpen} className="btn-secondary btn-sm w-full">
                          <Users className="w-4 h-4" /> {members ? `${members.length} member${members.length === 1 ? '' : 's'}` : membersLoading ? 'Loading members…' : 'Member details unavailable'}
                          {members && <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                        </button>
                        {assoc.status === 'PENDING' ? (
                          <div className="flex gap-2">
                            <button onClick={() => updateStatus(assoc.id, 'ACTIVE')} className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 py-2 rounded-lg text-sm font-medium transition-colors">Approve</button>
                            <button onClick={() => updateStatus(assoc.id, 'REJECTED')} className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 py-2 rounded-lg text-sm font-medium transition-colors">Reject</button>
                          </div>
                        ) : (
                          <button onClick={() => setManagingAssociation(assoc)} className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white py-2 rounded-lg text-sm font-medium transition-colors">
                            Manage Association
                          </button>
                        )}
                      </div>
                    </div>

                    {isOpen && members && (
                      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/30 max-h-96 overflow-y-auto">
                        {shownMembers && shownMembers.length > 0 ? (
                          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                            {shownMembers.map((m) => (
                              <li key={m.id} className="p-4"><PersonCell person={m.user} extra={memberFacts(m)} /></li>
                            ))}
                          </ul>
                        ) : <p className="p-4 text-sm text-zinc-500">No members yet.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {membershipData !== null && (
            <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                <h2 className="font-semibold text-zinc-900 dark:text-white">Members directory <span className="text-xs font-medium text-zinc-500">({people.length})</span></h2>
                <p className="text-xs text-zinc-500">Everyone in a club, with their role in each association</p>
              </div>
              {membersLoading ? <p className="p-6 text-sm text-zinc-500">Loading members…</p>
                : memberships.length === 0 ? <p className="p-6 text-sm text-zinc-500">No one has joined an association yet.</p>
                : people.length === 0 ? <p className="p-6 text-sm text-zinc-500">No members match your search.</p>
                : (
                  <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                    {people.map((p) => (
                      <li key={p.user.id ?? p.clubs[0].id} className="p-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center">
                        <PersonCell person={p.user} extra={[p.user.studentProfile?.department, p.user.studentProfile?.year ? `Year ${p.user.studentProfile.year}` : null].filter(Boolean).join(' · ') || null} />
                        <div className="flex flex-wrap gap-1.5">
                          {p.clubs.map((c) => (
                            <span key={c.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-white/[0.05] text-xs text-zinc-700 dark:text-zinc-300">
                              {assocName.get(c.associationId) ?? 'Unknown association'}
                              <span className="text-zinc-500">· {humanize(c.role)}</span>
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          )}
        </div>
      </div>

      {managingAssociation && (
        <ManageAssociationModal
          association={managingAssociation}
          onClose={() => setManagingAssociation(null)}
          onSuccess={() => {
            setManagingAssociation(null);
            mutate();
          }}
        />
      )}
    </>
  );
}
