'use client';

import { Topbar } from '@/components/layout/Topbar';
import { AlertTriangle, ShieldAlert, Phone, Send, Info } from 'lucide-react';

export default function BeeSafeReporting() {
  return (
    <>
      <Topbar title="BeeSafe Reporting" subtitle="Confidential platform for safety and incident reporting" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-red-400 mb-1">In an emergency, call 911 immediately.</h3>
                <p className="text-sm text-red-300/80 max-w-xl">
                  This system is for non-emergency reporting. Reports submitted here are reviewed during regular business hours. For immediate on-campus assistance, contact Campus Security.
                </p>
              </div>
            </div>
            <button className="flex-shrink-0 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-zinc-900 dark:text-white px-6 py-3 rounded-lg font-bold transition-colors w-full md:w-auto">
              <Phone className="w-5 h-5" /> Call Campus Security
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8">
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-indigo-400" /> Submit an Incident Report
                </h3>
                
                <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Incident Type</label>
                    <select className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none">
                      <option>Select an option...</option>
                      <option>Academic Integrity Violation</option>
                      <option>Bullying or Harassment</option>
                      <option>Facilities or Maintenance Hazard</option>
                      <option>Suspicious Activity</option>
                      <option>Theft or Property Damage</option>
                      <option>Other / Not Sure</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Date of Incident</label>
                      <input type="date" className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Time of Incident</label>
                      <input type="time" className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Location</label>
                    <input type="text" placeholder="Where did this happen? (e.g., Library 2nd Floor)" className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Detailed Description</label>
                    <textarea rows={5} placeholder="Please provide as much detail as possible about what occurred, who was involved, and any witnesses..." className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"></textarea>
                  </div>

                  <div className="bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" className="mt-1 flex-shrink-0" />
                      <div>
                        <div className="font-medium text-zinc-900 dark:text-white mb-1">Submit Anonymously</div>
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          By checking this box, your name and contact information will not be attached to this report. Note that this may limit our ability to investigate or follow up with you.
                        </div>
                      </div>
                    </label>
                  </div>

                  <button className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white px-6 py-3.5 rounded-lg font-medium transition-colors">
                    <Send className="w-5 h-5" /> Submit Report Securely
                  </button>
                </form>
              </div>

            </div>

            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-4">Confidentiality Notice</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                  The BeeSafe Reporting system is designed to provide a secure and confidential way for students, faculty, and staff to report concerns.
                </p>
                <div className="flex items-start gap-2 bg-indigo-500/10 text-indigo-400 p-3 rounded-lg text-xs leading-relaxed">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  All reports are encrypted and routed only to designated safety and conduct officials.
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-4">Other Resources</h3>
                <div className="space-y-3">
                  <a href="#" className="block p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:bg-zinc-800 text-zinc-300 hover:text-zinc-900 dark:text-white transition-colors text-sm">
                    Counseling & Psychological Services
                  </a>
                  <a href="#" className="block p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:bg-zinc-800 text-zinc-300 hover:text-zinc-900 dark:text-white transition-colors text-sm">
                    Title IX Office
                  </a>
                  <a href="#" className="block p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:bg-zinc-800 text-zinc-300 hover:text-zinc-900 dark:text-white transition-colors text-sm">
                    Student Ombuds Services
                  </a>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
