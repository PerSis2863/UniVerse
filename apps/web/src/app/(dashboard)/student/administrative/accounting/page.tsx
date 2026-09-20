'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Wallet, CreditCard, Receipt, FileText, Download, CheckCircle2, ArrowRight, Clock, X, Calendar, User, Search, Filter, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';

import { getUserTransactions } from '@/app/actions/transaction';

// We'll use a hardcoded email for this prototype
const USER_EMAIL = 'student@universe.edu';

const quickActions = [
  { id: 'statements', title: 'View Statements', subtitle: 'Monthly and annual', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'hover:border-blue-500/50' },
  { id: 'disbursed', title: 'Disbursed this term', subtitle: 'Grants and loans', icon: Wallet, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/50' },
  { id: 'appointment', title: 'Book Appointment', subtitle: 'Financial Aid Office', icon: Clock, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'hover:border-purple-500/50' },
  { id: 'tax', title: 'Download Tax Forms', subtitle: '1098-T and more', icon: Download, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'hover:border-orange-500/50' },
];

export default function AccountingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const searchParams = useSearchParams();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  
  // Appointment state
  const [appointmentStep, setAppointmentStep] = useState(1);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string | null>(null);

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

  const downloadFakeFile = (name: string) => {
    toast.success(`Downloading ${name}...`);
    const blob = new Blob([`${name} content.`], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const renderModalContent = () => {
    switch (activeModal) {
      case 'statements':
        return (
          <div className="space-y-4">
            {[
              { date: 'August 2026', type: 'Monthly Statement' },
              { date: 'July 2026', type: 'Monthly Statement' },
              { date: 'Spring 2026', type: 'Term Summary' },
              { date: 'Fall 2025', type: 'Term Summary' },
            ].map((stmt, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-white">{stmt.date}</div>
                    <div className="text-sm text-zinc-500">{stmt.type}</div>
                  </div>
                </div>
                <button onClick={() => downloadFakeFile(stmt.date.replace(' ', '_'))} className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                  <Download className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        );
      case 'disbursed':
        return (
          <div className="space-y-6">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-2xl text-center">
              <h4 className="text-emerald-400 text-sm font-bold mb-1 uppercase tracking-wider">Total Disbursed (Fall 2026)</h4>
              <div className="text-4xl font-black text-white">$12,500.00</div>
            </div>
            
            <div>
              <h3 className="text-lg font-bold text-white mb-4">Breakdown</h3>
              <div className="space-y-3">
                {[
                  { name: 'Federal Pell Grant', amount: '$3,245.00', date: 'Aug 15, 2026' },
                  { name: 'University Merit Scholarship', amount: '$5,000.00', date: 'Aug 15, 2026' },
                  { name: 'Direct Subsidized Loan', amount: '$4,255.00', date: 'Aug 18, 2026' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                    <div>
                      <div className="font-bold text-white">{item.name}</div>
                      <div className="text-sm text-zinc-500">Applied on {item.date}</div>
                    </div>
                    <div className="font-bold text-emerald-400">{item.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'appointment':
        if (appointmentStep === 1) {
          return (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-white">Select a Financial Advisor</h3>
              <div className="grid grid-cols-1 gap-4">
                {[
                  { id: '1', name: 'Sarah Jenkins', role: 'Financial Aid Counselor (A-L)' },
                  { id: '2', name: 'Marcus Chen', role: 'Financial Aid Counselor (M-Z)' },
                  { id: '3', name: 'Dr. Emily Vance', role: 'Scholarship Specialist' },
                ].map(adv => (
                  <div 
                    key={adv.id} 
                    onClick={() => { setSelectedAdvisor(adv.name); setAppointmentStep(2); }}
                    className="flex items-center gap-4 p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl cursor-pointer hover:bg-white/[0.05] hover:border-purple-500/50 transition-all"
                  >
                    <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-bold text-white">{adv.name}</div>
                      <div className="text-sm text-zinc-400">{adv.role}</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-500 ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setAppointmentStep(1)} className="text-sm text-zinc-400 hover:text-white transition-colors">← Back</button>
            </div>
            <h3 className="text-lg font-bold text-white">Select a Time with {selectedAdvisor}</h3>
            
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <Calendar className="w-5 h-5 text-purple-400" />
                <span className="font-medium text-white">Available Next Week</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {['Mon, Sep 28 - 10:00 AM', 'Mon, Sep 28 - 2:30 PM', 'Tue, Sep 29 - 11:15 AM', 'Wed, Sep 30 - 9:00 AM'].map((time, i) => (
                  <button 
                    key={i}
                    onClick={() => {
                      toast.success(`Appointment booked with ${selectedAdvisor} for ${time}`);
                      setTimeout(() => setActiveModal(null), 1000);
                    }}
                    className="p-3 text-sm font-medium text-center bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded-xl hover:bg-purple-500 hover:text-white transition-colors"
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'tax':
        return (
          <div className="space-y-4">
            {[
              { year: '2025', form: '1098-T Tuition Statement', status: 'Available' },
              { year: '2024', form: '1098-T Tuition Statement', status: 'Available' },
              { year: '2023', form: '1098-T Tuition Statement', status: 'Available' },
            ].map((tax, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                    <span className="font-black text-sm">{tax.year}</span>
                  </div>
                  <div>
                    <div className="font-bold text-white">{tax.form}</div>
                    <div className="text-sm text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {tax.status}
                    </div>
                  </div>
                </div>
                <button onClick={() => downloadFakeFile(`${tax.form}_${tax.year}`)} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2">
                  <Download className="w-4 h-4" /> PDF
                </button>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  const getModalConfig = () => {
    return quickActions.find(m => m.id === activeModal);
  };

  // Reset steps when modal opens/closes
  useEffect(() => {
    if (!activeModal) {
      setTimeout(() => {
        setAppointmentStep(1);
        setSelectedAdvisor(null);
      }, 300);
    }
  }, [activeModal]);

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

        {/* Quick Actions */}
        <div>
          <h2 className="font-bold text-lg text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, i) => (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                key={i}
                onClick={() => setActiveModal(action.id)}
                className={`bg-[#0d1117] border border-white/[0.08] rounded-2xl p-5 flex flex-col items-start justify-center hover:bg-white/[0.02] transition-all cursor-pointer group ${action.border}`}
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
              <select className="bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.06] rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-500/50 font-medium [color-scheme:dark]">
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
            <button onClick={() => setActiveModal('statements')} className="text-indigo-600 dark:text-indigo-400 font-semibold text-sm hover:underline flex items-center gap-1.5">
              View full statement <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      <AnimatePresence>
        {activeModal && getModalConfig() && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-zinc-800 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
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
                <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
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
