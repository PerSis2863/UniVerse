'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Shield, ExternalLink, CheckCircle2, Clock, Loader2, Plus, X,
  Globe2, ChevronDown, ChevronUp, Sparkles, Lock, Hash, AlertTriangle, XCircle, Download
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
import { SectionTabs, CREDENTIAL_TABS } from '@/components/layout/SectionTabs';
import { safeHref } from '@/lib/safe-href';
import { downloadFile } from '@/lib/download';
import { useAuthStore } from '@/store/auth';
import { QrCode } from '@/components/ui/QrCode';
import { CertificateQrButton, CopyLinkButton } from '@/components/passport/CredentialShare';

type CredentialStatus = 'PENDING' | 'ISSUED' | 'REVOKED' | 'REJECTED' | 'UNVERIFIED_LEGACY';

interface Credential {
  id: string;
  certificateCode: string;
  title: string;
  projectName: string;
  organization: string;
  hoursCompleted: number;
  peopleImpacted: number;
  description?: string | null;
  evidenceUrl?: string | null;
  status: CredentialStatus;
  blockchainHash: string | null;
  signature: string | null;
  signingKeyId: string | null;
  verifiedByName: string | null;
  requestedAt: string;
  issuedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  verifyUrl: string | null;
  blockchain?: {
    status: 'PENDING' | 'CONFIRMED' | 'FAILED';
    network: string | null;
    chainId: number | null;
    txHash: string | null;
    explorerUrl: string | null;
    anchoredAt: string | null;
  } | null;
}

const STATUS_MAP: Record<CredentialStatus, { label: string; color: string; bg: string; dot: string }> = {
  ISSUED: { label: 'Verified & Signed', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  PENDING: { label: 'Awaiting Verification', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400' },
  REVOKED: { label: 'Revoked', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-400' },
  REJECTED: { label: 'Not Approved', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-400' },
  UNVERIFIED_LEGACY: { label: 'Unverified (legacy)', color: 'text-zinc-400', bg: 'bg-zinc-500/10 border-zinc-500/20', dot: 'bg-zinc-400' },
};

function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  if (typeof msg === 'string') return msg;
  return fallback;
}

function RequestCredentialModal({ onClose, onRequested, initial }: { onClose: () => void; onRequested: (c: Credential) => void; initial?: Partial<Record<'title' | 'projectName' | 'organization' | 'hoursCompleted' | 'description', string>> }) {
  const [form, setForm] = useState({ title: '', projectName: '', organization: '', hoursCompleted: '', peopleImpacted: '', description: '', evidenceUrl: '', ...initial });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.projectName.trim() || !form.organization.trim()) return;
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        projectName: form.projectName.trim(),
        organization: form.organization.trim(),
        hoursCompleted: parseInt(form.hoursCompleted, 10) || 0,
        peopleImpacted: parseInt(form.peopleImpacted, 10) || 0,
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.evidenceUrl.trim()) payload.evidenceUrl = form.evidenceUrl.trim();
      const res = await api.post('/impact/blockchain-credentials/request', payload);
      onRequested(res.data);
      toast.success('Request submitted', { description: 'An administrator will verify your work before the credential is signed.' });
      onClose();
    } catch (err) {
      toast.error('Could not submit request', { description: apiErrorMessage(err, 'Please check the form and try again.') });
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none transition-colors';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-bold text-lg flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-400" /> Request a Credential</h2>
            <p className="text-zinc-500 text-xs mt-1">An administrator verifies your work, then the credential is cryptographically signed.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { key: 'title', label: 'Credential Title', placeholder: 'e.g. Clean Water Champion', min: 3, max: 120 },
            { key: 'projectName', label: 'Project Name', placeholder: 'e.g. Water Filtration Initiative', min: 2, max: 160 },
            { key: 'organization', label: 'Organization (NGO / partner)', placeholder: 'e.g. City Food Bank', min: 2, max: 160 },
          ].map(({ key, label, placeholder, min, max }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
              <input value={form[key as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} required minLength={min} maxLength={max}
                className={inputCls} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Hours Completed</label>
              <input type="number" value={form.hoursCompleted} onChange={e => setForm(f => ({ ...f, hoursCompleted: e.target.value }))} placeholder="e.g. 40" min="0" max="10000" step="1"
                className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">People Impacted</label>
              <input type="number" value={form.peopleImpacted} onChange={e => setForm(f => ({ ...f, peopleImpacted: e.target.value }))} placeholder="e.g. 500" min="0" max="10000000" step="1"
                className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Evidence link (optional)</label>
            <input type="url" value={form.evidenceUrl} onChange={e => setForm(f => ({ ...f, evidenceUrl: e.target.value }))} placeholder="https://… (report, photos, NGO letter)" maxLength={500}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} maxLength={2000} placeholder="What did you do and what changed because of it?"
              className={`${inputCls} resize-none`} />
          </div>
          <button type="submit" aria-busy={loading || undefined} disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {loading ? 'Submitting…' : 'Submit for Verification'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function CredentialCard({ cred }: { cred: Credential }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_MAP[cred.status] ?? STATUS_MAP.UNVERIFIED_LEGACY;
  const isVerified = cred.status === 'ISSUED' && !!cred.verifyUrl;
  const dateLabel = cred.issuedAt ?? cred.requestedAt;

  const shareLinkedIn = () => {
    if (!cred.verifyUrl) return;
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(cred.verifyUrl)}`, '_blank', 'noopener,noreferrer');
  };
  const shareTwitter = () => {
    if (!cred.verifyUrl) return;
    const text = `I earned a verified credential: "${cred.title}" — ${cred.hoursCompleted} hours on ${cred.projectName} with ${cred.organization}.`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(cred.verifyUrl)}`, '_blank', 'noopener,noreferrer');
  };
  const holderName = useAuthStore((st) => st.user?.name);
  const certInfo = { title: cred.title, holderName, organization: cred.organization, projectName: cred.projectName, issuedAt: cred.issuedAt, certificateCode: cred.certificateCode };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-all">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            {cred.status === 'PENDING' ? <Clock className="w-6 h-6 text-amber-400" />
              : cred.status === 'REJECTED' || cred.status === 'REVOKED' ? <XCircle className="w-6 h-6 text-red-400" />
              : <Shield className="w-6 h-6 text-emerald-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-white font-bold text-sm">{cred.title}</h3>
                  <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${status.bg} ${status.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                </div>
                <p className="text-xs text-emerald-400 font-medium">{cred.organization}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{cred.projectName}</p>
              </div>
              <div className="flex items-start gap-3 flex-shrink-0">
                <span className="text-xs text-zinc-600">
                  {new Date(dateLabel).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {/* Scannable straight from the card: opens the public verification page */}
                {isVerified && (
                  <CertificateQrButton url={cred.verifyUrl!} cert={certInfo} className="hidden sm:inline-flex rounded-lg p-0.5 bg-gradient-to-br from-indigo-500 to-fuchsia-500 hover:scale-105 transition-transform">
                    <QrCode value={cred.verifyUrl!} size={56} className="rounded-md block" title="QR code for the verification page" />
                  </CertificateQrButton>
                )}
              </div>
            </div>
            <div className="flex gap-4 mt-3 flex-wrap">
              <div className="text-xs"><span className="text-zinc-500">Hours </span><span className="text-white font-bold">{cred.hoursCompleted}</span></div>
              <div className="text-xs"><span className="text-zinc-500">Impacted </span><span className="text-white font-bold">{cred.peopleImpacted.toLocaleString()}</span></div>
              {cred.verifiedByName && isVerified && (
                <div className="text-xs"><span className="text-zinc-500">Verified by </span><span className="text-white font-semibold">{cred.verifiedByName}</span></div>
              )}
              {cred.blockchain?.status === 'CONFIRMED' && (
                <div className="text-xs text-emerald-400 font-semibold">⛓ On-chain</div>
              )}
              {cred.blockchainHash && (
                <div className="text-xs font-mono text-zinc-600 truncate max-w-[140px]" title={cred.blockchainHash}>
                  <Hash className="w-3 h-3 inline mr-1 text-emerald-600" />{cred.blockchainHash.slice(0, 10)}…
                </div>
              )}
            </div>
            {cred.status === 'PENDING' && (
              <p className="text-xs text-amber-400/80 mt-3">An administrator is reviewing this request. You will be able to share it once it is verified.</p>
            )}
            {(cred.status === 'REJECTED' || cred.status === 'REVOKED') && cred.revokedReason && (
              <p className="text-xs text-red-400/80 mt-3">Reason: {cred.revokedReason}</p>
            )}
            {cred.status === 'UNVERIFIED_LEGACY' && (
              <p className="text-xs text-zinc-500 mt-3">Created before verification was introduced. It will be reviewed by an administrator before it can be shared.</p>
            )}
          </div>
        </div>

        {isVerified && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={shareLinkedIn}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-all font-semibold">
              <LinkedinIcon className="w-3 h-3" /> LinkedIn
            </button>
            <button onClick={shareTwitter}
              className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 px-3 py-1.5 rounded-lg transition-all font-semibold">
              <TwitterIcon className="w-3 h-3" /> Twitter / X
            </button>
            <CopyLinkButton url={cred.verifyUrl!}
              className="text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-all" />
            <CertificateQrButton url={cred.verifyUrl!} cert={certInfo} label="QR certificate"
              className="text-fuchsia-300 hover:text-fuchsia-200 bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/15 hover:from-indigo-500/25 hover:to-fuchsia-500/25 border border-fuchsia-500/25 px-3 py-1.5 rounded-lg transition-all" />
            <button onClick={() => downloadFile(`/api/passport/badge/${cred.id}`, 'open-badge.jwt').then(() => toast.success('Open Badge downloaded')).catch((e) => toast.error(e.message))}
              title="Signed Open Badges 3.0 credential for digital wallets and badge platforms"
              className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 px-3 py-1.5 rounded-lg transition-all font-semibold">
              <Download className="w-3 h-3" /> Open Badge
            </button>
            <a href={`/verify/${cred.id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-all font-semibold">
              <ExternalLink className="w-3 h-3" /> Public Page
            </a>
            <button onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-all ml-auto">
              {expanded ? <><ChevronUp className="w-3 h-3" /> Hide Proof</> : <><ChevronDown className="w-3 h-3" /> Show Proof</>}
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {expanded && isVerified && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-zinc-800">
            <div className="p-5 bg-zinc-950/50">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Cryptographic Proof</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs gap-4"><span className="text-zinc-500">Certificate ID</span><span className="font-mono text-zinc-300">{cred.certificateCode}</span></div>
                <div className="flex items-start justify-between text-xs gap-4"><span className="text-zinc-500 flex-shrink-0">SHA-256 Hash</span><span className="font-mono text-emerald-400 text-[10px] break-all text-right">{cred.blockchainHash}</span></div>
                <div className="flex items-start justify-between text-xs gap-4"><span className="text-zinc-500 flex-shrink-0">Ed25519 Signature</span><span className="font-mono text-zinc-300 text-[10px] break-all text-right">{cred.signature}</span></div>
                <div className="flex items-center justify-between text-xs gap-4"><span className="text-zinc-500">Signing Key ID</span><span className="font-mono text-zinc-300">{cred.signingKeyId}</span></div>
                <div className="flex items-center justify-between text-xs gap-4"><span className="text-zinc-500">Format</span><span className="text-zinc-300">W3C Verifiable Credential</span></div>
                <div className="flex items-start justify-between text-xs gap-4">
                  <span className="text-zinc-500 flex-shrink-0">Blockchain</span>
                  {cred.blockchain?.status === 'CONFIRMED' && cred.blockchain.explorerUrl ? (
                    <a href={safeHref(cred.blockchain.explorerUrl)} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 text-right inline-flex items-center gap-1">
                      Anchored on {cred.blockchain.network} <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : cred.blockchain?.status === 'PENDING' ? (
                    <span className="text-amber-400 text-right">Being recorded on {cred.blockchain.network}…</span>
                  ) : (
                    <span className="text-zinc-500 text-right">Not anchored yet</span>
                  )}
                </div>
              </div>
              <div className="mt-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-emerald-400">Signed by UniVerse after admin verification{cred.blockchain?.status === 'CONFIRMED' ? `, and its fingerprint is recorded on ${cred.blockchain.network}` : ''}. Any change to this credential breaks the signature, so anyone with the link can check it is genuine.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function VerifiedCredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  // Verified volunteering (upgrade 5): "Request certificate" on a checked-out shift opens this
  // form filled in (?project=…&org=…&hours=…).
  const [prefill, setPrefill] = useState<{ title: string; projectName: string; organization: string; hoursCompleted: string; description: string } | undefined>();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.get('project')) return;
    // Opened after the first paint, so the page and the server render agree.
    const t = setTimeout(() => {
      window.history.replaceState(null, '', window.location.pathname);
      setPrefill({ title: `Volunteer: ${q.get('project')}`.slice(0, 120), projectName: q.get('project') ?? '', organization: q.get('org') ?? '', hoursCompleted: q.get('hours') ?? '', description: 'Hours verified by check-in on UniVerse.' });
      setShowModal(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Bumping `attempt` (Try again) re-runs the load; state only changes once the request settles
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api.get('/impact/blockchain-credentials')
      .then((res) => { if (!cancelled) { setCredentials(Array.isArray(res.data) ? res.data : []); setLoadError(null); } })
      .catch((err) => { if (!cancelled) setLoadError(apiErrorMessage(err, 'Could not load your credentials.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  const verified = credentials.filter(c => c.status === 'ISSUED');
  const pendingCount = credentials.filter(c => c.status === 'PENDING').length;
  const totalHours = verified.reduce((s, c) => s + c.hoursCompleted, 0);
  const totalImpacted = verified.reduce((s, c) => s + c.peopleImpacted, 0);

  const stats = [
    { label: 'Verified Credentials', val: verified.length, icon: Shield, box: 'bg-emerald-500/5 border-emerald-500/20', ic: 'text-emerald-400' },
    { label: 'Verified Hours', val: totalHours, icon: Clock, box: 'bg-blue-500/5 border-blue-500/20', ic: 'text-blue-400' },
    { label: 'People Impacted', val: totalImpacted.toLocaleString(), icon: Globe2, box: 'bg-amber-500/5 border-amber-500/20', ic: 'text-amber-400' },
  ];

  return (
    <>
      <Topbar title="Credentials & passport" subtitle="Signed, shareable proof of your real-world impact" />
      <SectionTabs tabs={CREDENTIAL_TABS} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-6">

          <div className="grid grid-cols-3 gap-3">
            {stats.map(({ label, val, icon: Icon, box, ic }) => (
              <div key={label} className={`${box} border rounded-2xl p-4`}>
                <Icon className={`w-5 h-5 ${ic} mb-2`} />
                <div className="text-2xl font-black text-white">{val}</div>
                <div className="text-xs text-zinc-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm mb-1">How verified credentials work</h3>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  1. You request a credential for work you completed. 2. An administrator checks it with the partner organization.
                  3. UniVerse signs it with its private key and gives it a public verification page. Employers can open the link and see instantly whether it is genuine, unaltered and not revoked.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-white font-bold text-base">
              Your Credentials <span className="text-zinc-600 font-normal text-sm">({credentials.length}{pendingCount > 0 ? `, ${pendingCount} pending` : ''})</span>
            </h2>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-lg shadow-emerald-500/20">
              <Plus className="w-4 h-4" /> Request Credential
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>
          ) : loadError ? (
            <div className="p-6 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-300">{loadError}</p>
                <button onClick={() => { setLoading(true); setLoadError(null); setAttempt((n) => n + 1); }} className="mt-2 text-xs text-red-300 underline">Try again</button>
              </div>
            </div>
          ) : credentials.length === 0 ? (
            <div className="text-center p-10 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-2xl">
              <Shield className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-white font-semibold">No credentials yet</p>
              <p className="text-xs text-zinc-500 mt-1">Finished a project with a partner organization? Request your first verified credential.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {credentials.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.06 }}>
                  <CredentialCard cred={c} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showModal && <RequestCredentialModal initial={prefill} onClose={() => { setShowModal(false); setPrefill(undefined); }} onRequested={c => setCredentials(prev => [c, ...prev])} />}
      </AnimatePresence>
    </>
  );
}
