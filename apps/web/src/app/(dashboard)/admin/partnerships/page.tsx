'use client';

import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { toast } from 'sonner';
import {
  Globe2, Building2, HandHeart, CheckCircle2, AlertTriangle, ShieldCheck,
  PlusCircle, Search, Filter, ExternalLink, ArrowUpRight, DollarSign, Users
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';

export default function AdminPartnershipsPage() {
  const [partners, setPartners] = useState([
    {
      id: 'mou-1',
      entity: 'UNICEF East Africa Regional Office',
      category: 'International NGO',
      agreementType: 'Global Strategic MOU',
      validUntil: 'Aug 2029',
      status: 'Active',
      allocatedBudget: '$120,000 / yr',
      studentsEnrolled: 42,
      legalContact: 'legal@unicef.org',
    },
    {
      id: 'mou-2',
      entity: 'Massachusetts Institute of Technology (MIT)',
      category: 'Academic Institution',
      agreementType: 'Bilateral Credit & Research Exchange',
      validUntil: 'Jun 2028',
      status: 'Active',
      allocatedBudget: '$250,000 / yr',
      studentsEnrolled: 28,
      legalContact: 'provost@mit.edu',
    },
    {
      id: 'mou-3',
      entity: 'Doctors Without Borders (MSF)',
      category: 'International NGO',
      agreementType: 'Humanitarian Clinical Data Sharing',
      validUntil: 'Dec 2027',
      status: 'Active',
      allocatedBudget: '$85,000 / yr',
      studentsEnrolled: 19,
      legalContact: 'partnerships@msf.org',
    },
    {
      id: 'mou-4',
      entity: 'University of Nairobi',
      category: 'Academic Institution',
      agreementType: 'Joint Field Telemetry & Student Exchange',
      validUntil: 'Pending Signature',
      status: 'Pending Review',
      allocatedBudget: '$40,000 / yr',
      studentsEnrolled: 8,
      legalContact: 'dean@uonbi.ac.ke',
    },
  ]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntity, setNewEntity] = useState('');
  const [newCategory, setNewCategory] = useState('Academic Institution');

  const handleApprove = (id: string) => {
    setPartners(partners.map(p => p.id === id ? { ...p, status: 'Active', validUntil: 'Sep 2029' } : p));
    toast.success('Agreement Ratified Successfully');
  };

  return (
    <>
      <Topbar
        title="Global Institutional Partnerships & NGOs"
        subtitle="Manage formal academic MOUs, NGO collaboration agreements, and university exchange quotas."
        rightNode={
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <PlusCircle className="w-4 h-4" /> Ratify New Institutional MOU
          </button>
        }
      />

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Admin Overview Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl">
              <div className="text-xs text-zinc-400 font-medium mb-1">Total Active Partnerships</div>
              <div className="text-3xl font-black text-white">{partners.length} Institutions</div>
              <div className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 100% Compliance Verified
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl">
              <div className="text-xs text-zinc-400 font-medium mb-1">Total Impact Grant Pool</div>
              <div className="text-3xl font-black text-indigo-400">$495,000</div>
              <div className="text-[11px] text-zinc-500 mt-2">Allocated across 2026-2027</div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl">
              <div className="text-xs text-zinc-400 font-medium mb-1">Cross-Enrolled Students</div>
              <div className="text-3xl font-black text-amber-400">97 Fellows</div>
              <div className="text-[11px] text-zinc-500 mt-2">Active in NGO & campus programs</div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl">
              <div className="text-xs text-zinc-400 font-medium mb-1">Institutional Reach</div>
              <div className="text-3xl font-black text-pink-400">24 Nations</div>
              <div className="text-[11px] text-zinc-500 mt-2">North America, Europe, Africa, Asia</div>
            </div>
          </div>

          {/* Table of Partnerships */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Active Institutional Agreements & Charters</h3>
                <p className="text-xs text-zinc-400">Governed under UniVerse Global Consortium Charter 2026.</p>
              </div>
              <UniverseLogo size="sm" animated={true} withGlow={true} />
            </div>

            <div className="divide-y divide-zinc-800/60">
              {partners.map(p => (
                <div key={p.id} className="p-6 hover:bg-zinc-800/20 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-white">{p.entity}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {p.category}
                      </span>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        p.status === 'Active'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {p.status}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-400">{p.agreementType}</div>

                    <div className="flex flex-wrap gap-4 text-xs text-zinc-500 pt-1">
                      <span>Term: <strong className="text-zinc-300">{p.validUntil}</strong></span>
                      <span>Budget: <strong className="text-emerald-400">{p.allocatedBudget}</strong></span>
                      <span>Students: <strong className="text-zinc-300">{p.studentsEnrolled}</strong></span>
                      <span>Legal: <strong className="text-indigo-400">{p.legalContact}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                    {p.status === 'Pending Review' && (
                      <button
                        onClick={() => handleApprove(p.id)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all"
                      >
                        Ratify Agreement
                      </button>
                    )}
                    <button 
                      onClick={() => toast.info('Loading Charter PDF...')}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors">
                      View Charter PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add MOU Modal */}
          {showAddModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div>
                  <h3 className="text-xl font-bold text-white">Ratify New Institutional Partnership</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Register a new university or non-governmental organization to the UniVerse network.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Institution / NGO Name</label>
                    <input
                      type="text"
                      value={newEntity}
                      onChange={e => setNewEntity(e.target.value)}
                      placeholder="e.g., Red Cross International or Stanford University"
                      className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Partner Classification</label>
                    <select
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Academic Institution">Academic Institution (University / College)</option>
                      <option value="International NGO">International NGO (Humanitarian / Climate)</option>
                      <option value="Governmental Research Lab">Governmental / Intergovernmental Body</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!newEntity) return;
                      setPartners([
                        ...partners,
                        {
                          id: `mou-${Date.now()}`,
                          entity: newEntity,
                          category: newCategory,
                          agreementType: 'Consortium Accession Treaty',
                          validUntil: 'Sep 2029',
                          status: 'Active',
                          allocatedBudget: '$50,000 / yr',
                          studentsEnrolled: 0,
                          legalContact: 'consortium@universe.edu',
                        },
                      ]);
                      setShowAddModal(false);
                      setNewEntity('');
                      toast.success(`Successfully onboarded ${newEntity}`);
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                  >
                    Sign & Onboard Institution
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
