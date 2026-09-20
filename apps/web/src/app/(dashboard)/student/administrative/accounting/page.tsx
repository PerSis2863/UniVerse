'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Wallet, CreditCard, Receipt, FileText, Download, CheckCircle2, ArrowRight, Clock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';

import { getUserTransactions } from '@/app/actions/transaction';

// We'll use a hardcoded email for this prototype
const USER_EMAIL = 'student@universe.edu';

export default function AccountingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const searchParams = useSearchParams();

  useEffect(() => {
    const fetchTrx = async () => {
      try {
        const data = await getUserTransactions(USER_EMAIL);
        setTransactions(data);
      } catch (e) {
        console.error('Failed to load transactions', e);
      }
    };
    fetchTrx();
  }, []);

  useEffect(() => {
    if (searchParams.get('success')) {
      toast.success('Payment completed successfully!');
    }
    if (searchParams.get('canceled')) {
      toast.error('Payment was canceled.');
    }
  }, [searchParams]);

  const handlePayment = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 15.00, description: 'Outstanding Balance' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Failed to create payment session.');
      }
    } catch (e) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadStatement = () => {
    toast.success('Downloading full statement...');
    const blob = new Blob(["Full Account Statement for 2026."], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Statement_2026.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <Topbar 
        title="Accounting & Billing" 
        subtitle="Manage your tuition, fees, and payment history." 
        action={{ label: 'Make a Payment', onClick: handlePayment }}
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
              
              <button onClick={handlePayment} disabled={isLoading} className="px-5 py-2.5 rounded-xl bg-white text-indigo-600 font-bold text-sm shadow-md hover:bg-indigo-50 transition-colors flex items-center gap-2 disabled:opacity-50">
                <CreditCard className="w-4 h-4" /> {isLoading ? 'Loading...' : 'Pay Now'}
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
                        {new Date(record.createdAt).toISOString().split('T')[0]}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">{record.id.substring(0, 8)}...</div>
                    </td>
                    <td className="py-4 px-4 text-sm text-zinc-700 dark:text-zinc-300 font-medium">
                      {record.description}
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-normal mt-0.5">Via Stripe</div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-bold text-zinc-900 dark:text-white">${Math.abs(record.amount).toFixed(2)}</span>
                    </td>
                    <td className="py-4 px-4">
                      {record.status === 'PAID' ? (
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
                      {record.status === 'PAID' && (
                        <button onClick={() => toast.success(`Downloading receipt for ${record.id}...`)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/[0.04] hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
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
            <button onClick={downloadStatement} className="text-indigo-600 dark:text-indigo-400 font-semibold text-sm hover:underline flex items-center gap-1.5">
              View full statement <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
