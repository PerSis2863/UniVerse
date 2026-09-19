'use client';

import { Topbar } from '@/components/layout/Topbar';
import { motion } from 'framer-motion';
import { Building2, Handshake, Target, CheckCircle2, MoreVertical, Globe, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const sponsors = [
  {
    id: 1,
    name: 'TechForGood Foundation',
    type: 'Corporate Sponsor',
    status: 'Active',
    contribution: '$50,000',
    projectsSupported: 12,
    domain: 'Education & Tech',
    logo: 'TF'
  },
  {
    id: 2,
    name: 'GreenEarth Alliance',
    type: 'NGO Partner',
    status: 'Pending Renewal',
    contribution: '$15,000',
    projectsSupported: 4,
    domain: 'Environment',
    logo: 'GA'
  },
  {
    id: 3,
    name: 'InnovateHub Inc.',
    type: 'Tech Partner',
    status: 'Active',
    contribution: 'In-kind (Software)',
    projectsSupported: 25,
    domain: 'Software Development',
    logo: 'IH'
  }
];

export default function AdminPartnersPage() {
  return (
    <div className="min-h-screen">
      <Topbar 
        title="Sponsor & Partner Portal" 
        subtitle="Manage corporate sponsors, NGOs, and university partners." 
      />

      <main className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="kpi-card group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium">Total Partners</h3>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">45</div>
            <div className="text-xs text-emerald-500 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> +3 this quarter
            </div>
          </div>
          
          <div className="kpi-card group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Handshake className="w-5 h-5" />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium">Active Sponsorships</h3>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">$850k</div>
            <div className="text-xs text-emerald-500 mt-2 flex items-center gap-1">
              Total committed funds
            </div>
          </div>

          <div className="kpi-card group gradient-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium">Projects Supported</h3>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">128</div>
            <div className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
              Globally deployed
            </div>
          </div>
        </div>

        {/* Partners Table */}
        <div className="card">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Partner Directory</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage all external collaborations.</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-secondary text-sm">Export Data</button>
              <button 
                onClick={() => toast.success('Add new partner flow started')}
                className="btn-primary text-sm">
                Add Partner
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/[0.06] text-sm text-zinc-500 dark:text-zinc-400">
                  <th className="pb-3 font-medium">Partner Name</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Contribution</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sponsors.map((sponsor, i) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={sponsor.id} 
                    className="border-b border-zinc-100 dark:border-white/[0.02] last:border-0 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                          {sponsor.logo}
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-900 dark:text-white">{sponsor.name}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                            <Briefcase className="w-3 h-3" /> {sponsor.domain}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-sm text-zinc-600 dark:text-zinc-300">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-zinc-400" />
                        {sponsor.type}
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="text-sm font-medium text-zinc-900 dark:text-white">{sponsor.contribution}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{sponsor.projectsSupported} projects</div>
                    </td>
                    <td className="py-4">
                      <span className={cn(
                        "text-xs px-2.5 py-1 rounded-full font-medium border",
                        sponsor.status === 'Active' 
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      )}>
                        {sponsor.status}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <button className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 rounded-lg transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
