'use client';

import { Topbar } from '@/components/layout/Topbar';
import { ShieldCheck, ToggleRight, ToggleLeft, AlertCircle, X, ChevronRight, Info } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const CONSENT_DETAILS = {
  marketing: {
    title: 'Marketing & Communications',
    shortDesc: 'Receive promotional emails about university events, merchandise, and third-party offers.',
    longDesc: 'By opting in, you allow the university to send you promotional materials. This includes early access to event tickets, discounts at the university store, and offers from affiliated third-party partners. We promise not to spam your inbox, typically sending no more than 2 emails per month.',
    lastUpdated: 'Aug 15, 2026'
  },
  alumni: {
    title: 'Alumni Network Directory',
    shortDesc: 'Allow your name, major, and graduation year to be visible in the alumni network directory after graduation.',
    longDesc: 'The Alumni Network Directory is an exclusive platform for graduates to connect, network, and find mentorship opportunities. Opting in makes your basic profile (Name, Major, Graduation Year, and LinkedIn link if provided) searchable by other verified alumni.',
    lastUpdated: 'Sept 01, 2025'
  },
  photo: {
    title: 'Photo & Media Release',
    shortDesc: 'Consent to the university using photographs or video footage containing your likeness for promotional materials.',
    longDesc: 'This consent allows our marketing team to use photos or videos taken at public university events (like sports games, fairs, or commencement) in our official brochures, websites, and social media channels. It does not apply to private settings like classrooms.',
    lastUpdated: 'Never'
  },
  research: {
    title: 'Academic Research Data',
    shortDesc: 'Allow anonymized academic performance data to be used by university researchers for educational studies.',
    longDesc: 'Your academic data (grades, course selections, demographics) is strictly anonymized and aggregated. It is used by internal researchers to study trends in higher education, improve curriculum design, and publish academic papers. Your identity is never revealed.',
    lastUpdated: 'Aug 10, 2026'
  }
};

type ConsentKey = keyof typeof CONSENT_DETAILS;

export default function StudentConsents() {
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({
    marketing: false,
    alumni: true,
    photo: false,
    research: true,
  });

  const [activeModal, setActiveModal] = useState<ConsentKey | null>(null);

  const toggleConsent = (key: ConsentKey) => {
    setConsents(prev => {
      const newState = !prev[key];
      if (newState) {
        toast.success(`Consent granted for ${CONSENT_DETAILS[key].title}`);
      } else {
        toast.info(`Consent revoked for ${CONSENT_DETAILS[key].title}`);
      }
      return { ...prev, [key]: newState };
    });
  };

  return (
    <>
      <Topbar title="My Consents" subtitle="Manage your data privacy and sharing preferences" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-6 flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Privacy matters to us</h3>
              <p className="text-sm text-zinc-300 leading-relaxed max-w-2xl">
                We are committed to protecting your personal information. Below you can manage how the university uses your data for non-essential academic purposes. Essential data processing for your enrollment cannot be opted out of.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Data Sharing Preferences</h3>
            </div>
            
            <div className="divide-y divide-zinc-800">
              {(Object.keys(CONSENT_DETAILS) as ConsentKey[]).map((key) => (
                <div 
                  key={key}
                  onClick={() => setActiveModal(key)}
                  className="p-6 flex items-center justify-between gap-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-medium text-zinc-900 dark:text-white group-hover:text-indigo-400 transition-colors">{CONSENT_DETAILS[key].title}</div>
                      {consents[key] ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">Active</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500">Inactive</span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">{CONSENT_DETAILS[key].shortDesc}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 flex items-start gap-4">
            <AlertCircle className="w-5 h-5 text-zinc-600 dark:text-zinc-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Changes to your consent preferences are saved automatically and may take up to 48 hours to be fully processed across all university systems. If you have questions about data processing, please contact the Data Protection Officer.
            </div>
          </div>

        </div>
      </div>

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
                      <span className="font-semibold text-emerald-400 flex items-center gap-1"><ToggleRight className="w-4 h-4" /> Granted</span>
                    ) : (
                      <span className="font-semibold text-zinc-400 flex items-center gap-1"><ToggleLeft className="w-4 h-4" /> Revoked</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setActiveModal(null)} className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-6">
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-white mb-2">What this means</h4>
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
                      Last updated: {CONSENT_DETAILS[activeModal].lastUpdated}
                    </div>
                  </div>
                  <button 
                    onClick={() => toggleConsent(activeModal)} 
                    className="flex-shrink-0 text-indigo-400 focus:outline-none transition-transform hover:scale-105"
                  >
                    {consents[activeModal] ? <ToggleRight className="w-12 h-12" /> : <ToggleLeft className="w-12 h-12 text-zinc-600" />}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
