'use client';
import { confirmDialog } from '@/components/ui/Dialogs';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { PlusCircle, CheckCircle, XCircle, ExternalLink, Loader2, Handshake, Trash2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';

interface Partner {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  websiteUrl?: string | null;
  country?: string | null;
  partnerships?: { id: string }[];
}

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
  const { data: projects, mutate } = useSWR('/collaborations/projects', fetcher);
  const partners = Array.isArray(partnersData) ? partnersData : [];
  const pendingProjects = Array.isArray(projects) ? projects.filter((p: any) => p.status === 'PendingReview') : [];

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

  return (
    <>
      <Topbar
        title="Partners & Collaborations"
        subtitle="Manage partner organizations and review collaboration proposals"
        rightNode={
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <PlusCircle className="w-4 h-4" /> Add partner
          </button>
        }
      />

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
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
              ) : partners.length === 0 ? (
                <div className="p-10 text-center">
                  <Handshake className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                  <p className="font-semibold text-zinc-900 dark:text-white">No partners yet</p>
                  <p className="text-sm text-zinc-500 mt-1">Add the universities, NGOs and companies you work with.</p>
                </div>
              ) : (
                partners.map((p) => (
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
                        <span>{p.partnerships?.length ?? 0} partnership{p.partnerships?.length === 1 ? '' : 's'}</span>
                        {p.websiteUrl && (
                          <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-500 hover:text-indigo-400">
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
              {pendingProjects.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-500">No pending projects to review.</div>
              ) : pendingProjects.map((project: any) => (
                <div key={project.id} className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-xl">
                    <h4 className="font-bold text-zinc-900 dark:text-white">{project.title}</h4>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">{project.description || 'No description provided'}</div>
                    <div className="flex flex-wrap gap-4 text-xs text-zinc-500 pt-2">
                      <span>Supervisor: <strong className="text-zinc-700 dark:text-zinc-300">{project.supervisingTeacher?.name || 'Unknown'}</strong></span>
                      {project.partner && <span>Partner: <strong className="text-zinc-700 dark:text-zinc-300">{project.partner}</strong></span>}
                      {project.ngo && <span>NGO: <strong className="text-zinc-700 dark:text-zinc-300">{project.ngo}</strong></span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleReviewProject(project.id, 'Rejected')} className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600/10 text-red-600 dark:text-red-400 hover:bg-red-600/20 transition-colors flex items-center gap-1">
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                    <button onClick={() => handleReviewProject(project.id, 'Active')} className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" /> Approve
                    </button>
                  </div>
                </div>
              ))}
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
              <button onClick={() => setShowAddModal(false)} disabled={saving} className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">Cancel</button>
              <button onClick={addPartner} disabled={saving || !form.name.trim()} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 disabled:opacity-50 inline-flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add partner
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
