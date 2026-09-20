'use client';

import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Award, CheckCircle2, ChevronRight, GraduationCap, X } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const ALL_SCHOLARSHIPS = [
  { name: 'STEM Excellence Grant', amount: '$2,500', deadline: 'Oct 31, 2026', type: 'Need-based', description: 'Awarded to undergraduate students pursuing degrees in Science, Technology, Engineering, or Mathematics with demonstrated financial need. Applicants must maintain a 3.0 GPA.' },
  { name: 'Alumni Association Award', amount: '$1,000', deadline: 'Nov 15, 2026', type: 'Merit-based', description: 'Funded by the generous donations of our alumni network. This award recognizes students with exceptional leadership and community service records.' },
  { name: 'Global Perspectives Scholarship', amount: '$3,000', deadline: 'Dec 01, 2026', type: 'Merit-based', description: 'Designed to support students planning to study abroad or participate in international exchange programs. Requires a brief essay on global citizenship.' },
  { name: 'First-Generation Student Grant', amount: '$2,000', deadline: 'Jan 15, 2027', type: 'Need-based', description: 'Provides financial assistance to students who are the first in their immediate family to attend a four-year college or university.' }
];

export default function Scholarships() {
  const [selectedScholarship, setSelectedScholarship] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);

  const displayedScholarships = showAll ? ALL_SCHOLARSHIPS : ALL_SCHOLARSHIPS.slice(0, 2);
  return (
    <>
      <Topbar title="Scholarships" subtitle="View and apply for financial aid and scholarships" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Award className="w-8 h-8 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">Active Scholarships</h2>
                <div className="text-zinc-300">You currently have 1 active scholarship for the 2026-2027 academic year.</div>
              </div>
            </div>
            <div className="text-center md:text-right">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">Total Awarded</div>
              <div className="text-3xl font-bold text-zinc-900 dark:text-white">$5,000</div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Your Awards</h3>
            
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <div className="flex justify-between items-start border-b border-zinc-200 dark:border-zinc-800/50 pb-6 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-lg font-medium text-zinc-900 dark:text-white">University Merit Scholarship</h4>
                    <span className="flex items-center gap-1 text-xs font-medium bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">Awarded for outstanding academic achievement during the previous academic year. Must maintain a 3.5 GPA to renew.</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xl font-bold text-zinc-900 dark:text-white">$5,000</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-500">Per Academic Year</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-zinc-500 dark:text-zinc-500 mb-1">Award Date</div>
                  <div className="font-medium text-zinc-200">May 15, 2026</div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-500 mb-1">Term Applied</div>
                  <div className="font-medium text-zinc-200">Fall 2026 / Spring 2027</div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-500 mb-1">Requirement</div>
                  <div className="font-medium text-zinc-200">3.5 GPA</div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-500 mb-1">Status</div>
                  <div className="font-medium text-zinc-200">Disbursed</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Available to Apply</h3>
              <button onClick={() => setShowAll(!showAll)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1 transition-colors">
                {showAll ? 'Show Less' : 'View All'} <ChevronRight className={`w-4 h-4 transition-transform ${showAll ? 'rotate-90' : ''}`} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {displayedScholarships.map((award, i) => (
                <div key={i} onClick={() => setSelectedScholarship(award)} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group cursor-pointer">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-zinc-900 dark:text-white group-hover:text-indigo-400 transition-colors">{award.name}</h4>
                      <div className="text-sm text-zinc-500 dark:text-zinc-500 mt-0.5">{award.type}</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500 mb-1">Deadline</div>
                      <div className="text-sm font-medium text-zinc-300">{award.deadline}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-zinc-900 dark:text-white">{award.amount}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <AnimatePresence>
        {selectedScholarship && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden p-8 relative"
            >
              <button 
                onClick={() => setSelectedScholarship(null)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{selectedScholarship.name}</h3>
                  <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mt-1">{selectedScholarship.type}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Award Amount</div>
                  <div className="font-bold text-zinc-900 dark:text-white text-lg">{selectedScholarship.amount}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Deadline</div>
                  <div className="font-bold text-zinc-900 dark:text-white text-lg">{selectedScholarship.deadline}</div>
                </div>
              </div>

              <div className="mb-8">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Description & Requirements</h4>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {selectedScholarship.description}
                </p>
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setSelectedScholarship(null)}
                  className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 font-bold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={() => {
                    toast.success(`Application started for ${selectedScholarship.name}`);
                    setSelectedScholarship(null);
                  }}
                  className="flex-1 btn-primary py-3 rounded-xl font-bold text-sm"
                >
                  Apply Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
