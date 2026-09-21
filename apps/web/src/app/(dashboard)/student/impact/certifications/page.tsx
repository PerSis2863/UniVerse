'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Download, Award, CheckCircle, Clock, Info, ExternalLink } from 'lucide-react';
import { toast } from "sonner";
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const fetcher = (url: string) => api.get(url).then(res => res.data);

interface Certificate {
  id: string;
  title: string;
  type: string;
  isVerified: boolean;
  issuedAt: string | null;
  createdAt: string;
}

export default function CertificationsPage() {
  const { data: stats, isLoading: loadingStats } = useSWR(`/impact/dashboard/stats`, fetcher);
  const { data: certificates, mutate, isLoading: loadingCerts } = useSWR<Certificate[]>(`/impact/certificates`, fetcher);
  
  const [isRequesting, setIsRequesting] = useState(false);

  const totalPoints = stats?.totalPoints || 0;
  
  // Determine eligibility tier
  let eligibleTier = '';
  if (totalPoints >= 2000) eligibleTier = 'Gold Level Humanitarian';
  else if (totalPoints >= 1000) eligibleTier = 'Silver Level Humanitarian';
  else if (totalPoints >= 500) eligibleTier = 'Bronze Level Humanitarian';

  const handleRequestCertificate = async () => {
    if (!eligibleTier) {
      toast.error('You do not have enough points to request a certificate yet.');
      return;
    }
    
    // Check if they already requested this tier
    const existing = certificates?.find(c => c.title === eligibleTier);
    if (existing) {
      if (existing.isVerified) toast.error(`You already have the ${eligibleTier} certificate.`);
      else toast.info(`Your request for ${eligibleTier} is already pending approval.`);
      return;
    }

    setIsRequesting(true);
    try {
      await api.post(`/impact/certificates/request`, { title: eligibleTier });
      toast.success('Certificate requested successfully! Awaiting admin approval.');
      mutate();
    } catch (error) {
      toast.error('Failed to request certificate');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDownload = (id: string) => {
    const token = localStorage.getItem('accessToken');
    window.open(`${API_URL}/impact/certificates/${id}/pdf?token=${token}`, '_blank');
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">My Certifications</h1>
        <p className="text-zinc-500 mt-2">Manage and showcase your social impact achievements.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6">
            <h3 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2 mb-2">
              <Award className="h-6 w-6 text-yellow-400" />
              Certificate Eligibility
            </h3>
            <p className="text-sm text-slate-300">
              Certificates are awarded based on your total Impact Points.
            </p>
          </div>
          <div className="p-6 pt-0 space-y-4">
            <div className="flex items-center justify-between p-4 bg-white/10 rounded-lg">
              <div>
                <p className="text-sm text-slate-300 uppercase tracking-wider font-semibold">Current Impact Points</p>
                <p className="text-4xl font-bold mt-1">{loadingStats ? '...' : totalPoints}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-300 uppercase tracking-wider font-semibold">Next Milestone</p>
                <p className="text-xl font-semibold mt-1">
                  {totalPoints < 500 ? '500 Points (Bronze)' : 
                   totalPoints < 1000 ? '1,000 Points (Silver)' : 
                   totalPoints < 2000 ? '2,000 Points (Gold)' : 'Max Tier Reached'}
                </p>
              </div>
            </div>
            
            <div className="pt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-600"></div> Bronze Level (500 pts)</span>
                {totalPoints >= 500 && <CheckCircle className="h-4 w-4 text-emerald-400" />}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-400"></div> Silver Level (1000 pts)</span>
                {totalPoints >= 1000 && <CheckCircle className="h-4 w-4 text-emerald-400" />}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-400"></div> Gold Level (2000 pts)</span>
                {totalPoints >= 2000 && <CheckCircle className="h-4 w-4 text-emerald-400" />}
              </div>
            </div>
          </div>
          <div className="p-6 pt-0">
            <button 
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 w-full bg-indigo-500 hover:bg-indigo-600 text-white" 
              onClick={handleRequestCertificate}
              disabled={!eligibleTier || isRequesting || loadingCerts}
            >
              {eligibleTier ? `Request ${eligibleTier} Certificate` : 'Not Eligible Yet'}
            </button>
          </div>
        </div>
        
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
          <div className="p-6">
            <h3 className="text-lg font-semibold leading-none tracking-tight">How it works</h3>
          </div>
          <div className="p-6 pt-0 space-y-4 text-sm text-zinc-500 dark:text-zinc-400">
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-indigo-500 shrink-0" />
              <p>Volunteer and participate in NGO projects to earn Impact Points.</p>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-indigo-500 shrink-0" />
              <p>Once you cross a point threshold, request your official certificate.</p>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-indigo-500 shrink-0" />
              <p>Admins review your impact history and approve your request.</p>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-indigo-500 shrink-0" />
              <p>Download your verified, digitally-signed PDF certificate instantly.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">My Gallery</h2>
        
        {loadingCerts ? (
          <p className="text-zinc-500">Loading your certificates...</p>
        ) : certificates?.length === 0 ? (
          <div className="text-center p-12 border-2 border-dashed rounded-xl bg-zinc-100 dark:bg-zinc-800/50">
            <Award className="h-12 w-12 text-zinc-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No certificates yet</h3>
            <p className="text-zinc-500 mb-4">Start making an impact to earn your first certificate.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {certificates?.map((cert) => (
              <div key={cert.id} className="flex flex-col relative overflow-hidden group bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
                <div className="absolute top-0 left-0 w-1 bg-indigo-500 h-full"></div>
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <Award className="h-8 w-8 text-indigo-500" />
                    {cert.isVerified ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                        <CheckCircle className="w-3 h-3 mr-1" /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-600">
                        <Clock className="w-3 h-3 mr-1" /> Pending
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold leading-none tracking-tight">{cert.title}</h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    {cert.isVerified && cert.issuedAt 
                      ? `Issued on ${new Date(cert.issuedAt).toLocaleDateString()}` 
                      : `Requested on ${new Date(cert.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="p-6 pt-0 flex-1">
                  <p className="text-sm text-zinc-500">
                    Official UniVerse credential recognizing your contribution to social impact.
                  </p>
                </div>
                <div className="p-6 pt-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800">
                  {cert.isVerified ? (
                    <button 
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 w-full gap-2" 
                      onClick={() => handleDownload(cert.id)}
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                    </button>
                  ) : (
                    <button 
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 border border-zinc-200 dark:border-zinc-700 w-full gap-2 text-zinc-500" 
                      disabled
                    >
                      <Clock className="h-4 w-4" />
                      Awaiting Review
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
