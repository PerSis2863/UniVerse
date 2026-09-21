'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { CheckCircle, Clock, Search, XCircle, Award, Download } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const fetcher = (url: string) => api.get(url).then(res => res.data);

interface PendingCertificate {
  id: string;
  title: string;
  user: {
    name: string;
    email: string;
  };
  createdAt: string;
}

export default function AdminCertificationsPage() {
  const { data: pendingRequests, mutate, isLoading } = useSWR<PendingCertificate[]>(`/impact/certificates/pending`, fetcher);
  const [approving, setApproving] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setApproving(id);
    try {
      await api.post(`/impact/certificates/${id}/approve`);
      toast.success('Certificate approved successfully!');
      mutate();
    } catch (error) {
      toast.error('Failed to approve certificate.');
    } finally {
      setApproving(null);
    }
  };

  const handleDownloadPreview = (id: string) => {
    const token = localStorage.getItem('accessToken');
    window.open(`${API_URL}/impact/certificates/${id}/pdf?token=${token}`, '_blank');
  };

  return (
    <>
      <Topbar 
        title="Pending Certifications" 
        subtitle="Review and approve student requests for Social Impact Certificates." 
      />
      
      <div className="flex-1 p-8 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" /> 
                Awaiting Approval ({pendingRequests?.length || 0})
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Please verify the student's impact hours before approving their credential.
              </p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search students..." 
                className="pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="text-zinc-500">Loading pending requests...</p>
          ) : pendingRequests?.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">All caught up!</h3>
              <p className="text-zinc-500 dark:text-zinc-400">There are no pending certificate requests to review.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {pendingRequests?.map((req) => (
                <div key={req.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between p-6">
                    <div className="flex items-center gap-4 mb-4 md:mb-0">
                      <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
                        <Award className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-zinc-900 dark:text-white text-lg flex items-center gap-2">
                          {req.user.name}
                          <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700">
                            {req.user.email}
                          </span>
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                          <span className="font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                            {req.title}
                          </span>
                          <span>•</span>
                          <span>Requested {new Date(req.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button 
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-9 px-3 border text-rose-600 border-rose-200 hover:bg-rose-50"
                        onClick={() => {
                          toast.error('Rejection functionality not implemented for MVP');
                        }}
                      >
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </button>
                      <button 
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-9 px-3 bg-emerald-600 hover:bg-emerald-500 text-white"
                        disabled={approving === req.id}
                        onClick={() => handleApprove(req.id)}
                      >
                        {approving === req.id ? (
                          <span className="flex items-center gap-2"><Clock className="w-4 h-4 animate-spin" /> Approving...</span>
                        ) : (
                          <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Approve</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
