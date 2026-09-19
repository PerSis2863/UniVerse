'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Wallet, CreditCard, Receipt, FileText, Download, CheckCircle2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const transactions = [
  { id: 'TXN-001', date: 'Sept 01, 2026', description: 'Fall Semester Tuition Fee', amount: '$4,500.00', status: 'Paid', method: 'Credit Card' },
  { id: 'TXN-002', date: 'Aug 15, 2026', description: 'Lab Equipment Fee', amount: '$150.00', status: 'Paid', method: 'Bank Transfer' },
  { id: 'TXN-003', date: 'Jul 30, 2026', description: 'Library Late Fee', amount: '$15.00', status: 'Pending', method: '-' },
  { id: 'TXN-004', date: 'Jan 10, 2026', description: 'Spring Semester Tuition Fee', amount: '$4,200.00', status: 'Paid', method: 'Scholarship' },
];

export default function AccountingPage() {
  return (
    <>
      <Topbar 
        title="Accounting & Billing" 
        subtitle="Manage your tuition, fees, and payment history." 
        action={{ label: 'Make a Payment', onClick: () => console.log('Payment clicked') }}
      />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto">
        
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white relative overflow-hidden shadow-xl shadow-indigo-500/20"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 text-indigo-100 font-medium mb-4">
                <Wallet className="w-5 h-5" /> Outstanding Balance
              </div>
              <div className="text-4xl font-black mb-2">$15.00</div>
              <p className="text-sm text-indigo-100/80 mb-6">Due by Sept 30, 2026</p>
              
              <button className="px-5 py-2.5 rounded-xl bg-white text-indigo-600 font-bold text-sm shadow-md hover:bg-indigo-50 transition-colors flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Pay Now
              </button>
            </div>
          </motion.div>

          <KpiCard title="Total Paid (2026)" value="$8,850.00" icon={Receipt} change={5} color="emerald" />
        </div>

        {/* Detailed List */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" /> Transaction History
            </h2>
            <div className="flex gap-2">
              <select className="bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.06] rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-500/50 font-medium">
                <option>All Transactions</option>
                <option>Payments</option>
                <option>Charges</option>
                <option>Refunds</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/[0.06] text-sm text-zinc-500 dark:text-zinc-400">
                  <th className="pb-3 font-medium px-4">Date & ID</th>
                  <th className="pb-3 font-medium px-4">Description</th>
                  <th className="pb-3 font-medium px-4">Amount</th>
                  <th className="pb-3 font-medium px-4">Status</th>
                  <th className="pb-3 font-medium px-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((record, i) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={record.id} 
                    className="border-b border-zinc-100 dark:border-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="py-4 px-4">
                      <div className="font-medium text-zinc-900 dark:text-white text-sm">
                        {record.date}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">{record.id}</div>
                    </td>
                    <td className="py-4 px-4 text-sm text-zinc-700 dark:text-zinc-300 font-medium">
                      {record.description}
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-normal mt-0.5">Via {record.method}</div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-bold text-zinc-900 dark:text-white">{record.amount}</span>
                    </td>
                    <td className="py-4 px-4">
                      {record.status === 'Paid' ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-500/20">
                          <Clock className="w-3.5 h-3.5" /> Pending
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {record.status === 'Paid' && (
                        <button className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/[0.04] hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 flex justify-center">
            <button className="text-indigo-600 dark:text-indigo-400 font-semibold text-sm hover:underline flex items-center gap-1.5">
              View full statement <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
