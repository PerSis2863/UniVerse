'use client';

import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Globe2, Building2, Users, PlusCircle, CheckCircle2, ArrowUpRight,
  BookOpen, HeartHandshake, Sparkles, FileText, Send, X, User, MessageSquare
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { toast } from 'sonner';

const SQUAD_DATA: Record<string, { students: string[]; milestones: { label: string; done: boolean }[] }> = {
  'prop-1': {
    students: ['Alice Johnson', 'Ben Okonkwo', 'Celia Torres', 'David Zhao', 'Emma Park', 'Fatima Al-Rashid', 'George Mensah', 'Hannah Scott'],
    milestones: [
      { label: 'Prototype complete', done: true },
      { label: 'Field test in 3 rural sites', done: true },
      { label: 'Final field deployment', done: false },
    ],
  },
  'prop-2': {
    students: ['Ivan Petrov', 'Julia Nakamura', 'Kevin Osei', 'Laura Bianchi', 'Marcus Webb', 'Nadia El-Amin'],
    milestones: [
      { label: 'Ethics committee submission', done: true },
      { label: 'Ethics clearance obtained', done: false },
      { label: 'Clinical pilot phase 1', done: false },
    ],
  },
};

export default function TeacherCollaborationsPage() {
  const [showNewProposalModal, setShowNewProposalModal] = useState(false);
  const [squadModal, setSquadModal] = useState<any | null>(null);
  const [squadMessage, setSquadMessage] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
  const [partnerUni, setPartnerUni] = useState('MIT');
  const [leadNgo, setLeadNgo] = useState('UNICEF');

  const [proposals, setProposals] = useState([
    {
      id: 'prop-1',
      title: 'Decentralized Microgrid Telemetry in Sub-Saharan Clinics',
      status: 'Active Collaboration',
      partner: 'MIT D-Lab & University of Nairobi',
      ngo: 'Water.org / UNICEF',
      studentsAssigned: 8,
      funding: '$45,000 Joint Grant',
      nextMilestone: 'Field Validation in Kenya (Nov 2026)',
    },
    {
      id: 'prop-2',
      title: 'Multimodal Clinical Decision Models for Remote First Responders',
      status: 'Under Institutional Review',
      partner: 'Oxford Medical & Sorbonne',
      ngo: 'Doctors Without Borders (MSF)',
      studentsAssigned: 6,
      funding: '$60,000 Wellcome Trust Co-Fund',
      nextMilestone: 'Ethics Committee Clearance (Oct 2026)',
    },
  ]);

  const handleCreateProposal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalTitle) return;

    setProposals([
      {
        id: `prop-${Date.now()}`,
        title: proposalTitle,
        status: 'Submitted for Consortium Approval',
        partner: `${partnerUni} Consortium`,
        ngo: leadNgo,
        studentsAssigned: 0,
        funding: 'Pending Review',
        nextMilestone: 'Review by Global Dean Committee',
      },
      ...proposals,
    ]);

    setShowNewProposalModal(false);
    setProposalTitle('');
  };

  return (
    <>
      <Topbar
        title="Inter-University Research & NGO Mentorship"
        subtitle="Coordinate cross-campus academic research and mentor student squads working with humanitarian NGOs."
        rightNode={
          <button
            onClick={() => setShowNewProposalModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <PlusCircle className="w-4 h-4" /> Propose Joint Research Initiative
          </button>
        }
      />

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-zinc-900/60 border border-zinc-800 p-6 rounded-2xl">
              <div className="text-xs text-zinc-400 font-medium mb-1">Active Joint Consortia</div>
              <div className="text-3xl font-black text-white">{proposals.length} Initiatives</div>
              <div className="text-[11px] text-indigo-400 mt-2 flex items-center gap-1">
                <Globe2 className="w-3.5 h-3.5" /> 5 Partner Institutions
              </div>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 p-6 rounded-2xl">
              <div className="text-xs text-zinc-400 font-medium mb-1">Students Under Mentorship</div>
              <div className="text-3xl font-black text-emerald-400">14 Scholars</div>
              <div className="text-[11px] text-zinc-500 mt-2">Across 4 academic disciplines</div>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 p-6 rounded-2xl">
              <div className="text-xs text-zinc-400 font-medium mb-1">Co-Authored Publications</div>
              <div className="text-3xl font-black text-amber-400">3 Papers</div>
              <div className="text-[11px] text-zinc-500 mt-2">Targeting Nature & Lancet Global</div>
            </div>
          </div>

          {/* Active Proposals List */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Your Inter-University Research Portfolio</h3>
                <p className="text-xs text-zinc-400">Jointly managed across international academic senates.</p>
              </div>
              <UniverseLogo size="sm" animated={false} withGlow={false} />
            </div>

            <div className="divide-y divide-zinc-800/60">
              {proposals.map(prop => (
                <div key={prop.id} className="p-6 hover:bg-zinc-800/20 transition-colors space-y-4">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 inline-block mb-1.5">
                        {prop.status}
                      </span>
                      <h4 className="text-lg font-bold text-white">{prop.title}</h4>
                    </div>
                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                      {prop.funding}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-zinc-400 p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/60">
                    <div>
                      <span className="text-zinc-500 block mb-0.5">Partner University:</span>
                      <span className="text-zinc-200 font-medium">{prop.partner}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block mb-0.5">NGO Collaborator:</span>
                      <span className="text-zinc-200 font-medium">{prop.ngo}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block mb-0.5">Next Milestone:</span>
                      <span className="text-indigo-300 font-medium">{prop.nextMilestone}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-zinc-400">
                      <strong className="text-white">{prop.studentsAssigned}</strong> Student Researchers Assigned
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
            const squadInfo = SQUAD_DATA[squadModal.id];
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-zinc-800 flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 inline-block mb-2">{squadModal.status}</span>
                      <h2 className="text-xl font-bold text-white">{squadModal.title}</h2>
                      <p className="text-sm text-zinc-400 mt-1">{squadModal.partner} · {squadModal.ngo}</p>
                    </div>
                    <button onClick={() => setSquadModal(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"><X className="w-5 h-5" /></button>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Milestones */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Milestone Tracker</h4>
                      <div className="space-y-2">
                        {squadInfo?.milestones.map((m, i) => (
                          <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${m.done ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' : 'bg-zinc-800/40 border-zinc-700 text-zinc-400'}`}>
                            <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${m.done ? 'text-emerald-400' : 'text-zinc-600'}`} />
                            {m.label}
                            {m.done && <span className="ml-auto text-[10px] text-emerald-500 font-bold">DONE</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Squad Roster */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                        Squad Roster ({squadInfo?.students.length || squadModal.studentsAssigned} Researchers)
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {(squadInfo?.students || []).map((s: string) => (
                          <div key={s} className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded-lg text-sm text-zinc-300">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{s.charAt(0)}</div>
                            {s}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Message Squad */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                        <MessageSquare className="w-3.5 h-3.5 inline mr-1" /> Message Squad
                      </h4>
                      <textarea
                        rows={3}
                        value={squadMessage}
                        onChange={e => setSquadMessage(e.target.value)}
                        placeholder="Send a message or update to the whole squad..."
                        className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
                      />
                      <button
                        onClick={() => { toast.success('Message sent to squad!'); setSquadMessage(''); }}
                        className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
                      >
                        <Send className="w-4 h-4" /> Send Message
                      </button>
                    </div>
                  </div>

                  <div className="p-4 border-t border-zinc-800 flex justify-end">
                    <button onClick={() => setSquadModal(null)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Close</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Modal for new proposal */}
          {showNewProposalModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div>
                  <h3 className="text-xl font-bold text-white">Draft Joint Initiative Proposal</h3>
                  <p className="text-xs text-zinc-400 mt-1">
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
                      className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-zinc-300 block mb-1">Target University Partner</label>
                      <select
                        value={partnerUni}
                        onChange={e => setPartnerUni(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="MIT">MIT</option>
                        <option value="University of Oxford">University of Oxford</option>
                        <option value="ETH Zürich">ETH Zürich</option>
                        <option value="Sorbonne University">Sorbonne University</option>
                        <option value="Univ of São Paulo">Univ of São Paulo</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-300 block mb-1">NGO Co-Sponsor</label>
                      <select
                        value={leadNgo}
                        onChange={e => setLeadNgo(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="UNICEF">UNICEF</option>
                        <option value="Doctors Without Borders">Doctors Without Borders</option>
                        <option value="Greenpeace">Greenpeace</option>
                        <option value="UNESCO">UNESCO</option>
                        <option value="Water.org">Water.org</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setShowNewProposalModal(false)}
                      className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5" /> Submit to Academic Senate
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
