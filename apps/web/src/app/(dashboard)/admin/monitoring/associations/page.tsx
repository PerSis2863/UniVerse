'use client';

import { Topbar } from '@/components/layout/Topbar';
import { useState } from 'react';
import { Users, ShieldCheck, AlertCircle } from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { toast } from 'sonner';
import { ManageAssociationModal } from './ManageAssociationModal';

export default function AdminAssociationsMonitoringPage() {
  const { data: associationsData, isLoading, mutate } = useSWR('/associations', fetcher);
  const [managingAssociation, setManagingAssociation] = useState<any>(null);

  const associations = associationsData || [];

  const updateStatus = async (id: string, status: string) => {
    try {
      const api = (await import('@/lib/fetcher')).api;
      await api.patch(`/associations/${id}/status`, { status });
      toast.success(`Association ${status.toLowerCase()} successfully`);
      mutate();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update status');
    }
  };
  return (
    <>
      <Topbar title="Associations Monitoring" subtitle="Oversee student clubs and societies" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Registered Associations</h2>
            <button className="bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Approve New Association
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full py-12 text-center text-zinc-500">Loading associations...</div>
            ) : associations.map((assoc: any) => (
              <div key={assoc.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-6 rounded-xl relative overflow-hidden group hover:border-zinc-700 transition-colors">
                {assoc.status === 'PENDING' && (
                  <div className="absolute top-0 right-0 p-2 text-amber-500">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                )}
                
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-4 pr-6">{assoc.name}</h3>
                
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-500">Members</span>
                    <span className="text-zinc-300">{assoc.members}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-500">Allocated Budget</span>
                    <span className="text-zinc-300">${assoc.budget || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-500">Status</span>
                    <span className={assoc.status === 'ACTIVE' ? 'text-emerald-400' : assoc.status === 'REJECTED' ? 'text-rose-400' : 'text-amber-400'}>
                      {assoc.status}
                    </span>
                  </div>
                </div>

                {assoc.status === 'PENDING' ? (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => updateStatus(assoc.id, 'ACTIVE')}
                      className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Approve
                    </button>
                    <button 
                      onClick={() => updateStatus(assoc.id, 'REJECTED')}
                      className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setManagingAssociation(assoc)}
                    className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 text-zinc-900 dark:text-white py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Manage Association
                  </button>
                )}
              </div>
            ))}
          </div>

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
