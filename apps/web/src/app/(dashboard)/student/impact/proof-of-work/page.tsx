'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  Shield, CheckCircle2, Clock, XCircle, Plus, ExternalLink,
  Copy, Code2, Timer, Building2, Loader2, Hash
} from 'lucide-react';
import { toast } from 'sonner';

interface ProofItem {
  id: string;
  projectName: string;
  organization: string;
  description: string;
  hoursCompleted: number;
  codeCommits: number;
  ngoVerified: boolean;
  blockchainHash: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  createdAt: string;
}

const STATUS_CONFIG = {
  VERIFIED: { label: 'Verified', color: 'emerald', icon: CheckCircle2, bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  PENDING: { label: 'Pending', color: 'amber', icon: Clock, bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  REJECTED: { label: 'Rejected', color: 'red', icon: XCircle, bg: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

// Demo data - in production fetched from API
const DEMO_PROOFS: ProofItem[] = [
  {
    id: '1', projectName: 'Clean Water Kenya', organization: 'WaterAid Kenya',
    description: 'Built water filtration system monitoring dashboard', hoursCompleted: 40,
    codeCommits: 23, ngoVerified: true, blockchainHash: '0x7f3d...a82c',
    status: 'VERIFIED', createdAt: '2025-08-15T00:00:00Z',
  },
  {
    id: '2', projectName: 'Digital Literacy', organization: 'Tech4Good',
    description: 'Mentored 15 students in Python basics', hoursCompleted: 25,
    codeCommits: 0, ngoVerified: true, blockchainHash: '0x4e1b...f93a',
    status: 'VERIFIED', createdAt: '2025-07-20T00:00:00Z',
  },
  {
    id: '3', projectName: 'Climate Dashboard', organization: 'Green Earth',
    description: 'React dashboard for tracking carbon emissions', hoursCompleted: 15,
    codeCommits: 47, ngoVerified: false, blockchainHash: null,
    status: 'PENDING', createdAt: '2025-09-01T00:00:00Z',
  },
];

export default function ProofOfWorkPage() {
  const { user } = useAuthStore();
  const [proofs] = useState<ProofItem[]>(DEMO_PROOFS);
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  const completedProjects = proofs.filter(p => p.status === 'VERIFIED').length;
  const totalHours = proofs.filter(p => p.status === 'VERIFIED').reduce((s, p) => s + p.hoursCompleted, 0);
  const totalCommits = proofs.filter(p => p.status === 'VERIFIED').reduce((s, p) => s + p.codeCommits, 0);

  const handleShare = (proof: ProofItem) => {
    const url = `${window.location.origin}/verify/${proof.blockchainHash || proof.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Proof link copied!', { description: 'Share this verified achievement on LinkedIn' });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
          <Shield className="w-3 h-3" />
          Proof of Work
        </div>
        <h1 className="text-2xl font-black text-white mb-1">
          {user?.name?.split(' ')[0]}&apos;s Impact Portfolio
        </h1>
        <p className="text-zinc-400 text-sm">Verified work on social impact projects — blockchain-backed proof</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-white">{completedProjects}</div>
          <div className="text-xs text-zinc-500 mt-1">✅ Completed Projects</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-white">{totalHours}</div>
          <div className="text-xs text-zinc-500 mt-1">⏱️ Verified Hours</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-white">{totalCommits}</div>
          <div className="text-xs text-zinc-500 mt-1">💻 Code Commits</div>
        </div>
      </div>

      {/* Proof Cards */}
      <div className="space-y-4">
        {proofs.map((proof) => {
          const statusCfg = STATUS_CONFIG[proof.status];
          const StatusIcon = statusCfg.icon;
          return (
            <div key={proof.id} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-white font-bold">Project: {proof.projectName}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusCfg.bg}`}>
                      <StatusIcon className="w-3 h-3 inline mr-0.5" />
                      {statusCfg.label}
                    </span>
                  </div>
                  <p className="text-sm text-indigo-400 font-medium flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> {proof.organization}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">{proof.description}</p>
                </div>
                <div className="text-xs text-zinc-600">
                  {new Date(proof.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
                  <Timer className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-zinc-300">Volunteered: <span className="font-bold text-white">{proof.hoursCompleted} hrs</span></span>
                </div>
                <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
                  <Code2 className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs text-zinc-300">Commits: <span className="font-bold text-white">{proof.codeCommits}</span></span>
                </div>
                <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-zinc-300">NGO: <span className={`font-bold ${proof.ngoVerified ? 'text-emerald-400' : 'text-zinc-500'}`}>{proof.ngoVerified ? '✅' : '⏳'}</span></span>
                </div>
                <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
                  <Hash className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs text-zinc-300">Blockchain: <span className={`font-bold ${proof.blockchainHash ? 'text-emerald-400' : 'text-zinc-500'}`}>{proof.blockchainHash ? '✅' : '⏳'}</span></span>
                </div>
              </div>

              {/* Actions */}
              {proof.status === 'VERIFIED' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleShare(proof)} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors">
                    <Copy className="w-3 h-3" /> Copy Link
                  </button>
                  <button className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors">
                    <ExternalLink className="w-3 h-3" /> Share on LinkedIn
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit new proof */}
      <div className="mt-8 p-5 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-white font-bold text-sm mb-1">Submit Proof of Work</h3>
            <p className="text-zinc-400 text-xs">Completed a project? Submit your work for NGO verification.</p>
          </div>
          <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors">
            <Plus className="w-4 h-4" /> Submit Work
          </button>
        </div>
      </div>
    </div>
  );
}
