'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Plus, Edit2, Trash2, X, Briefcase, MapPin, Building, Calendar, DollarSign, Users, ChevronDown, FileText, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import useSWR from 'swr';
import { api } from '@/lib/fetcher';
import { confirmDialog } from '@/components/ui/Dialogs';
import { safeHref } from '@/lib/safe-href';
import { isSampleMode } from '@/lib/sample-mode';
import { AdminSearch, PersonCell, matchesQuery, personText, type PersonInfo } from '@/components/admin/AdminPeople';
import { TabPill } from '@/components/ui/Glide';

type StudentPerson = PersonInfo & { studentProfile?: { department: string | null; year: number; gpa: number } | null };
interface Applicant { id: string; status: string; appliedAt: string; cvUrl?: string | null; student: StudentPerson }
interface Internship {
  id: string; title: string; description?: string; type?: string; location?: string | null; duration?: string | null;
  isPaid?: boolean; salary?: string | null; openings?: number; deadline?: string | null; isActive: boolean; createdAt?: string;
  company?: { name: string } | null; postedBy?: PersonInfo | null; _count?: { applications: number }; applications?: Applicant[];
}

const TYPES = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'REMOTE', label: 'Remote' },
  { value: 'HYBRID', label: 'Hybrid' },
];
const typeLabel = (t?: string) => TYPES.find((x) => x.value === t)?.label ?? t ?? 'Internship';
const APP_STATUSES = ['PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED'] as const;
const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
const fmtDate = (v?: string | null) => (v ? format(new Date(v), 'd MMM yyyy') : 'N/A');
const field = 'w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors';
const label = 'text-sm font-medium text-zinc-600 dark:text-zinc-400';

const EMPTY_FORM = { title: '', company: '', description: '', location: '', type: 'FULL_TIME', duration: '', salary: '', deadline: '', status: 'Active' };

/** Admin overview (with applicants); falls back to the public list if it isn't available. */
async function loadInternships(): Promise<Internship[]> {
  if (isSampleMode()) return (await api.get<Internship[]>('/internships')).data;
  try {
    return (await api.get<Internship[]>('/internships/admin/overview')).data;
  } catch {
    return (await api.get<Internship[]>('/internships')).data;
  }
}

function studentFacts(p?: StudentPerson | null) {
  const sp = p?.studentProfile;
  if (!sp) return null;
  return [sp.department, sp.year ? `Year ${sp.year}` : null, sp.gpa > 0 ? `GPA ${sp.gpa.toFixed(2)}` : null].filter(Boolean).join(' · ') || null;
}

const statusTone = (s: string) =>
  s === 'ACCEPTED' ? 'text-emerald-600 dark:text-emerald-400' : s === 'REJECTED' ? 'text-rose-600 dark:text-rose-400' : s === 'REVIEWING' ? 'text-indigo-600 dark:text-indigo-400' : s === 'WITHDRAWN' ? 'text-zinc-500' : 'text-amber-600 dark:text-amber-400';

export default function AdminInternshipsPage() {
  const { data, mutate, isLoading, error } = useSWR<Internship[]>('admin-internships-overview', loadInternships);
  const internships = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const filtered = useMemo(() => internships.filter((i) => {
    if (statusFilter === 'active' && !i.isActive) return false;
    if (statusFilter === 'closed' && i.isActive) return false;
    return matchesQuery(q, i.title, i.company?.name, i.location, typeLabel(i.type), i.duration, i.salary, personText(i.postedBy),
      (i.applications ?? []).flatMap((a) => [...personText(a.student), a.status, studentFacts(a.student)]));
  }), [internships, q, statusFilter]);

  const totals = useMemo(() => {
    const apps = internships.flatMap((i) => i.applications ?? []);
    return {
      postings: internships.length,
      active: internships.filter((i) => i.isActive).length,
      applicants: internships.reduce((n, i) => n + (i._count?.applications ?? i.applications?.length ?? 0), 0),
      students: new Set(apps.map((a) => a.student?.id).filter(Boolean)).size,
      accepted: apps.filter((a) => a.status === 'ACCEPTED').length,
    };
  }, [internships]);

  const handleOpenModal = (id: string | null = null) => {
    const item = id ? internships.find((i) => i.id === id) : null;
    setFormData(item ? {
      title: item.title,
      company: item.company?.name ?? '',
      description: item.description ?? '',
      location: item.location ?? '',
      type: item.type ?? 'FULL_TIME',
      duration: item.duration ?? '',
      salary: item.salary ?? '',
      deadline: item.deadline ? item.deadline.slice(0, 10) : '',
      status: item.isActive ? 'Active' : 'Closed',
    } : EMPTY_FORM);
    setEditingId(item ? item.id : null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { status, deadline, ...rest } = formData;
    const body = { ...rest, isActive: status === 'Active', deadline: deadline ? new Date(deadline).toISOString() : null, isPaid: !/unpaid/i.test(rest.salary) };
    try {
      if (editingId) {
        await api.patch(`/internships/${editingId}`, body);
        toast.success('Internship updated successfully');
      } else {
        await api.post('/internships', body);
        toast.success('New internship added');
      }
      mutate();
      setIsModalOpen(false);
    } catch {
      toast.error('Failed to save internship');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (i: Internship) => {
    if (!(await confirmDialog({ title: `Delete "${i.title}"?`, message: 'Its applications are deleted too.', destructive: true }))) return;
    try {
      await api.delete(`/internships/${i.id}`);
      toast.success('Internship deleted successfully');
      mutate();
    } catch {
      toast.error('Failed to delete internship');
    }
  };

  const setApplicationStatus = async (appId: string, status: string) => {
    try {
      await api.patch(`/internships/applications/${appId}`, { status });
      mutate((cur) => cur?.map((i) => ({ ...i, applications: i.applications?.map((a) => (a.id === appId ? { ...a, status } : a)) })), { revalidate: false });
      toast.success(`Application marked ${status.toLowerCase()}`);
    } catch {
      toast.error('Could not update the application');
    }
  };

  return (
    <>
      <Topbar
        title="Internships & Career"
        subtitle="Job postings, who posted them and every student who applied"
        rightNode={
          <button onClick={() => handleOpenModal()} className="btn-primary">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add</span> Opportunity
          </button>
        }
      />

      {isModalOpen && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="sheet-in tone-panel border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{editingId ? 'Edit Opportunity' : 'Add Opportunity'}</h2>
              <button onClick={() => setIsModalOpen(false)} aria-label="Close" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <label className={label}>Job Title</label>
                  <input required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} type="text" className={field} placeholder="e.g. Software Engineering Intern" />
                </div>
                <div className="space-y-2">
                  <label className={label}>Company</label>
                  <input required value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} type="text" className={field} placeholder="e.g. Google" />
                </div>
                <div className="space-y-2">
                  <label className={label}>Location</label>
                  <input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} type="text" className={field} placeholder="e.g. Remote or Mountain View, CA" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className={label}>Description</label>
                  <textarea required value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className={`${field} min-h-[80px]`} placeholder="What the intern will do" />
                </div>
                <div className="space-y-2">
                  <label className={label}>Type</label>
                  <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className={field}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className={label}>Duration</label>
                  <input value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })} type="text" className={field} placeholder="e.g. 12 weeks" />
                </div>
                <div className="space-y-2">
                  <label className={label}>Stipend / Pay</label>
                  <input value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} type="text" className={field} placeholder="e.g. $8,000/mo or Unpaid" />
                </div>
                <div className="space-y-2">
                  <label className={label}>Deadline</label>
                  <input value={formData.deadline} onChange={(e) => setFormData({ ...formData, deadline: e.target.value })} type="date" className={field} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className={label}>Status</label>
                  <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className={field}>
                    <option value="Active">Active</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Opportunity</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Postings', value: totals.postings, sub: `${totals.active} active` },
              { label: 'Applications', value: totals.applicants },
              { label: 'Students applying', value: totals.students },
              { label: 'Accepted', value: totals.accepted },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4">
                <p className="text-2xl font-bold text-zinc-900 dark:text-white tabular-nums">{s.value}</p>
                <p className="text-xs text-zinc-500">{s.label}{s.sub ? ` · ${s.sub}` : ''}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <AdminSearch className="flex-1" value={q} onChange={setQ} placeholder="Search title, company, poster, or applicant name/email…" shown={filtered.length} total={internships.length} />
            <div className="flex gap-1 shrink-0">
              {(['all', 'active', 'closed'] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s}
                  className={`relative isolate px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${statusFilter === s ? 'text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'}`}>{statusFilter === s && <TabPill id="pill-2-0" />}
                  {humanize(s)}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-rose-500">Could not load internships.</p>}
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{[0, 1].map((i) => <div key={i} className="h-56 rounded-xl skeleton" />)}</div>
          ) : internships.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-sm text-zinc-500">No internships have been posted yet.</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-sm text-zinc-500">No internships or applicants match your search.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {filtered.map((internship) => {
                const apps = internship.applications;
                const count = internship._count?.applications ?? apps?.length ?? 0;
                const titleMatch = matchesQuery(q, internship.title, internship.company?.name, internship.location, personText(internship.postedBy));
                const shownApps = apps && q.trim() && !titleMatch ? apps.filter((a) => matchesQuery(q, personText(a.student), a.status, studentFacts(a.student))) : apps;
                const isOpen = openId === internship.id || (!!q.trim() && !titleMatch);
                return (
                  <div key={internship.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-5 sm:p-6 flex flex-col">
                      <div className="flex justify-between items-start gap-3 mb-4">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1 break-words">{internship.title}</h3>
                          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                            <Building className="w-4 h-4 shrink-0" />
                            <span className="truncate">{internship.company?.name ?? 'Unknown company'}</span>
                          </div>
                        </div>
                        <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                          internship.isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20'
                        }`}>
                          {internship.isActive ? 'Active' : 'Closed'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4 text-sm text-zinc-700 dark:text-zinc-300">
                        <div className="flex items-center gap-2 min-w-0"><MapPin className="w-4 h-4 shrink-0 text-zinc-500" /><span className="truncate">{internship.location || 'Not specified'}</span></div>
                        <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 shrink-0 text-zinc-500" />{typeLabel(internship.type)}</div>
                        <div className="flex items-center gap-2"><Calendar className="w-4 h-4 shrink-0 text-zinc-500" />{internship.duration || 'N/A'}</div>
                        <div className="flex items-center gap-2 min-w-0"><DollarSign className="w-4 h-4 shrink-0 text-zinc-500" /><span className="truncate">{internship.salary || (internship.isPaid === false ? 'Unpaid' : 'Not specified')}</span></div>
                      </div>

                      {internship.postedBy !== undefined && (
                        <div className="mb-4 rounded-lg bg-zinc-50 dark:bg-zinc-950/40 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">Posted by</p>
                          {internship.postedBy ? <PersonCell person={internship.postedBy} /> : <p className="text-sm text-zinc-500">Not recorded</p>}
                        </div>
                      )}

                      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap justify-between items-center gap-3">
                        <div className="text-xs text-zinc-500">
                          Deadline: <span className="text-zinc-700 dark:text-zinc-300">{fmtDate(internship.deadline)}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setOpenId(openId === internship.id ? null : internship.id)} disabled={!apps} aria-expanded={isOpen} className="btn-secondary btn-sm">
                            <Users className="w-4 h-4" /> {count} applicant{count === 1 ? '' : 's'}
                            {apps && <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                          </button>
                          <button onClick={() => handleOpenModal(internship.id)} className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors" aria-label="Edit">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(internship)} className="p-2 text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors" aria-label="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {isOpen && apps && (
                      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/30">
                        {shownApps && shownApps.length > 0 ? (
                          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                            {shownApps.map((a) => (
                              <li key={a.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                                <PersonCell className="flex-1" person={a.student} extra={
                                  <span className="flex flex-wrap items-center gap-x-2">
                                    {studentFacts(a.student) && <span>{studentFacts(a.student)} ·</span>}
                                    <span>Applied {fmtDate(a.appliedAt)}</span>
                                    {a.cvUrl && <a href={safeHref(a.cvUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-500 hover:underline"><FileText className="w-3 h-3" />CV</a>}
                                  </span>
                                } />
                                {a.status === 'WITHDRAWN' ? (
                                  <span className={`text-xs font-semibold ${statusTone(a.status)}`}>Withdrawn</span>
                                ) : (
                                  <select value={a.status} onChange={(e) => setApplicationStatus(a.id, e.target.value)} aria-label={`Status for ${a.student?.name ?? 'applicant'}`}
                                    className={`rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-medium ${statusTone(a.status)}`}>
                                    {APP_STATUSES.map((st) => <option key={st} value={st}>{humanize(st)}</option>)}
                                  </select>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : <p className="p-4 text-sm text-zinc-500">No one has applied yet.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
