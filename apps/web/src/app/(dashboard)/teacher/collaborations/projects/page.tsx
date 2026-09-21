'use client';

import { useState, useMemo, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Search, Filter, Briefcase, Globe2, ArrowUpRight, Clock, Users, Building2,
  CheckCircle2, X, Send, ChevronDown, Edit, Trash2, Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const STATUSES = ['All', 'Active', 'Recruiting', 'Completed'];

type ProjectMilestone = {
  id: string;
  title: string;
  status: string;
};

type CollaborationProject = {
  id: string;
  title: string;
  partner: string | null;
  status: string;
  deadline: string | null;
  description: string;
  tags: string[];
  contactEmail: string | null;
  ngoProject: { id: string; name: string; ngo: { name: string } } | null;
  _count: { members: number };
  milestones?: ProjectMilestone[];
};

export default function NGOMentorshipPage() {
  const [projects, setProjects] = useState<CollaborationProject[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedProject, setSelectedProject] = useState<CollaborationProject | null>(null);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Propose form state
  const [proposeTitle, setProposeTitle] = useState('');
  const [proposePartner, setProposePartner] = useState('UNICEF');
  const [proposeDesc, setProposeDesc] = useState('');
  const [proposeTags, setProposeTags] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await api.get('/collaborations/projects');
      setProjects(res.data);
    } catch (error) {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const partnerStr = p.partner || p.ngoProject?.ngo?.name || '';
      const matchSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
        partnerStr.toLowerCase().includes(search.toLowerCase()) ||
        p.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = statusFilter === 'All' || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [projects, search, statusFilter]);

  const handlePropose = async () => {
    if (!proposeTitle || !proposeDesc) {
      toast.error('Please fill in the title and description.');
      return;
    }
    
    try {
      const data = {
        title: proposeTitle,
        description: proposeDesc,
        partner: proposePartner,
        tags: proposeTags.split(',').map(t => t.trim()).filter(Boolean),
        status: 'Recruiting'
      };
      await api.post('/collaborations/projects', data);
      toast.success('Project proposed! It has been submitted for consortium review.');
      setShowProposeModal(false);
      setProposeTitle('');
      setProposeDesc('');
      setProposeTags('');
      fetchProjects();
    } catch (error) {
      toast.error('Failed to create project');
    }
  };

  const loadProjectDetails = async (id: string) => {
    try {
      const res = await api.get(`/collaborations/projects/${id}`);
      setSelectedProject(res.data);
    } catch (error) {
      toast.error('Failed to load details');
    }
  };

  return (
    <>
      <Topbar
        title="NGO Mentorship Projects"
        subtitle="Manage your student mentorships for global NGO projects."
      />

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by project, partner, or skill..."
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              {/* Filter dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowFilterDropdown(p => !p)}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors whitespace-nowrap"
                >
                  <Filter className="w-4 h-4" />
                  {statusFilter === 'All' ? 'Filter' : statusFilter}
                  <ChevronDown className="w-3 h-3 ml-1" />
                </button>
                {showFilterDropdown && (
                  <div className="absolute right-0 top-11 z-30 bg-white dark:bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-40 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                    {STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => { setStatusFilter(s); setShowFilterDropdown(false); }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                          statusFilter === s ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowProposeModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-zinc-900 dark:text-white rounded-lg hover:bg-indigo-600 transition-colors whitespace-nowrap"
              >
                <Briefcase className="w-4 h-4" /> Propose Project
              </button>
            </div>
          </div>

          {/* Results count */}
          {(search || statusFilter !== 'All') && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Showing <strong className="text-zinc-900 dark:text-white">{filtered.length}</strong> project{filtered.length !== 1 ? 's' : ''}
              {statusFilter !== 'All' && <> with status <span className="text-indigo-400">{statusFilter}</span></>}
              {search && <> matching "<span className="text-indigo-400">{search}</span>"</>}
            </p>
          )}

          {/* Projects Grid */}
          {loading ? (
             <div className="flex items-center justify-center py-16">
               <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
             </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 dark:text-zinc-500">
              <Globe2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">No projects match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((project) => (
                <div key={project.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors flex flex-col group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2 text-xs font-semibold px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <Globe2 className="w-3.5 h-3.5" />
                      Global Impact
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${
                      project.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' :
                      project.status === 'Recruiting' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400'
                    }`}>
                      {project.status}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2 leading-tight group-hover:text-indigo-300 transition-colors">
                    {project.title}
                  </h3>

                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                    <Building2 className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                    {project.partner || project.ngoProject?.ngo?.name || 'Consortium'}
                  </div>

                  <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-6 flex-1 line-clamp-3">
                    {project.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-6">
                    {project.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-300">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> {project._count?.members || 0}
                      </div>
                      {project.deadline && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" /> {new Date(project.deadline).toLocaleDateString()}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => loadProjectDetails(project.id)}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-sm font-medium transition-colors"
                    >
                      Manage <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Manage Modal */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between">
              <div>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full mb-2 inline-block ${
                  selectedProject.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                }`}>{selectedProject.status}</span>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{selectedProject.title}</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{selectedProject.partner || selectedProject.ngoProject?.ngo?.name}</p>
              </div>
              <button onClick={() => setSelectedProject(null)} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl">
                  <div className="text-zinc-500 dark:text-zinc-500 text-xs mb-1">Students Assigned</div>
                  <div className="font-bold text-zinc-900 dark:text-white text-lg">{selectedProject._count?.members || 0}</div>
                </div>
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl">
                  <div className="text-zinc-500 dark:text-zinc-500 text-xs mb-1">Deadline</div>
                  <div className="font-bold text-zinc-900 dark:text-white">{selectedProject.deadline ? new Date(selectedProject.deadline).toLocaleDateString() : 'N/A'}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">Description</div>
                <p className="text-sm text-zinc-300 leading-relaxed">{selectedProject.description}</p>
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">Milestones</div>
                <div className="space-y-2">
                  {selectedProject.milestones?.length ? selectedProject.milestones.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm text-zinc-300">
                      <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${m.status === 'COMPLETED' ? 'text-indigo-400' : 'text-zinc-500'}`} />
                      {m.title}
                    </div>
                  )) : (
                    <div className="text-sm text-zinc-500">No milestones yet.</div>
                  )}
                </div>
              </div>

              {selectedProject.contactEmail && (
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800/40 rounded-xl text-sm flex items-center justify-between">
                  <span className="text-zinc-600 dark:text-zinc-400">Contact:</span>
                  <a href={`mailto:${selectedProject.contactEmail}`} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                    {selectedProject.contactEmail}
                  </a>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <button
                onClick={() => {
                   toast.info('Feature under construction (delete project).');
                }}
                className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Remove Project
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedProject(null)}
                  className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => { toast.success('Report submitted to consortium!'); setSelectedProject(null); }}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Send className="w-4 h-4" /> Submit Milestone Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Propose Project Modal */}
      {showProposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Propose New NGO Project</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Submit a new mentorship initiative for consortium review.</p>
              </div>
              <button onClick={() => setShowProposeModal(false)} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Project Title *</label>
                <input
                  type="text"
                  value={proposeTitle}
                  onChange={e => setProposeTitle(e.target.value)}
                  placeholder="e.g., Solar Microgrid Monitoring for Rural Schools"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">NGO / Partner Organization</label>
                <select
                  value={proposePartner}
                  onChange={e => setProposePartner(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                >
                  <option>UNICEF</option>
                  <option>Doctors Without Borders</option>
                  <option>Greenpeace International</option>
                  <option>UNESCO</option>
                  <option>Water.org</option>
                  <option>Red Cross</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Project Description *</label>
                <textarea
                  rows={3}
                  value={proposeDesc}
                  onChange={e => setProposeDesc(e.target.value)}
                  placeholder="Describe the project goals, expected student contributions, and social impact..."
                  className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Required Skills <span className="text-zinc-500 dark:text-zinc-500">(comma-separated)</span></label>
                <input
                  type="text"
                  value={proposeTags}
                  onChange={e => setProposeTags(e.target.value)}
                  placeholder="e.g., Python, IoT, Community Outreach"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button onClick={() => setShowProposeModal(false)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handlePropose}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-zinc-900 dark:text-white shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all"
              >
                <Send className="w-4 h-4" /> Submit for Review
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
