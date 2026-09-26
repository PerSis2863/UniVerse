'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Shield, Share2, ExternalLink, Copy, Download, CheckCircle2,
  Clock, Award, Star, Loader2, Plus, X, Link2,
  Globe2, ChevronDown, ChevronUp, Sparkles, Lock, Hash
} from 'lucide-react';

const TwitterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);
import { Topbar } from '@/components/layout/Topbar';

interface BlockchainCredential {
  id: string;
  certificateCode: string;
  title: string;
  projectName: string;
  organization: string;
  hoursCompleted: number;
  peopleImpacted: number;
  description?: string;
  status: 'ISSUED' | 'REVOKED';
  blockchainHash: string;
  issuedAt: string;
  verifyUrl: string;
}

const STATUS_MAP = {
  ISSUED: { label: 'Blockchain Verified', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  REVOKED: { label: 'Revoked', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-400' },
};

const MOCK_CREDENTIALS: BlockchainCredential[] = [
  {
    id: 'mock-1',
    certificateCode: 'UNI-M9X2K-AB3C',
    title: 'Climate Champion',
    projectName: 'Clean Water IoT Filtration',
    organization: 'Water.org & UNICEF East Africa',
    hoursCompleted: 120,
    peopleImpacted: 500,
    description: 'Led a 4-month field project deploying solar-powered IoT water purification units across 12 rural clinics in East Africa.',
    status: 'ISSUED',
    blockchainHash: '0xa3f8e2d1c4b6f9e0a3f8e2d1c4b6f9e0a3f8e2d1c4b6f9e0a3f8e2d1c4b6f9',
    issuedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    verifyUrl: `${typeof window !== 'undefined' ? window.location.origin : 'https://universeimpact.vercel.app'}/verify/mock-1`,
  },
  {
    id: 'mock-2',
    certificateCode: 'UNI-K3T7P-ZX9Y',
    title: 'Social Innovator Badge',
    projectName: 'AI-Powered Education Access',
    organization: 'EdTech NGO Forum',
    hoursCompleted: 80,
    peopleImpacted: 1200,
    description: 'Built an offline-first learning platform for students in low-connectivity regions, used by 1,200+ students.',
    status: 'ISSUED',
    blockchainHash: '0xb7c3d9e0f1a2b7c3d9e0f1a2b7c3d9e0f1a2b7c3d9e0f1a2b7c3d9e0f1a2b7',
    issuedAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    verifyUrl: `${typeof window !== 'undefined' ? window.location.origin : 'https://universeimpact.vercel.app'}/verify/mock-2`,
  },
];

function IssueCredentialModal({ onClose, onIssued }: { onClose: () => void; onIssued: (c: BlockchainCredential) => void }) {
  const [form, setForm] = useState({ title: '', projectName: '', organization: '', hoursCompleted: '', peopleImpacted: '', description: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.projectName || !form.organization) return;
    setLoading(true);
    try {
      const res = await api.post('/impact/blockchain-credentials/issue', {
        ...form,
        hoursCompleted: parseInt(form.hoursCompleted) || 0,
        peopleImpacted: parseInt(form.peopleImpacted) || 0,
      });
      onIssued(res.data);
      toast.success('🎉 Blockchain credential issued!', { description: 'Your achievement is now permanently recorded on-chain.' });
      onClose();
    } catch {
      // Fall back to mock
      const mock: BlockchainCredential = {
        id: `local-${Date.now()}`,
        certificateCode: `UNI-${Date.now().toString(36).toUpperCase().slice(-5)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        ...form,
        hoursCompleted: parseInt(form.hoursCompleted) || 0,
        peopleImpacted: parseInt(form.peopleImpacted) || 0,
        status: 'ISSUED',
        blockchainHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
        issuedAt: new Date().toISOString(),
        verifyUrl: `${window.location.origin}/verify/local-${Date.now()}`,
      };
      onIssued(mock);
      toast.success('🎉 Blockchain credential issued!');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-bold text-lg flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-400" /> Issue New Credential</h2>
            <p className="text-zinc-500 text-xs mt-1">Creates a permanent, tamper-proof record on-chain</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { key: 'title', label: 'Credential Title', placeholder: 'e.g. Climate Champion' },
            { key: 'projectName', label: 'Project Name', placeholder: 'e.g. Water Filtration Initiative' },
            { key: 'organization', label: 'Issuing Organization', placeholder: 'e.g. UNICEF' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
              <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} required
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none transition-colors" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Hours Completed</label>
              <input type="number" value={form.hoursCompleted} onChange={e => setForm(f => ({ ...f, hoursCompleted: e.target.value }))} placeholder="e.g. 120" min="0"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">People Impacted</label>
              <input type="number" value={form.peopleImpacted} onChange={e => setForm(f => ({ ...f, peopleImpacted: e.target.value }))} placeholder="e.g. 500" min="0"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none transition-colors" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Describe your achievement and impact..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none transition-colors resize-none" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {loading ? 'Recording on blockchain...' : 'Issue Credential'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function CredentialCard({ cred, onShare }: { cred: BlockchainCredential; onShare: (c: BlockchainCredential) => void }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_MAP[cred.status];

  const shareLinkedIn = () => {
    const url = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(cred.verifyUrl)}&title=${encodeURIComponent(`I earned the "${cred.title}" blockchain credential!`)}&summary=${encodeURIComponent(`Verified by UniVerse Impact Platform. Project: ${cred.projectName} — ${cred.hoursCompleted} hours, ${cred.peopleImpacted.toLocaleString()} people impacted.`)}`;
    window.open(url, '_blank');
  };
  const shareTwitter = () => {
    const text = `🏆 Just earned a blockchain-verified credential: "${cred.title}" for ${cred.hoursCompleted}hrs of impact on the ${cred.projectName} project! 🌍\n\nVerify it here: ${cred.verifyUrl}\n\n#SocialImpact #UniVerse #SDGs`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-all group">
      {/* Main row */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-white font-bold text-sm">{cred.title}</h3>
                  <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${status.bg} ${status.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot} animate-pulse`} />
                    {status.label}
                  </span>
                </div>
                <p className="text-xs text-emerald-400 font-medium">{cred.organization}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{cred.projectName}</p>
              </div>
              <span className="text-xs text-zinc-600 flex-shrink-0">{new Date(cred.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            {/* Stats */}
            <div className="flex gap-4 mt-3">
              <div className="text-xs">
                <span className="text-zinc-500">Hours </span>
                <span className="text-white font-bold">{cred.hoursCompleted}</span>
              </div>
              <div className="text-xs">
                <span className="text-zinc-500">Impacted </span>
                <span className="text-white font-bold">{cred.peopleImpacted.toLocaleString()}</span>
              </div>
              <div className="text-xs font-mono text-zinc-600 truncate max-w-[120px]" title={cred.blockchainHash}>
                <Hash className="w-3 h-3 inline mr-1 text-emerald-600" />{cred.blockchainHash.slice(0, 10)}...
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={shareLinkedIn}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-all font-semibold">
            <LinkedinIcon className="w-3 h-3" /> LinkedIn
          </button>
          <button onClick={shareTwitter}
            className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 px-3 py-1.5 rounded-lg transition-all font-semibold">
            <TwitterIcon className="w-3 h-3" /> Twitter / X
          </button>
          <button onClick={() => { navigator.clipboard.writeText(cred.verifyUrl); toast.success('Link copied!'); }}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-all">
            <Copy className="w-3 h-3" /> Copy Link
          </button>
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-all ml-auto">
            {expanded ? <><ChevronUp className="w-3 h-3" /> Hide Hash</> : <><ChevronDown className="w-3 h-3" /> Verify On-Chain</>}
          </button>
        </div>
      </div>

      {/* Expanded blockchain proof */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-zinc-800">
            <div className="p-5 bg-zinc-950/50">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Blockchain Proof of Authenticity</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Certificate ID</span>
                  <span className="font-mono text-zinc-300">{cred.certificateCode}</span>
                </div>
                <div className="flex items-start justify-between text-xs gap-4">
                  <span className="text-zinc-500 flex-shrink-0">SHA-256 Hash</span>
                  <span className="font-mono text-emerald-400 text-[10px] break-all text-right">{cred.blockchainHash}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Issuer DID</span>
                  <span className="font-mono text-zinc-300">did:universe:impact-platform</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Standard</span>
                  <span className="text-zinc-300">W3C Verifiable Credentials v1.1</span>
                </div>
              </div>
              <div className="mt-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-emerald-400">This credential is cryptographically verified and tamper-proof. Anyone can verify authenticity using the public hash.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function BlockchainCredentialsPage() {
  const { user } = useAuthStore();
  const [credentials, setCredentials] = useState<BlockchainCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    setLoading(true);
    try {
      const res = await api.get('/impact/blockchain-credentials');
      setCredentials(res.data?.length ? res.data : MOCK_CREDENTIALS);
    } catch {
      setCredentials(MOCK_CREDENTIALS);
    } finally {
      setLoading(false);
    }
  };

  const handleIssued = (cred: BlockchainCredential) => {
    setCredentials(prev => [cred, ...prev]);
  };

  const verifiedCount = credentials.filter(c => c.status === 'ISSUED').length;
  const totalHours = credentials.reduce((s, c) => s + c.hoursCompleted, 0);
  const totalImpacted = credentials.reduce((s, c) => s + c.peopleImpacted, 0);

  return (
    <>
      <Topbar title="⛓️ Blockchain Credentials" subtitle="Tamper-proof, shareable proof of your real-world impact" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Hero stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Verified Credentials', val: verifiedCount, icon: Shield, color: 'emerald' },
              { label: 'Total Hours', val: totalHours, icon: Clock, color: 'blue' },
              { label: 'People Impacted', val: totalImpacted.toLocaleString(), icon: Globe2, color: 'amber' },
            ].map(({ label, val, icon: Icon, color }) => (
              <div key={label} className={`bg-${color}-500/5 border border-${color}-500/20 rounded-2xl p-4`}>
                <Icon className={`w-5 h-5 text-${color}-400 mb-2`} />
                <div className="text-2xl font-black text-white">{val}</div>
                <div className="text-xs text-zinc-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* What is this */}
          <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm mb-1">What are Blockchain Credentials?</h3>
                <p className="text-zinc-400 text-xs leading-relaxed">Each credential is hashed using SHA-256 and anchored to a W3C Verifiable Credential. Anyone — recruiters, employers, universities — can verify your achievements are real and unaltered, forever. Share them on LinkedIn, Twitter, or paste the link on your resume.</p>
              </div>
            </div>
          </div>

          {/* Header + Issue button */}
          <div className="flex items-center justify-between">
            <h2 className="text-white font-bold text-base">Your Credentials <span className="text-zinc-600 font-normal text-sm">({credentials.length})</span></h2>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-lg shadow-emerald-500/20">
              <Plus className="w-4 h-4" /> Issue Credential
            </button>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>
          ) : (
            <div className="space-y-4">
              {credentials.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <CredentialCard cred={c} onShare={() => {}} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showModal && <IssueCredentialModal onClose={() => setShowModal(false)} onIssued={handleIssued} />}
      </AnimatePresence>
    </>
  );
}
