'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

import { Topbar } from '@/components/layout/Topbar';
import {
  ShieldCheck,
  ToggleRight,
  ToggleLeft,
  AlertCircle,
  X,
  ChevronRight,
  Info,
  Scale,
  FileCheck,
  Send,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { authedJson } from '@/lib/authed-fetch';

const CONSENT_DETAILS = {
  MARKETING: {
    title: 'Marketing & Communications',
    shortDesc: 'Receive promotional emails about university events, merchandise, and third-party offers.',
    longDesc: 'By opting in, you allow the university to send you promotional materials. This includes early access to event tickets, discounts at the university store, and offers from affiliated third-party partners. We promise not to spam your inbox, typically sending no more than 2 emails per month.',
    lastUpdated: 'Aug 15, 2026',
  },
  ALUMNI: {
    title: 'Alumni Network Directory',
    shortDesc: 'Allow your name, major, and graduation year to be visible in the alumni network directory after graduation.',
    longDesc: 'The Alumni Network Directory is an exclusive platform for graduates to connect, network, and find mentorship opportunities. Opting in makes your basic profile (Name, Major, Graduation Year, and LinkedIn link if provided) searchable by other verified alumni.',
    lastUpdated: 'Sept 01, 2025',
  },
  PHOTO: {
    title: 'Photo & Media Release',
    shortDesc: 'Consent to the university using photographs or video footage containing your likeness for promotional materials.',
    longDesc: 'This consent allows our marketing team to use photos or videos taken at public university events (like sports games, fairs, or commencement) in our official brochures, websites, and social media channels. It does not apply to private settings like classrooms.',
    lastUpdated: 'Never',
  },
  RESEARCH: {
    title: 'Academic Research Data',
    shortDesc: 'Allow anonymized academic performance data to be used by university researchers for educational studies.',
    longDesc: 'Your academic data (grades, course selections, demographics) is strictly anonymized and aggregated. It is used by internal researchers to study trends in higher education, improve curriculum design, and publish academic papers. Your identity is never revealed.',
    lastUpdated: 'Aug 10, 2026',
  },
  FERPA_DIRECTORY: {
    title: 'Directory Information Disclosure (FERPA)',
    shortDesc: 'Permit disclosure of non-confidential directory information under FERPA 34 CFR § 99.37.',
    longDesc: 'Under FERPA, directory information (such as full name, major, honors, dates of attendance, and enrollment status) may be disclosed to external academic institutions and verifiers without prior written consent unless you opt out. Opting out restricts all public verification.',
    lastUpdated: 'Oct 12, 2026',
  },
  DPDP_AI_PROCESSING: {
    title: 'AI Processing & Personalization (India DPDP Act)',
    shortDesc: 'Consent to automated learning recommendations, career matching, and personalized AI tutor analysis.',
    longDesc: 'Under Section 6 of India\'s Digital Personal Data Protection Act 2023, you can grant or withdraw permission for automated algorithmic processing. This powers personalized study schedules, adaptive quiz recommendations, and smart course advising without impacting standard coursework.',
    lastUpdated: 'Oct 12, 2026',
  },
  CAREER_MATCHING: {
    title: 'Corporate Career & Recruiter Matching',
    shortDesc: 'Allow verified corporate partners to view your verifiable credential badges and portfolio.',
    longDesc: 'When enabled, verified partner employers and campus recruiters can match your academic milestones and verified skill badges with active internship and placement openings. Your contact information is never shared without direct interview confirmation.',
    lastUpdated: 'Oct 12, 2026',
  },
};

type ConsentKey = keyof typeof CONSENT_DETAILS;

interface GrievanceItem {
  id: string;
  requestType: 'CORRECTION' | 'ERASURE' | 'NOMINATION' | 'GRIEVANCE' | 'DATA_ACCESS';
  details: string;
  nomineeName?: string | null;
  nomineeEmail?: string | null;
  status: 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  resolutionNote?: string | null;
  createdAt: string;
}

interface FerpaLogItem {
  id: string;
  recordType: string;
  reason?: string | null;
  createdAt: string;
  actor: {
    name: string | null;
    email: string | null;
    role: string;
  };
}

/** Consent toggles & DPDP/FERPA compliance manager. Shown in Settings → Consents. */
export function ConsentsPanel({ embedded = false }: { embedded?: boolean }) {
  const { data, isLoading, mutate } = useSWR<{ type: ConsentKey; granted: boolean }[]>('/consents/my', fetcher, {
    onError: () => toast.error('Failed to load consents'),
  });

  const { data: grievances, mutate: mutateGrievances } = useSWR<GrievanceItem[]>('/api/compliance/grievance', authedJson);
  const { data: ferpaLogs } = useSWR<FerpaLogItem[]>('/api/compliance/ferpa/logs', authedJson);

  const consents: Record<ConsentKey, boolean> = {
    MARKETING: false,
    ALUMNI: false,
    PHOTO: false,
    RESEARCH: false,
    FERPA_DIRECTORY: true,
    DPDP_AI_PROCESSING: true,
    CAREER_MATCHING: false,
  };
  for (const c of data ?? []) {
    if (c.type in consents) consents[c.type as ConsentKey] = c.granted;
  }

  const [activeModal, setActiveModal] = useState<ConsentKey | null>(null);

  // Data Principal Grievance form state
  const [showGrievanceModal, setShowGrievanceModal] = useState(false);
  const [requestType, setRequestType] = useState<'CORRECTION' | 'ERASURE' | 'NOMINATION' | 'GRIEVANCE' | 'DATA_ACCESS'>('GRIEVANCE');
  const [details, setDetails] = useState('');
  const [nomineeName, setNomineeName] = useState('');
  const [nomineeEmail, setNomineeEmail] = useState('');
  const [submittingGrievance, setSubmittingGrievance] = useState(false);

  const toggleConsent = async (key: ConsentKey) => {
    const newState = !consents[key];
    const others = (data ?? []).filter((c) => c.type !== key);
    void mutate([...others, { type: key, granted: newState }], { revalidate: false });
    try {
      await api.post('/consents/upsert', { type: key, granted: newState });
      if (newState) {
        toast.success(`Consent granted for ${CONSENT_DETAILS[key].title}`);
      } else {
        toast.info(`Consent revoked for ${CONSENT_DETAILS[key].title}`);
      }
    } catch {
      toast.error('Failed to update consent');
      void mutate();
    }
  };

  const submitGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!details.trim() && requestType !== 'NOMINATION') {
      toast.error('Please provide details for your request');
      return;
    }
    if (requestType === 'NOMINATION' && (!nomineeName.trim() || !nomineeEmail.trim())) {
      toast.error('Nominee name and email are required');
      return;
    }

    setSubmittingGrievance(true);
    try {
      await authedJson('/api/compliance/grievance', {
        method: 'POST',
        body: JSON.stringify({
          requestType,
          details,
          nomineeName: requestType === 'NOMINATION' ? nomineeName : null,
          nomineeEmail: requestType === 'NOMINATION' ? nomineeEmail : null,
        }),
      });
      toast.success('Your compliance request has been registered with the DPO office');
      setShowGrievanceModal(false);
      setDetails('');
      setNomineeName('');
      setNomineeEmail('');
      void mutateGrievances();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register request';
      toast.error(msg);
    } finally {
      setSubmittingGrievance(false);
    }
  };

  if (isLoading) {
    return (
      <>
        {!embedded && <Topbar title="My Consents & Privacy" subtitle="Manage your data privacy and sharing preferences" />}
        <div className={embedded ? 'py-10 flex justify-center' : 'flex-1 flex items-center justify-center'}>
          <ContentSkeleton variant="list" />
        </div>
      </>
    );
  }

  return (
    <>
      {!embedded && <Topbar title="My Consents & Privacy" subtitle="Manage your data privacy, FERPA disclosures, and DPDP Act rights" />}

      <div className={embedded ? '' : 'flex-1 p-4 sm:p-8 overflow-y-auto'}>
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Hero Banner */}
          <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-emerald-500/10 border border-indigo-500/20 rounded-2xl p-6 flex items-start gap-4 shadow-sm">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">
                Your Privacy & Educational Data Rights
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-2xl">
                UniVerse adheres strictly to India’s <strong>Digital Personal Data Protection Act 2023</strong> and the US <strong>FERPA (34 CFR Part 99)</strong>. Below you can grant or withdraw non-essential data consents, review educational record access logs, or petition the Data Protection Officer directly.
              </p>
            </div>
          </div>

          {/* Consents Card */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  Data Sharing & Processing Preferences
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Click any item to inspect the statutory legal basis and toggle consent
                </p>
              </div>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {(Object.keys(CONSENT_DETAILS) as ConsentKey[]).map((key) => (
                <div
                  key={key}
                  onClick={() => setActiveModal(key)}
                  className="p-5 flex items-center justify-between gap-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-semibold text-sm text-zinc-900 dark:text-white group-hover:text-indigo-400 transition-colors">
                        {CONSENT_DETAILS[key].title}
                      </div>
                      {consents[key] ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
                          Revoked
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {CONSENT_DETAILS[key].shortDesc}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
                </div>
              ))}
            </div>
          </div>

          {/* Data Principal Rights (India DPDP Act 2023 Sections 11–14) */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Scale className="w-4 h-4 text-indigo-500" /> Data Principal Rights (India DPDP Act 2023)
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Exercise statutory rights of correction, erasure, legal representative nomination, or file a privacy grievance.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGrievanceModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all"
              >
                <Send className="w-3.5 h-3.5" /> File DPDP Request
              </button>
            </div>

            {/* List of submitted grievances */}
            {grievances && grievances.length > 0 ? (
              <div className="space-y-3 pt-2">
                {grievances.map((g) => (
                  <div
                    key={g.id}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px]">
                          {g.requestType}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            g.status === 'RESOLVED'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : g.status === 'REJECTED'
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-amber-500/10 text-amber-500'
                          }`}
                        >
                          {g.status}
                        </span>
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400">
                        {g.details || (g.nomineeName ? `Nominee: ${g.nomineeName} (${g.nomineeEmail})` : 'Statutory filing')}
                      </p>
                      {g.resolutionNote && (
                        <p className="text-indigo-600 dark:text-indigo-400 font-medium">
                          Resolution: {g.resolutionNote}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-400 whitespace-nowrap">
                      {new Date(g.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                No active DPDP privacy grievances or nomination filings registered.
              </div>
            )}
          </div>

          {/* FERPA Inspection Log (34 CFR Part 99.32) */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-indigo-500" /> Educational Record Inspection Logs (FERPA)
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Audit trail of administrative or faculty inspections of your official academic records under 34 CFR § 99.32.
              </p>
            </div>

            {ferpaLogs && ferpaLogs.length > 0 ? (
              <div className="space-y-2 pt-1">
                {ferpaLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white">
                        <span>{log.actor.name || log.actor.email || 'School Official'}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {log.recordType}
                        </span>
                      </div>
                      <p className="text-zinc-500">
                        {log.reason ? `Reason: ${log.reason}` : 'Official educational review'}
                      </p>
                    </div>
                    <span className="text-[11px] text-zinc-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                No recent administrative inspections of your educational records logged.
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 flex items-start gap-4">
            <AlertCircle className="w-5 h-5 text-zinc-600 dark:text-zinc-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Changes to your consent preferences are saved instantly across all campus edge nodes. If you have questions regarding data processing or wish to contact our Data Protection Officer directly, please reach out to{' '}
              <a href="mailto:dpo@universeimpact.com" className="text-indigo-600 dark:text-indigo-300 underline underline-offset-2">
                dpo@universeimpact.com
              </a>.
            </div>
          </div>
        </div>
      </div>

      {/* Consent Detail Modal */}
      <AnimatePresence>
        {activeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setActiveModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/50">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {CONSENT_DETAILS[activeModal].title}
                  </h2>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500">Status:</span>
                    {consents[activeModal] ? (
                      <span className="font-semibold text-emerald-400 flex items-center gap-1">
                        <ToggleRight className="w-4 h-4" /> Granted
                      </span>
                    ) : (
                      <span className="font-semibold text-zinc-400 flex items-center gap-1">
                        <ToggleLeft className="w-4 h-4" /> Revoked
                      </span>
                    )}
                  </div>
                </div>
                <button
                  aria-label="Close"
                  onClick={() => setActiveModal(null)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-white mb-2">Statutory Basis & Scope</h4>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        {CONSENT_DETAILS[activeModal].longDesc}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                  <div>
                    <div className="font-medium text-white mb-1">
                      {consents[activeModal] ? 'Revoke Consent' : 'Grant Consent'}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Policy revision: {CONSENT_DETAILS[activeModal].lastUpdated}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleConsent(activeModal)}
                    className="flex-shrink-0 text-indigo-400 focus:outline-none transition-transform hover:scale-105"
                  >
                    {consents[activeModal] ? (
                      <ToggleRight className="w-12 h-12" />
                    ) : (
                      <ToggleLeft className="w-12 h-12 text-zinc-600" />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DPDP Act 2023 Request Modal */}
      <AnimatePresence>
        {showGrievanceModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowGrievanceModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/50">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">
                    Exercise DPDP Act Rights
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Statutory request under India DPDP Act 2023 (Sections 11–14)
                  </p>
                </div>
                <button
                  aria-label="Close"
                  onClick={() => setShowGrievanceModal(false)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={submitGrievance} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Request Category
                  </label>
                  <select
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value as typeof requestType)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="GRIEVANCE">Privacy Grievance (Section 13)</option>
                    <option value="CORRECTION">Record Correction (Section 12)</option>
                    <option value="ERASURE">Data Erasure Request (Section 12)</option>
                    <option value="NOMINATION">Nominate Representative (Section 14)</option>
                    <option value="DATA_ACCESS">Data Portability / Access (Section 11)</option>
                  </select>
                </div>

                {requestType === 'NOMINATION' ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                        Nominee Full Name
                      </label>
                      <input
                        type="text"
                        value={nomineeName}
                        onChange={(e) => setNomineeName(e.target.value)}
                        placeholder="e.g. Legal Guardian or Nominee"
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                        Nominee Email Address
                      </label>
                      <input
                        type="email"
                        value={nomineeEmail}
                        onChange={(e) => setNomineeEmail(e.target.value)}
                        placeholder="nominee@example.com"
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                      Request Details & Justification
                    </label>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      rows={4}
                      placeholder="Describe the inaccurate records, data to erase, or privacy grievance details..."
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none resize-none"
                    />
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowGrievanceModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingGrievance}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
                  >
                    {submittingGrievance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Submit Request
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
