'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Wallet, CreditCard, Receipt, FileText, Download, CheckCircle2, ArrowRight, Clock, X,      Loader2 } from 'lucide-react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, Suspense } from 'react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';

import { getUserTransactions, createTransaction } from '@/app/actions/transaction';
import { isSampleMode } from '@/lib/sample-mode';
import { getAuthToken } from '@/lib/auth-token';
import { authedFetch } from '@/lib/authed-fetch';
import { useAuthStore } from '@/store/auth';

const quickActions = [
  { id: 'statements', title: 'View Statements', subtitle: 'Payments and receipts', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'hover:border-blue-500/50' },
  { id: 'disbursed', title: 'Financial aid', subtitle: 'Scholarships applied', icon: Wallet, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/50' },
  { id: 'appointment', title: 'Talk to finance', subtitle: 'Contact via Support', icon: Clock, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'hover:border-purple-500/50' },
  { id: 'tax', title: 'Tax documents', subtitle: 'From your institution', icon: Download, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'hover:border-orange-500/50' },
];

/** A payment row (Prisma Payment; dates may arrive as Date objects from the server action). */
interface Txn { id: string; amount: number; currency: string | null; status: string; description: string; createdAt: string | Date }

function AccountingContent() {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const searchParams = useSearchParams();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  

  // Custom Payment State
  const [customAmount, setCustomAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('USD');

  useEffect(() => {
    const fetchTrx = async () => {
      if (!user?.email) return;
      try {
        const data = isSampleMode() ? (await import('@/lib/sample/router')).sampleTransactions(true) : await getUserTransactions(await getAuthToken());
        setTransactions(data);
      } catch (e) {
        console.error('Failed to load transactions', e);
      }
    };
    fetchTrx();
  }, [user?.email]);

  useEffect(() => {
    if (searchParams.get('success')) {
      toast.success('Payment completed successfully!');
    }
    if (searchParams.get('canceled')) {
      toast.error('Payment was canceled.');
    }
  }, [searchParams]);

  const handlePayment = async (amount: number, selectedCurrency: string) => {
    if (!user?.email) return;
    if (isSampleMode()) { toast.error('Payments aren’t available in sample mode. Exit sample mode to pay.'); return; }
    setIsLoading(true);
    try {
      // Create a new pending transaction for the custom amount
      const pendingTrx = await createTransaction(await getAuthToken(), {
        amount: amount,
        currency: selectedCurrency,
        description: 'Custom Payment',
        status: 'PENDING',
        userEmail: user.email
      });

      if ('error' in pendingTrx) {
        throw new Error(pendingTrx.error as string);
      }
      console.log('pendingTrx:', pendingTrx);

      const res = await authedFetch('/api/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ transactionId: pendingTrx.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Failed to create payment session.');
      }
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || 'An error occurred while creating the payment session.');
    } finally {
      setIsLoading(false);
    }
  };

  const completedPayments = transactions.filter((t) => t.status === 'COMPLETED' && t.amount > 0);
  const totalPaidThisYear = completedPayments
    .filter((t) => new Date(t.createdAt).getFullYear() === new Date().getFullYear())
    .reduce((n, t) => n + t.amount, 0);

  const downloadStatement = () => {
    if (transactions.length === 0) return void toast.info('No payments to include yet.');
    const cell = (v: unknown) => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const rows = [['Date', 'Description', 'Amount', 'Currency', 'Status', 'Receipt'],
      ...transactions.map((t) => [new Date(t.createdAt).toISOString().slice(0, 10), t.description, t.amount, t.currency || 'USD', t.status,
        t.status === 'COMPLETED' ? `${window.location.origin}/receipt/${t.id}` : ''])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `payment-statement-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  const renderModalContent = () => {
    switch (activeModal) {
      case 'statements':
        return (
          <div className="space-y-4">
            {transactions.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-6">You have no payments yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                    <div>
                      <div className="font-bold text-white">{t.description}</div>
                      <div className="text-sm text-zinc-500">{new Date(t.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })} · {t.status.toLowerCase()}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-white tabular-nums">{t.currency || 'USD'} {Number(t.amount).toFixed(2)}</span>
                      {t.status === 'COMPLETED' && (
                        <a href={`/receipt/${t.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-indigo-400 hover:underline">Receipt</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={downloadStatement} className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Download statement (CSV)
            </button>
          </div>
        );
      case 'disbursed':
        return (
          <div className="text-center py-6 space-y-3">
            <p className="text-white font-semibold">No aid disbursements recorded</p>
            <p className="text-sm text-zinc-400 max-w-sm mx-auto">Scholarships and financial aid applied to your account by your institution will appear here.</p>
            <a href="/student/administrative/scholarships" className="inline-block text-sm font-semibold text-indigo-400 hover:underline">Browse scholarships</a>
          </div>
        );
      case 'appointment':
        return (
          <div className="text-center py-6 space-y-3">
            <p className="text-white font-semibold">Talk to the finance office</p>
            <p className="text-sm text-zinc-400 max-w-sm mx-auto">Send a request through Support and the finance team will reply to arrange a time with an advisor.</p>
            <a href="/student/support" className="btn-primary">Contact finance via Support</a>
          </div>
        );
      case 'tax':
        return (
          <div className="text-center py-6 space-y-3">
            <p className="text-white font-semibold">Tax documents</p>
            <p className="text-sm text-zinc-400 max-w-sm mx-auto">Official tax forms are issued by your institution&apos;s finance office. Your payment statement and receipts are available under Statements.</p>
            <button onClick={() => setActiveModal('statements')} className="text-sm font-semibold text-indigo-400 hover:underline">View statements</button>
          </div>
        );
      case 'custom_payment':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Amount to Pay</label>
              <div className="relative flex gap-3">
                <select aria-label="Currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="bg-[#121830] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-indigo-500 transition-colors font-semibold"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                </select>
                <div className="relative flex-1">
                  <span className="absolute left-4 top-3.5 text-zinc-500 font-bold">
                    {currency === 'USD' || currency === 'CAD' || currency === 'AUD' ? '$' : 
                     currency === 'EUR' ? '€' : 
                     currency === 'GBP' ? '£' : 
                     currency === 'INR' ? '₹' : ''}
                  </span>
                  <input 
                    type="number" 
                    value={customAmount} 
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full bg-[#121830] border border-white/[0.08] rounded-xl pl-8 pr-4 py-3 text-white text-lg focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="0.00"
                    min="1.00"
                    step="0.01"
                    autoFocus
                  />
                </div>
              </div>
            </div>
            <button 
              onClick={() => handlePayment(Number(customAmount), currency)} 
              disabled={isLoading || !customAmount || Number(customAmount) < 1}
              className="btn-primary btn-lg w-full"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
              {isLoading ? 'Processing...' : 'Proceed to Checkout'}
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  const getModalConfig = () => {
    if (activeModal === 'custom_payment') {
      return { id: 'custom_payment', title: 'Make a Payment', subtitle: 'Enter custom amount', icon: Wallet, color: 'text-indigo-400', bg: 'bg-indigo-500/10' };
    }
    return quickActions.find(m => m.id === activeModal);
  };


  return (
    <>
      <Topbar 
        title="Accounting & Billing" 
        subtitle="Manage your tuition, fees, and payment history." 
        action={{ label: 'Make a Payment', onClick: () => setActiveModal('custom_payment') }}
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
                <Wallet className="w-5 h-5" /> Make Custom Payment
              </div>
              <div className="text-4xl font-black mb-2">Flexible</div>
              <p className="text-sm text-indigo-100/80 mb-6">Pay any custom amount you choose.</p>
              
              <button onClick={() => setActiveModal('custom_payment')} disabled={isLoading} className="px-5 py-2.5 rounded-xl bg-white text-indigo-600 font-bold text-sm shadow-md hover:bg-indigo-50 transition-colors flex items-center gap-2 disabled:opacity-50">
                <CreditCard className="w-4 h-4" /> Pay Custom Amount
              </button>
            </div>
          </motion.div>

          <KpiCard title={`Total paid (${new Date().getFullYear()})`} value={`$${totalPaidThisYear.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={Receipt} color="emerald" />
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="font-bold text-lg text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, i) => (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i, 6) * 0.03 }}
                key={i}
                onClick={() => setActiveModal(action.id)}
                className={`bg-[#121830] border border-white/[0.08] rounded-2xl p-5 flex flex-col items-start justify-center hover:bg-white/[0.02] transition-all cursor-pointer group ${action.border}`}
              >
                <div className={`w-12 h-12 rounded-xl ${action.bg} ${action.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <action.icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-white mb-1 text-sm">{action.title}</h3>
                <p className="text-xs text-zinc-400">{action.subtitle}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Detailed List */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" /> Transaction History
            </h2>
            <div className="flex gap-2">
              <select aria-label="Show" className="bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.06] rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-500/50 font-medium [color-scheme:dark]">
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
                    transition={{ delay: Math.min(i, 6) * 0.03 }}
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
                      {record.status === 'COMPLETED' ? (
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
                      {record.status === 'COMPLETED' && (
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => window.open(`/receipt/${record.id}`, '_blank')} 
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/[0.04] hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-xs font-semibold"
                          >
                            <FileText className="w-3.5 h-3.5" /> View
                          </button>
                          <button 
                            onClick={() => window.open(`/receipt/${record.id}?download=true`, '_blank')} 
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/[0.04] hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-xs font-semibold"
                          >
                            <Download className="w-3.5 h-3.5" /> Download
                          </button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 flex justify-center">
            <button onClick={() => setActiveModal('statements')} className="text-indigo-600 dark:text-indigo-400 font-semibold text-sm hover:underline flex items-center gap-1.5">
              View full statement <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      <AnimatePresence>
        {activeModal && getModalConfig() && (
          <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#121830] border border-zinc-800 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                <div className="flex items-center gap-3">
                  <div className={`p-2 ${getModalConfig()?.bg} ${getModalConfig()?.color} rounded-lg`}>
                    {(() => {
                      const Icon = getModalConfig()!.icon;
                      return <Icon className="w-5 h-5" />;
                    })()}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{getModalConfig()?.title}</h2>
                    <p className="text-sm text-zinc-400">{getModalConfig()?.subtitle}</p>
                  </div>
                </div>
                <button aria-label="Close" onClick={() => setActiveModal(null)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto">
                {renderModalContent()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function AccountingPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 min-h-[50vh] p-8 flex items-center justify-center">
        <ContentSkeleton variant="table" />
      </div>
    }>
      <AccountingContent />
    </Suspense>
  );
}
