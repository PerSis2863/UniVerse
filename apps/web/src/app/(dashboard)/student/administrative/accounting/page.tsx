'use client';

import { Topbar } from '@/components/layout/Topbar';
import { CreditCard, DollarSign, Receipt, Clock, Download } from 'lucide-react';
import { toast } from 'sonner';

const TRANSACTIONS = [
  { id: 'TRX-9982', date: 'Aug 15, 2026', desc: 'Fall 2026 Tuition', amount: '$12,500.00', status: 'Paid', type: 'Charge' },
  { id: 'TRX-9983', date: 'Aug 15, 2026', desc: 'Technology Fee', amount: '$450.00', status: 'Paid', type: 'Charge' },
  { id: 'TRX-9984', date: 'Aug 16, 2026', desc: 'Merit Scholarship', amount: '-$5,000.00', status: 'Applied', type: 'Credit' },
  { id: 'TRX-9985', date: 'Aug 20, 2026', desc: 'Online Payment (Visa **4242)', amount: '-$7,950.00', status: 'Completed', type: 'Payment' },
  { id: 'TRX-9986', date: 'Oct 01, 2026', desc: 'Library Fine', amount: '$15.00', status: 'Pending', type: 'Charge' },
];

export default function StudentAccounting() {
  return (
    <>
      <Topbar title="Accounting & Billing" subtitle="Manage your university finances and payments" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="font-medium text-zinc-300">Current Balance</h3>
              </div>
              <div className="text-3xl font-bold text-zinc-900 dark:text-white">$15.00</div>
              <div className="mt-4">
                <button onClick={() => toast.success('Pay Now clicked')} className="w-full bg-red-500 hover:bg-red-600 text-zinc-900 dark:text-white px-4 py-2 rounded-lg font-medium transition-colors">
                  Pay Now
                </button>
              </div>
            </div>
            
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                </div>
                <h3 className="font-medium text-zinc-600 dark:text-zinc-400">Payment Methods</h3>
              </div>
              <div className="text-lg font-medium text-zinc-900 dark:text-white mt-1">Visa ending in 4242</div>
              <div className="text-sm text-zinc-500 dark:text-zinc-500 mb-3">Expires 12/28</div>
              <button onClick={() => toast.success('Manage Methods clicked')} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors">
                Manage Methods
              </button>
            </div>
            
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-green-400" />
                </div>
                <h3 className="font-medium text-zinc-600 dark:text-zinc-400">Next Payment Due</h3>
              </div>
              <div className="text-lg font-medium text-zinc-900 dark:text-white mt-1">Jan 15, 2027</div>
              <div className="text-sm text-zinc-500 dark:text-zinc-500 mb-3">Spring 2027 Tuition</div>
              <button onClick={() => toast.success('View Schedule clicked')} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors">
                View Schedule
              </button>
            </div>
          </div>

          {/* Transactions List */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900/80">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-400" /> Recent Transactions
              </h3>
              <button onClick={() => window.open('/assets/dummy.pdf', '_blank')} className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">
                <Download className="w-4 h-4" /> Download Statement
              </button>
            </div>
            
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="p-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">Date</th>
                  <th className="p-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">Description</th>
                  <th className="p-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">ID</th>
                  <th className="p-4 text-sm font-medium text-zinc-600 dark:text-zinc-400 text-right">Amount</th>
                  <th className="p-4 text-sm font-medium text-zinc-600 dark:text-zinc-400 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {TRANSACTIONS.map((trx) => (
                  <tr key={trx.id} className="hover:bg-zinc-100 dark:bg-zinc-800/30 transition-colors">
                    <td className="p-4 text-sm text-zinc-300">{trx.date}</td>
                    <td className="p-4">
                      <div className="font-medium text-zinc-900 dark:text-white">{trx.desc}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500">{trx.type}</div>
                    </td>
                    <td className="p-4 text-sm text-zinc-500 dark:text-zinc-500">{trx.id}</td>
                    <td className={`p-4 text-sm font-medium text-right ${trx.amount.startsWith('-') ? 'text-green-400' : 'text-zinc-200'}`}>
                      {trx.amount}
                    </td>
                    <td className="p-4 text-right">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                        trx.status === 'Paid' || trx.status === 'Completed' || trx.status === 'Applied' ? 'bg-green-500/10 text-green-400' :
                        trx.status === 'Pending' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {trx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </>
  );
}
