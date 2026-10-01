'use client';
import { confirmDialog } from '@/components/ui/Dialogs';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { PlusCircle, CheckCircle, XCircle, ExternalLink, Loader2, Handshake, Trash2, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { safeHref } from '@/lib/safe-href';
import { SearchBox, matchesQuery, RoleChip, StatusChip, fmtDate, ROLE_LABEL } from '@/components/impact/AdminPeople';

interface Partner {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  websiteUrl?: string | null;
  country?: string | null;
  createdAt?: string;
  partnerships?: { id: string; title?: string; isActive?: boolean }[];
}

interface Person { id: string; name: string; email?: string; role?: string; status?: string }
interface Project {
  id: string;
  title: string;
  description?: string | null;
  partner?: string | null;
  ngo?: string | null;
  status: string;
  deadline?: string | null;
  contactEmail?: string | null;
  createdAt?: string;
  supervisingTeacher?: (Person & { teacherProfile?: { department: string | null; designation: string | null } | null }) | null;
  ngoProject?: { name: string; ngo?: { name: string } | null } | null;
  members?: { role: string; joinedAt: string; user: Person }[];
  _count?: { members?: number; milestones?: number };
}

const STATUS_STYLE: Record<string, string> = {
  PendingReview: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Recruiting: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  Active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  Completed: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  Rejected: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
};
const STATUS_LABEL: Record<string, string> = { PendingReview: 'Pending review' };

const TYPES = [
  { value: 'ACADEMIC', label: 'University / college' },
  { value: 'NGO', label: 'NGO / non-profit' },
  { value: 'CORPORATE', label: 'Company' },
  { value: 'GOVERNMENT', label: 'Government body' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

const input = 'w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500';

export default function AdminPartnershipsPage() {
  const { data: partnersData, isLoading: partnersLoading, mutate: refreshPartners } = useSWR<Partner[]>('/partners', fetcher);
  const { data: projects, isLoading: projectsLoading, mutate } = useSWR<Project[]>('/collaborations/projects', fetcher);
  const partners = useMemo(() => (Array.isArray(partnersData) ? partnersData : []), [partnersData]);
  const allProjects = useMemo(() => (Array.isArray(projects) ? projects : []), [projects]);
  const [q, setQ] = useState('');

  const shownPartners = useMemo(
    () => partners.filter((p) => matchesQuery(q, p.name, TYPE_LABEL[p.type] ?? p.type, p.country, p.description, p.websiteUrl, ...(p.partnerships ?? []).map((x) => x.title))),
    [partners, q],
  );
  const shownProjects = useMemo(
    () => allProjects.filter((p) => matchesQuery(
      q, p.title, p.description, p.partner, p.ngo, p.contactEmail, STATUS_LABEL[p.status] ?? p.status, p.ngoProject?.name, p.ngoProject?.ngo?.name,
      p.supervisingTeacher?.name, p.supervisingTeacher?.email, p.supervisingTeacher?.teacherProfile?.department,
      ...(p.members ?? []).flatMap((m) => [m.user?.name, m.user?.email]),
    )),
    [allProjects, q],
  );
  const pendingProjects = shownProjects.filter((p) => p.status === 'PendingReview');
  const otherProjects = shownProjects.filter((p) => p.status !== 'PendingReview');

  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'ACADEMIC', country: '', websiteUrl: '', description: '' });

  const addPartner = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/partners', {
        name: form.name.trim(),
        type: form.type,
        country: form.country.trim() || null,
        websiteUrl: form.websiteUrl.trim() || null,
        description: form.description.trim() || null,
      });
      toast.success(`${form.name.trim()} added`);
      setShowAddModal(false);
      setForm({ name: '', type: 'ACADEMIC', country: '', websiteUrl: '', description: '' });
      refreshPartners();
    } catch {
      toast.error('Could not add the partner. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const removePartner = async (p: Partner) => {
    if (!(await confirmDialog({ title: `Remove ${p.name}?`, message: 'They will be taken off the partner list.', confirmLabel: 'Remove', destructive: true }))) return;
    try {
      await api.patch(`/partners/${p.id}`, { isActive: false });
      toast.success(`${p.name} removed`);
      refreshPartners();
    } catch {
      toast.error('Could not remove the partner.');
    }
  };

  const handleReviewProject = async (id: string, status: string) => {
    try {
      await api.patch(`/collaborations/projects/${id}/review`, { status });
      mutate();
      toast.success(`Project ${status === 'Active' ? 'approved' : 'rejected'}`);
    } catch {
      toast.error('Failed to update project status');
    }
  };

  const stats = [
    { label: 'Partner organizations', value: partners.length },
    { label: 'Universities', value: partners.filter((p) => p.type === 'ACADEMIC').length },
    { label: 'NGOs', value: partners.filter((p) => p.type === 'NGO').length },
    { label: 'Countries', value: new Set(partners.map((p) => p.country).filter(Boolean)).size },
  ];
  const filtering = q.trim().length > 0;

  return (
    <>
      <Topbar
        title="Partners & Collaborations"
        subtitle="Manage partner organizations and review collaboration proposals"
        rightNode={
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary btn-sm"
          >
            <PlusCircle className="w-4 h-4" /> Add partner
          </button>
        }
      />

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search partners, projects, teachers or students…"
            summary={filtering ? `${shownPartners.length} of ${partners.length} partners · ${shownProjects.length} of ${allProjects.length} projects` : undefined}
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl">
                <div className="text-xs text-zinc-600 dark:text-zinc-400 font-medium mb-1">{s.label}</div>
                <div className="text-3xl font-black text-zinc-900 dark:text-white tabular-nums">{partnersLoading ? '–' : s.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Partner organizations</h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Shown to students on the Partner Network page.</p>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
              {partnersLoading ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
              ) : partners.length > 0 && shownPartners.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-500">No partners match “{q}”.</div>
              ) : partners.length === 0 ? (
                <div className="p-10 text-center">
                  <Handshake className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                  <p className="font-semibold text-zinc-900 dark:text-white">No partners yet</p>
                  <p className="text-sm text-zinc-500 mt-1">Add the universities, NGOs and companies you work with.</p>
                </div>
              ) : (
                shownPartners.map((p) => (
                  <div key={p.id} className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <div className="space-y-1 max-w-xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-zinc-900 dark:text-white">{p.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                          {TYPE_LABEL[p.type] ?? p.type}
                        </span>
                      </div>
                      {p.description && <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">{p.description}</p>}
                      <div className="flex flex-wrap gap-4 text-xs text-zinc-500 pt-1">
                        {p.country && <span>{p.country}</span>}
                        <span>{p.partnerships?.length ?? 0} partnership{p.partnerships?.length === 1 ? '' : 's'}{p.partnerships?.some((x) => x.isActive === false) ? ` (${p.partnerships.filter((x) => x.isActive !== false).length} active)` : ''}</span>
                        {fmtDate(p.createdAt) && <span>Added {fmtDate(p.createdAt)}</span>}
                        {p.websiteUrl && (
                          <a href={safeHref(p.websiteUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-500 hover:text-indigo-400">
                            Website <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removePartner(p)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Pending project proposals</h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Teacher-submitted research and NGO collaborations awaiting review.</p>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
              {projectsLoading ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
              ) : pendingProjects.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-500">{filtering ? `No pending projects match “${q}”.` : 'No pending projects to review.'}</div>
              ) : pendingProjects.map((project) => (
                <ProjectRow key={project.id} project={project}>
                  <button onClick={() => handleReviewProject(project.id, 'Rejected')} className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600/10 text-red-600 dark:text-red-400 hover:bg-red-600/20 transition-colors flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <button onClick={() => handleReviewProject(project.id, 'Active')} className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                </ProjectRow>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">All other projects</h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Approved, recruiting, completed and rejected projects with their supervising teacher and members.</p>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
              {projectsLoading ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
              ) : otherProjects.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-500">{filtering ? `No projects match “${q}”.` : 'No reviewed projects yet.'}</div>
              ) : otherProjects.map((project) => <ProjectRow key={project.id} project={project} />)}
            </div>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => !saving && setShowAddModal(false)}>
          <div className="sheet-in bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl p-6 sm:p-8 space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Add a partner</h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Add an organization you actually work with. Students will see it on the Partner Network page.</p>
            </div>
            <div className="space-y-3">
              <input className={input} placeholder="Organization name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input className={input} placeholder="Country (optional)" value={form.country} maxLength={60} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                <input className={input} placeholder="Website (optional)" type="url" value={form.websiteUrl} maxLength={200} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} />
              </div>
              <textarea className={`${input} min-h-[90px]`} placeholder="What you work on together (optional)" value={form.description} maxLength={600} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowAddModal(false)} aria-busy={saving || undefined} disabled={saving} className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">Cancel</button>
              <button onClick={addPartner} disabled={saving || !form.name.trim()} className="btn-primary btn-sm">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add partner
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectRow({ project, children }: { project: Project; children?: React.ReactNode }) {
  const t = project.supervisingTeacher;
  const members = project.members ?? [];
  const memberCount = project._count?.members ?? members.length;
  return (
    <div className="p-4 sm:p-6 flex flex-col md:flex-row items-start justify-between gap-4">
      <div className="space-y-1.5 min-w-0 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-bold text-zinc-900 dark:text-white">{project.title}</h4>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[project.status] ?? 'bg-zinc-500/10 text-zinc-500'}`}>{STATUS_LABEL[project.status] ?? project.status}</span>
        </div>
        <div className="text-xs text-zinc-600 dark:text-zinc-400">{project.description || 'No description provided'}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 pt-1">
          {project.partner && <span>Partner: <strong className="text-zinc-700 dark:text-zinc-300">{project.partner}</strong></span>}
          {project.ngo && <span>NGO: <strong className="text-zinc-700 dark:text-zinc-300">{project.ngo}</strong></span>}
          {project.ngoProject && <span>NGO project: <strong className="text-zinc-700 dark:text-zinc-300">{project.ngoProject.name}{project.ngoProject.ngo?.name ? ` (${project.ngoProject.ngo.name})` : ''}</strong></span>}
          {fmtDate(project.deadline) && <span>Deadline {fmtDate(project.deadline)}</span>}
          {fmtDate(project.createdAt) && <span>Proposed {fmtDate(project.createdAt)}</span>}
          {typeof project._count?.milestones === 'number' && <span>{project._count.milestones} milestone{project._count.milestones === 1 ? '' : 's'}</span>}
          {project.contactEmail && <a href={`mailto:${project.contactEmail}`} className="text-indigo-500 hover:text-indigo-400 break-all">Contact: {project.contactEmail}</a>}
        </div>
        <div className="mt-2 rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
          <div className="text-xs">
            <span className="text-zinc-500">Supervisor: </span>
            {t ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <strong className="text-zinc-800 dark:text-zinc-200">{t.name}</strong>
                {t.email && <a href={`mailto:${t.email}`} className="text-zinc-500 hover:text-indigo-500 break-all">{t.email}</a>}
                <RoleChip role={t.role} />
                <StatusChip status={t.status} />
                {(t.teacherProfile?.designation || t.teacherProfile?.department) && (
                  <span className="text-zinc-500">{[t.teacherProfile?.designation, t.teacherProfile?.department].filter(Boolean).join(', ')}</span>
                )}
              </span>
            ) : (
              <span className="text-zinc-500">No supervising teacher recorded</span>
            )}
          </div>
          <div className="text-xs">
            <span className="inline-flex items-center gap-1 text-zinc-500"><Users className="w-3.5 h-3.5" /> {memberCount} member{memberCount === 1 ? '' : 's'}</span>
            {members.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {members.map((m) => (
                  <li key={m.user.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{m.user.name}</span>
                    {m.user.email && <a href={`mailto:${m.user.email}`} className="text-zinc-500 hover:text-indigo-500 break-all">{m.user.email}</a>}
                    <RoleChip role={m.user.role} />
                    {m.role && m.role !== m.user.role && <span className="text-zinc-500">as {ROLE_LABEL[m.role] ?? m.role}</span>}
                    {fmtDate(m.joinedAt) && <span className="text-zinc-400">· joined {fmtDate(m.joinedAt)}</span>}
                  </li>
                ))}
                {memberCount > members.length && <li className="text-zinc-500">and {memberCount - members.length} more</li>}
              </ul>
            )}
          </div>
        </div>
      </div>
      {children && <div className="flex items-center gap-3 shrink-0">{children}</div>}
    </div>
  );
}
