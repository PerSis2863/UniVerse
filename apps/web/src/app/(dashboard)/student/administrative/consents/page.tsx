'use client';

import { Topbar } from '@/components/layout/Topbar';
import { ShieldCheck, ToggleRight, ToggleLeft, AlertCircle } from 'lucide-react';
import { useState } from 'react';

export default function StudentConsents() {
  const [consents, setConsents] = useState({
    marketing: false,
    alumni: true,
    photo: false,
    research: true,
  });

  const toggleConsent = (key: keyof typeof consents) => {
    setConsents(prev => ({ ...prev, [key]: !prev[key] }));
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
              
              <div className="p-6 flex items-center justify-between gap-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                <div>
                  <div className="font-medium text-zinc-900 dark:text-white mb-1">Marketing & Communications</div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Receive promotional emails about university events, merchandise, and third-party offers.</div>
                </div>
                <button onClick={() => toggleConsent('marketing')} className="flex-shrink-0 text-indigo-400 focus:outline-none transition-transform hover:scale-110">
                  {consents.marketing ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10 text-zinc-600" />}
                </button>
              </div>

              <div className="p-6 flex items-center justify-between gap-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                <div>
                  <div className="font-medium text-zinc-900 dark:text-white mb-1">Alumni Network Directory</div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Allow your name, major, and graduation year to be visible in the alumni network directory after graduation.</div>
                </div>
                <button onClick={() => toggleConsent('alumni')} className="flex-shrink-0 text-indigo-400 focus:outline-none transition-transform hover:scale-110">
                  {consents.alumni ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10 text-zinc-600" />}
                </button>
              </div>

              <div className="p-6 flex items-center justify-between gap-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                <div>
                  <div className="font-medium text-zinc-900 dark:text-white mb-1">Photo & Media Release</div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Consent to the university using photographs or video footage containing your likeness for promotional materials and websites.</div>
                </div>
                <button onClick={() => toggleConsent('photo')} className="flex-shrink-0 text-indigo-400 focus:outline-none transition-transform hover:scale-110">
                  {consents.photo ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10 text-zinc-600" />}
                </button>
              </div>

              <div className="p-6 flex items-center justify-between gap-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                <div>
                  <div className="font-medium text-zinc-900 dark:text-white mb-1">Academic Research Data</div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Allow anonymized academic performance data to be used by university researchers for educational studies.</div>
                </div>
                <button onClick={() => toggleConsent('research')} className="flex-shrink-0 text-indigo-400 focus:outline-none transition-transform hover:scale-110">
                  {consents.research ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10 text-zinc-600" />}
                </button>
              </div>

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
    </>
  );
}
