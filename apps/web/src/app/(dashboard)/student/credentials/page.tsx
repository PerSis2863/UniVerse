'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import {
  Trophy, BookOpen, Clock, Share2, Download, Plus, CheckCircle2,
  Star, Award, Loader2, Copy, ExternalLink, Shield, GraduationCap
} from 'lucide-react';
import { toast } from 'sonner';

interface Credential {
  id: string;
  type: 'university' | 'volunteer' | 'badge' | 'certification';
  title: string;
  issuer: string;
  description: string;
  date: string;
  status: 'verified' | 'pending' | 'expired';
  icon: string;
  hours?: number;
  projects?: number;
}

const TYPE_CONFIG = {
  university: { label: 'University', color: 'indigo', icon: GraduationCap },
  volunteer: { label: 'Volunteer', color: 'emerald', icon: BookOpen },
  badge: { label: 'Impact Badge', color: 'amber', icon: Trophy },
  certification: { label: 'Certification', color: 'purple', icon: Award },
};

const STATUS_COLORS = {
  verified: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  expired: 'bg-red-500/20 text-red-400 border-red-500/30',
};

// Mock credentials data (in production, fetch from API)
const MOCK_CREDENTIALS: Credential[] = [
  {
    id: '1',
    type: 'university',
    title: 'Enrolled Student',
    issuer: 'UniVerse Impact University',
    description: 'Verified active student enrollment',
    date: '2025-09-01',
    status: 'verified',
    icon: '🎓',
  },
  {
    id: '2',
    type: 'volunteer',
    title: 'Volunteer Hours',
    issuer: 'WaterAid Kenya',
    description: 'Community service and outreach',
    date: '2025-08-15',
    status: 'verified',
    icon: '📋',
    hours: 120,
  },
  {
    id: '3',
    type: 'badge',
    title: 'Climate Champion',
    issuer: 'UniVerse Impact Platform',
    description: 'Completed 10+ environmental impact projects',
    date: '2025-07-20',
    status: 'verified',
    icon: '🏆',
    projects: 12,
  },
  {
    id: '4',
    type: 'certification',
    title: 'Social Impact Leader',
    issuer: 'NGO Forum International',
    description: 'Leadership in community development initiatives',
    date: '2025-06-01',
    status: 'pending',
    icon: '📜',
  },
];

export default function CredentialDashboardPage() {
  const { user } = useAuthStore();
  const [credentials] = useState<Credential[]>(MOCK_CREDENTIALS);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [isLoading] = useState(false);

  const filtered = selectedType === 'all' ? credentials : credentials.filter(c => c.type === selectedType);
  const verifiedCount = credentials.filter(c => c.status === 'verified').length;

  const handleShare = (credential: Credential) => {
    const shareUrl = `${window.location.origin}/credentials/${credential.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      toast.success('Credential link copied!', { description: 'Share it on LinkedIn or Twitter' });
    });
  };

  const handleShareAll = () => {
    const profileUrl = `${window.location.origin}/profile/${user?.id}`;
    navigator.clipboard.writeText(profileUrl).then(() => {
      toast.success('Profile link copied!', { description: 'Share your full credential portfolio' });
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-3">
              <Shield className="w-3 h-3" />
              Verified Credentials
            </div>
            <h1 className="text-2xl font-black text-white mb-1">Your Credentials</h1>
            <p className="text-zinc-400 text-sm">Your verified achievements, badges, and certifications</p>
          </div>
          <button
            onClick={handleShareAll}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Share Portfolio
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {[
            { label: 'Total Credentials', value: credentials.length, icon: Award, color: 'indigo' },
            { label: 'Verified', value: verifiedCount, icon: CheckCircle2, color: 'emerald' },
            { label: 'Pending', value: credentials.filter(c => c.status === 'pending').length, icon: Clock, color: 'amber' },
            { label: 'Impact Score', value: credentials.filter(c => c.status === 'verified').length * 25, icon: Star, color: 'purple' },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                <div className={`w-8 h-8 rounded-lg bg-${stat.color}-500/20 flex items-center justify-center mb-2`}>
                  <Icon className={`w-4 h-4 text-${stat.color}-400`} />
                </div>
                <div className="text-xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-zinc-500">{stat.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {['all', 'university', 'volunteer', 'badge', 'certification'].map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
              selectedType === type
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            {type === 'all' ? 'All' : TYPE_CONFIG[type as keyof typeof TYPE_CONFIG]?.label || type}
            <span className="ml-1.5 opacity-60">
              {type === 'all' ? credentials.length : credentials.filter(c => c.type === type).length}
            </span>
          </button>
        ))}
      </div>

      {/* Credentials grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((credential) => {
            const typeConfig = TYPE_CONFIG[credential.type];
            const TypeIcon = typeConfig?.icon || Award;
            return (
              <div
                key={credential.id}
                className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-xl bg-${typeConfig?.color}-500/20 border border-${typeConfig?.color}-500/30 flex items-center justify-center text-xl flex-shrink-0`}>
                    {credential.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="text-white font-bold text-sm">{credential.title}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[credential.status]}`}>
                            {credential.status === 'verified' ? '✓ Verified' : credential.status === 'pending' ? '⏳ Pending' : '⚠ Expired'}
                          </span>
                        </div>
                        <p className="text-xs text-indigo-400 font-medium mb-1">{credential.issuer}</p>
                        <p className="text-xs text-zinc-500">{credential.description}</p>
                        {credential.hours && (
                          <p className="text-xs text-emerald-400 mt-1 font-semibold">{credential.hours} verified hours logged</p>
                        )}
                        {credential.projects && (
                          <p className="text-xs text-amber-400 mt-1 font-semibold">{credential.projects}+ projects completed</p>
                        )}
                      </div>
                      <div className="text-xs text-zinc-600 flex-shrink-0">
                        {new Date(credential.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleShare(credential)}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        Copy Link
                      </button>
                      <button className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors">
                        <ExternalLink className="w-3 h-3" />
                        LinkedIn
                      </button>
                      {credential.status === 'verified' && (
                        <button className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors">
                          <Download className="w-3 h-3" />
                          PDF
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <Award className="w-7 h-7 text-zinc-600" />
          </div>
          <p className="text-zinc-400 font-medium mb-1">No credentials yet</p>
          <p className="text-zinc-600 text-sm">Complete projects and courses to earn verified credentials.</p>
        </div>
      )}

      {/* Request credential */}
      <div className="mt-8 p-5 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-white font-bold text-sm mb-1">Request a New Credential</h3>
            <p className="text-zinc-400 text-xs">Have a certification or achievement not listed here? Request verification.</p>
          </div>
          <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors">
            <Plus className="w-4 h-4" />
            Request Verification
          </button>
        </div>
      </div>
    </div>
  );
}
