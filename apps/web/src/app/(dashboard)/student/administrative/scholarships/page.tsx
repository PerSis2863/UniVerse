'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Award, CheckCircle2, ChevronRight, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

export default function Scholarships() {
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
              <button onClick={() => toast.success('View All Scholarships clicked')} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1 transition-colors">
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { name: 'STEM Excellence Grant', amount: '$2,500', deadline: 'Oct 31, 2026', type: 'Need-based' },
                { name: 'Alumni Association Award', amount: '$1,000', deadline: 'Nov 15, 2026', type: 'Merit-based' },
              ].map((award, i) => (
                <div key={i} onClick={() => toast.success(`Viewing details for ${award.name}`)} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group cursor-pointer">
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
    </>
  );
}
