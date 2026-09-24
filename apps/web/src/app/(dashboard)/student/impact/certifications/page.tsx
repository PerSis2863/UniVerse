'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  Award, Download, ExternalLink, Copy, Shield, CheckCircle2,
  Clock, Hash, Building2, Users, FileText
} from 'lucide-react';
import { toast } from 'sonner';

interface Certificate {
  id: string;
  certificateCode: string;
  title: string;
  projectName: string;
  organization: string;
  hoursCompleted: number;
  peopleImpacted: number;
  description: string;
  blockchainHash: string | null;
  issuedAt: string;
  status: 'ISSUED' | 'DRAFT' | 'REVOKED';
}

const DEMO_CERTS: Certificate[] = [
  {
    id: '1', certificateCode: 'CERT_X7K92', title: 'Verified Social Impact',
    projectName: 'Clean Water Kenya', organization: 'WaterAid Kenya',
    hoursCompleted: 40, peopleImpacted: 500,
    description: 'Successfully completed the Clean Water Kenya project, improving access to clean water for 500+ people.',
    blockchainHash: '0x7f3da82c...e91f', issuedAt: '2025-08-20T00:00:00Z', status: 'ISSUED',
  },
  {
    id: '2', certificateCode: 'CERT_M3P45', title: 'Digital Literacy Champion',
    projectName: 'Digital Literacy Program', organization: 'Tech4Good',
    hoursCompleted: 25, peopleImpacted: 150,
    description: 'Mentored 15 students achieving a 100% pass rate in basic programming skills.',
    blockchainHash: '0x4e1bf93a...b27d', issuedAt: '2025-07-15T00:00:00Z', status: 'ISSUED',
  },
  {
    id: '3', certificateCode: 'CERT_R9L67', title: 'Community Health Advocate',
    projectName: 'Health Awareness Campaign', organization: 'Red Cross',
    hoursCompleted: 18, peopleImpacted: 300,
    description: 'Organized health screening events in 3 rural communities.',
    blockchainHash: null, issuedAt: '2025-09-10T00:00:00Z', status: 'DRAFT',
  },
];

export default function CertificationsPage() {
  const { user } = useAuthStore();
  const [certs] = useState<Certificate[]>(DEMO_CERTS);
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);

  const handleCopyLink = (cert: Certificate) => {
    const url = `${window.location.origin}/certificates/${cert.certificateCode}`;
    navigator.clipboard.writeText(url);
    toast.success('Certificate link copied!');
  };

  const handleLinkedIn = (cert: Certificate) => {
    const url = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(cert.title)}&organizationName=${encodeURIComponent(cert.organization)}&certId=${cert.certificateCode}&certUrl=${encodeURIComponent(window.location.origin + '/certificates/' + cert.certificateCode)}`;
    window.open(url, '_blank');
  };

  const handleTwitter = (cert: Certificate) => {
    const text = `🎉 I just earned the "${cert.title}" certificate from ${cert.organization}! ${cert.peopleImpacted} people impacted. #SocialImpact #UniVerseImpact`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold mb-3">
          <Award className="w-3 h-3" />
          Digital Certificates
        </div>
        <h1 className="text-2xl font-black text-white mb-1">Impact Certificates</h1>
        <p className="text-zinc-400 text-sm">Blockchain-verified certificates for completed social impact projects</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-white">{certs.filter(c => c.status === 'ISSUED').length}</div>
          <div className="text-xs text-zinc-500 mt-1">🏆 Certificates Earned</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-white">{certs.reduce((s, c) => s + c.hoursCompleted, 0)}</div>
          <div className="text-xs text-zinc-500 mt-1">⏱️ Total Hours</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-white">{certs.reduce((s, c) => s + c.peopleImpacted, 0)}</div>
          <div className="text-xs text-zinc-500 mt-1">👥 People Impacted</div>
        </div>
      </div>

      {/* Certificates */}
      <div className="space-y-4">
        {certs.map(cert => (
          <div key={cert.id} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors">
            {/* Certificate Header - Gradient banner */}
            <div className={`px-5 py-3 ${cert.status === 'ISSUED' ? 'bg-gradient-to-r from-purple-500/20 to-indigo-500/20' : 'bg-zinc-800/50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎉</span>
                  <div>
                    <span className="text-white font-bold text-sm">Congratulations!</span>
                    <span className="text-zinc-400 text-xs ml-2">You&apos;ve earned a Certificate</span>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                  cert.status === 'ISSUED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                  'bg-amber-500/20 text-amber-400 border-amber-500/30'
                }`}>
                  {cert.status === 'ISSUED' ? '✓ Issued' : '⏳ Pending'}
                </span>
              </div>
            </div>

            {/* Certificate Body */}
            <div className="p-5">
              <h3 className="text-white font-black text-lg mb-1">&quot;{cert.title}&quot;</h3>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  <div>
                    <div className="text-[10px] text-zinc-500">Project</div>
                    <div className="text-xs text-white font-medium">{cert.projectName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                  <div>
                    <div className="text-[10px] text-zinc-500">Organization</div>
                    <div className="text-xs text-white font-medium">{cert.organization}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <div>
                    <div className="text-[10px] text-zinc-500">Hours Completed</div>
                    <div className="text-xs text-white font-medium">{cert.hoursCompleted}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  <div>
                    <div className="text-[10px] text-zinc-500">Impact</div>
                    <div className="text-xs text-white font-medium">{cert.peopleImpacted} people helped</div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {cert.status === 'ISSUED' && (
                <div className="flex flex-wrap gap-2 mt-4">
                  <button className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors">
                    <Download className="w-3 h-3" /> View Certificate
                  </button>
                  <button onClick={() => handleLinkedIn(cert)} className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors">
                    <ExternalLink className="w-3 h-3" /> Add to LinkedIn
                  </button>
                  <button onClick={() => handleTwitter(cert)} className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors">
                    <ExternalLink className="w-3 h-3" /> Share on Twitter
                  </button>
                </div>
              )}

              {/* Blockchain verification */}
              <div className="mt-4 pt-3 border-t border-zinc-800">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[11px] text-zinc-500">Certificate ID: <span className="text-cyan-400 font-mono font-bold">{cert.certificateCode}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-zinc-500">
                      Blockchain: {cert.blockchainHash
                        ? <span className="text-emerald-400 font-bold">✅ Verified</span>
                        : <span className="text-amber-400">⏳ Pending</span>
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
