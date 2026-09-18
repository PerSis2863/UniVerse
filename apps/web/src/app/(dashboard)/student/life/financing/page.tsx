'use client';

import { Topbar } from '@/components/layout/Topbar';
import { DollarSign, FileText, PiggyBank, Landmark } from 'lucide-react';
import { toast } from 'sonner';

export default function FinancingPage() {
  return (
    <>
      <Topbar title="Financing & Scholarships" subtitle="Manage your financial aid and payments" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-6 rounded-2xl">
              <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center mb-4">
                <DollarSign className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="text-zinc-400 text-sm font-medium mb-1">Current Balance</div>
              <div className="text-3xl font-bold text-white">$0.00</div>
              <div onClick={() => toast.success('Viewing statements')} className="mt-4 text-sm text-indigo-400 cursor-pointer hover:underline">View statements &rarr;</div>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-2xl">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center mb-4">
                <PiggyBank className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-zinc-400 text-sm font-medium mb-1">Financial Aid</div>
              <div className="text-3xl font-bold text-white">$4,500</div>
              <div onClick={() => toast.success('Viewing disbursed aid')} className="mt-4 text-sm text-emerald-400 cursor-pointer hover:underline">Disbursed this term &rarr;</div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-white mb-2">Need Help?</h3>
                <p className="text-sm text-zinc-400">Schedule a meeting with a financial aid counselor.</p>
              </div>
              <button onClick={() => toast.success('Booking appointment...')} className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm font-medium">
                Book Appointment
              </button>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="font-bold text-white">Recent Transactions</h3>
              <button onClick={() => toast.success('Downloading tax forms...')} className="text-sm text-zinc-400 hover:text-white flex items-center gap-2">
                <FileText className="w-4 h-4" /> Download Tax Forms
              </button>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                { date: 'Sep 01, 2026', desc: 'Fall Tuition', amount: '-$12,500.00', type: 'charge' },
                { date: 'Aug 28, 2026', desc: 'Merit Scholarship', amount: '+$5,000.00', type: 'credit' },
                { date: 'Aug 25, 2026', desc: 'Federal Grant', amount: '+$7,500.00', type: 'credit' },
              ].map((tx, i) => (
                <div key={i} className="px-6 py-4 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Landmark className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white">{tx.desc}</div>
                      <div className="text-xs text-zinc-500">{tx.date}</div>
                    </div>
                  </div>
                  <div className={`font-semibold ${tx.type === 'credit' ? 'text-emerald-400' : 'text-white'}`}>
                    {tx.amount}
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
