'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Users, ShieldCheck, AlertCircle } from 'lucide-react';

export default function AdminAssociationsMonitoringPage() {
  return (
    <>
      <Topbar title="Associations Monitoring" subtitle="Oversee student clubs and societies" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">Registered Associations</h2>
            <button className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Approve New Association
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Computer Science Society', members: 120, status: 'Active', budget: '$1,500' },
              { name: 'Debate Club', members: 45, status: 'Active', budget: '$500' },
              { name: 'Robotics Team', members: 85, status: 'Active', budget: '$2,500' },
              { name: 'Green Earth Initiative', members: 200, status: 'Active', budget: '$800' },
              { name: 'Astronomy Club', members: 0, status: 'Pending Approval', budget: '$0' },
            ].map((assoc, i) => (
              <div key={i} className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-xl relative overflow-hidden group hover:border-zinc-700 transition-colors">
                {assoc.status === 'Pending Approval' && (
                  <div className="absolute top-0 right-0 p-2 text-amber-500">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                )}
                
                <h3 className="font-semibold text-white mb-4 pr-6">{assoc.name}</h3>
                
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Members</span>
                    <span className="text-zinc-300">{assoc.members}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Allocated Budget</span>
                    <span className="text-zinc-300">{assoc.budget}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Status</span>
                    <span className={assoc.status === 'Active' ? 'text-emerald-400' : 'text-amber-400'}>
                      {assoc.status}
                    </span>
                  </div>
                </div>

                {assoc.status === 'Pending Approval' ? (
                  <div className="flex gap-2">
                    <button className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 py-2 rounded-lg text-sm font-medium transition-colors">
                      Approve
                    </button>
                    <button className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 py-2 rounded-lg text-sm font-medium transition-colors">
                      Reject
                    </button>
                  </div>
                ) : (
                  <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                    Manage Association
                  </button>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
