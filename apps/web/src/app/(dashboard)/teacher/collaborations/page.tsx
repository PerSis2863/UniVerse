'use client';

import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Globe2, Building2, Users, PlusCircle, CheckCircle2, ArrowUpRight,
  BookOpen, HeartHandshake, Sparkles, FileText, Send, X, User, MessageSquare
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { toast } from 'sonner';


export default function TeacherCollaborationsPage() {
  const [showNewProposalModal, setShowNewProposalModal] = useState(false);
  const [squadModal, setSquadModal] = useState<any | null>(null);
  const [proposalTitle, setProposalTitle] = useState('');
  const [partnerUni, setPartnerUni] = useState('');
  const [leadNgo, setLeadNgo] = useState('');

  const { data: realProposals, mutate } = useSWR('/collaborations/projects', async (url) => {
    const res = await api.get(url);
    return res.data;
  });

  const { data: squadDetail, isLoading: squadLoading } = useSWR(squadModal ? `/collaborations/projects/${squadModal.id}` : null, async (url: string) => (await api.get(url)).data);

  const displayProposals = realProposals ? realProposals.map((p: any) => ({
    id: p.id,
    title: p.title,
    status: p.status === 'PendingReview' ? 'Awaiting admin review' : p.status,
    partner: p.partner || '—',
    ngo: p.ngo || '—',
    studentsAssigned: p._count?.members || 0,
    funding: p.status === 'PendingReview' ? 'Pending review' : '—',
    nextMilestone: p.status === 'PendingReview' ? 'Admin review' : '—',
  })) : [];

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalTitle) return;

    try {
      await api.post('/collaborations/projects', {
        title: proposalTitle,
        description: 'New collaboration project',
        partner: partnerUni.trim() || null,
        ngo: leadNgo.trim() || null,
      });

      mutate();
      setShowNewProposalModal(false);
      setProposalTitle('');
      toast.success('Proposal submitted for admin review');
    } catch (error) {
      toast.error('Failed to submit proposal');
    }
  };

  return (
    <>
      <Topbar
        title="Inter-University Research & NGO Mentorship"
        subtitle="Coordinate cross-campus academic research and mentor student squads working with humanitarian NGOs."
        rightNode={
          <button
            onClick={() => setShowNewProposalModal(true)}
            className="btn-primary btn-sm"
          >
            <PlusCircle className="w-4 h-4" /> Propose Joint Research Initiative
          </button>
        }
      />

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl">
              <div className="text-xs text-zinc-600 dark:text-zinc-400 font-medium mb-1">Active Joint Consortia</div>
              <div className="text-3xl font-black text-zinc-900 dark:text-white">{displayProposals.length} Initiatives</div>
              <div className="text-[11px] text-indigo-400 mt-2 flex items-center gap-1">
                <Globe2 className="w-3.5 h-3.5" /> 5 Partner Institutions
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl">
              <div className="text-xs text-zinc-600 dark:text-zinc-400 font-medium mb-1">Students Under Mentorship</div>
              <div className="text-3xl font-black text-emerald-400">14 Scholars</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-2">Across 4 academic disciplines</div>
            </div>

            <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl">
              <div className="text-xs text-zinc-600 dark:text-zinc-400 font-medium mb-1">Co-Authored Publications</div>
              <div className="text-3xl font-black text-amber-400">3 Papers</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-2">Targeting Nature & Lancet Global</div>
            </div>
          </div>

          {/* Active Proposals List */}
          <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">Your Inter-University Research Portfolio</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">Jointly managed across international academic senates.</p>
              </div>
              <UniverseLogo size="sm" animated={false} withGlow={false} />
            </div>

            <div className="divide-y divide-zinc-800/60">
              {displayProposals.map((prop: any) => (
                <div key={prop.id} className="p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors space-y-4">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 inline-block mb-1.5">
                        {prop.status}
                      </span>
                      <h4 className="text-lg font-bold text-zinc-900 dark:text-white">{prop.title}</h4>
                    </div>
                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                      {prop.funding}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-zinc-600 dark:text-zinc-400 p-3 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl border border-zinc-200 dark:border-zinc-800/60">
                    <div>
                      <span className="text-zinc-500 dark:text-zinc-500 block mb-0.5">Partner University:</span>
                      <span className="text-zinc-200 font-medium">{prop.partner}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 dark:text-zinc-500 block mb-0.5">NGO Collaborator:</span>
                      <span className="text-zinc-200 font-medium">{prop.ngo}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 dark:text-zinc-500 block mb-0.5">Next Milestone:</span>
                      <span className="text-indigo-300 font-medium">{prop.nextMilestone}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      <strong className="text-zinc-900 dark:text-white">{prop.studentsAssigned}</strong> Student Researchers Assigned
                    </div>

                    <button
                      onClick={() => setSquadModal(prop)}
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                    >
                      Manage Squad &amp; Milestone Reports <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Squad Management Modal */}
          {squadModal && (() => {
            const members: { user: { id: string; name: string } }[] = squadDetail?.members ?? [];
            const milestones: { id: string; title: string; status: string }[] = squadDetail?.milestones ?? [];
            return (
              <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="sheet-in bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 inline-block mb-2">{squadModal.status}</span>
                      <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{squadModal.title}</h2>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{squadModal.partner} · {squadModal.ngo}</p>
                    </div>
                    <button onClick={() => setSquadModal(null)} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X className="w-5 h-5" /></button>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Milestones */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-3">Milestone Tracker</h4>
                      <div className="space-y-2">
                        {squadLoading && <p className="text-sm text-zinc-500">Loading…</p>}
                        {!squadLoading && milestones.length === 0 && <p className="text-sm text-zinc-500">No milestones yet.</p>}
                        {milestones.map((m) => {
                          const done = m.status === 'COMPLETED';
                          return (
                            <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${done ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'}`}>
                              <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${done ? 'text-emerald-400' : 'text-zinc-500'}`} />
                              {m.title}
                              {done && <span className="ml-auto text-[10px] text-emerald-500 font-bold">DONE</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Squad Roster */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-3">
                        Team ({members.length || squadModal.studentsAssigned} member{(members.length || squadModal.studentsAssigned) === 1 ? '' : 's'})
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {!squadLoading && members.length === 0 && <p className="col-span-2 text-sm text-zinc-500">No students have joined yet.</p>}
                        {members.map((m) => (
                          <div key={m.user.id} className="flex items-center gap-2 p-2 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg text-sm text-zinc-700 dark:text-zinc-300">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{m.user.name.charAt(0)}</div>
                            {m.user.name}
                          </div>
                        ))}
                      </div>
                    </div>

                    <a href="/teacher/inbox" className="btn-primary">
                      <MessageSquare className="w-4 h-4" /> Message the team in Inbox
                    </a>
                  </div>

                  <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                    <button onClick={() => setSquadModal(null)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Close</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Modal for new proposal */}
          {showNewProposalModal && (
            <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="sheet-in bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Draft Joint Initiative Proposal</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                    Submit a collaborative project to the Global Inter-College Consortium and partner NGOs.
                  </p>
                </div>

                <form onSubmit={handleCreateProposal} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Initiative Title</label>
                    <input
                      type="text"
                      required
                      value={proposalTitle}
                      onChange={e => setProposalTitle(e.target.value)}
                      placeholder="e.g., Renewable Thermal Storage for Rural Clinics"
                      className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-zinc-300 block mb-1">Target University Partner</label>
                      <input
                        value={partnerUni}
                        onChange={e => setPartnerUni(e.target.value)}
                        maxLength={120}
                        placeholder="Partner university (optional)"
                        className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-300 block mb-1">NGO Co-Sponsor</label>
                      <input
                        value={leadNgo}
                        onChange={e => setLeadNgo(e.target.value)}
                        maxLength={120}
                        placeholder="NGO partner (optional)"
                        className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setShowNewProposalModal(false)}
                      className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary btn-sm"
                    >
                      <Send className="w-3.5 h-3.5" /> Submit proposal
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
