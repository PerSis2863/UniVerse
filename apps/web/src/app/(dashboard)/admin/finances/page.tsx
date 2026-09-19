'use client';

import { Topbar } from '@/components/layout/Topbar';
import { DollarSign, ArrowUpRight, ArrowDownRight, CreditCard, Activity, Download, Settings, Plus, X, BarChart3, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const STATS = [
  { label: 'Total Revenue (MTD)', value: '$45,231.89', trend: '+14.2%', up: true, icon: DollarSign, color: 'from-emerald-400 to-teal-500' },
  { label: 'Platform Fees', value: '$4,523.19', trend: '+14.2%', up: true, icon: Wallet, color: 'from-blue-400 to-indigo-500' },
  { label: 'Pending Payouts', value: '$12,450.00', trend: '-2.4%', up: false, icon: CreditCard, color: 'from-amber-400 to-orange-500' },
  { label: 'Active Subscriptions', value: '1,204', trend: '+5.1%', up: true, icon: Activity, color: 'from-purple-400 to-pink-500' }
];

const INITIAL_TRANSACTIONS = [
  { id: 'TRX-1029', date: '2026-10-24', type: 'Course Purchase', amount: 149.00, status: 'Completed', user: 'Alice Johnson' },
  { id: 'TRX-1028', date: '2026-10-24', type: 'Teacher Payout', amount: -1200.00, status: 'Processing', user: 'Dr. Jane Smith' },
  { id: 'TRX-1027', date: '2026-10-23', type: 'Subscription', amount: 29.99, status: 'Completed', user: 'Bob Smith' },
  { id: 'TRX-1026', date: '2026-10-23', type: 'Refund', amount: -149.00, status: 'Completed', user: 'Charlie Brown' },
  { id: 'TRX-1025', date: '2026-10-22', type: 'Course Purchase', amount: 149.00, status: 'Completed', user: 'Diana Prince' },
];

export default function AdminFinances() {
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS);
  const [isExporting, setIsExporting] = useState(false);
  
  // Modal states
  const [isStripeModalOpen, setIsStripeModalOpen] = useState(false);
  const [isAddTrxModalOpen, setIsAddTrxModalOpen] = useState(false);
  
  // Add Trx form
  const [formData, setFormData] = useState({
    type: 'Course Purchase', amount: 0, status: 'Completed', user: ''
  });

  const handleExport = () => {
    setIsExporting(true);
    toast.info('Generating financial report...');
    setTimeout(() => {
      setIsExporting(false);
      toast.success('Report downloaded successfully as CSV.');
    }, 2000);
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const newTrx = {
      id: `TRX-${1030 + transactions.length}`,
      date: new Date().toISOString().split('T')[0],
      type: formData.type,
      amount: formData.amount,
      status: formData.status,
      user: formData.user
    };
    setTransactions([newTrx, ...transactions]);
    setIsAddTrxModalOpen(false);
    toast.success('Transaction added manually.');
  };

  return (
    <>
      <Topbar title="Financial Overview" subtitle="Monitor revenue, platform fees, and payouts" />
      
      {/* Stripe Setup Modal */}
      {isStripeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
            <button onClick={() => setIsStripeModalOpen(false)} className="absolute top-4 right-4 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center text-center space-y-4 pt-4">
              <div className="w-16 h-16 bg-[#635BFF]/10 rounded-full flex items-center justify-center mb-2">
                <CreditCard className="w-8 h-8 text-[#635BFF]" />
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Connect Stripe</h2>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                Integrate your Stripe account to automatically track real-time payments, handle payouts, and sync financial data.
              </p>
              <button 
                onClick={() => {
                  toast.success('Redirecting to Stripe OAuth...');
                  setTimeout(() => setIsStripeModalOpen(false), 1000);
                }}
                className="w-full py-3 bg-[#635BFF] hover:bg-[#635BFF]/90 text-zinc-900 dark:text-white rounded-xl font-medium transition-colors shadow-lg shadow-[#635BFF]/20 mt-4"
              >
                Connect with Stripe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {isAddTrxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Manual Transaction</h2>
              <button onClick={() => setIsAddTrxModalOpen(false)} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddTransaction} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">User / Client</label>
                <input required value={formData.user} onChange={e => setFormData({...formData, user: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500" placeholder="e.g. John Doe" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Transaction Type</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500">
                  <option value="Course Purchase">Course Purchase</option>
                  <option value="Subscription">Subscription</option>
                  <option value="Teacher Payout">Teacher Payout</option>
                  <option value="Refund">Refund</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Amount ($)</label>
                <input required value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} type="number" step="0.01" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Status</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500">
                  <option value="Completed">Completed</option>
                  <option value="Processing">Processing</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 mt-6">
                <button type="submit" className="px-4 py-2 bg-indigo-500 text-zinc-900 dark:text-white rounded-lg font-medium hover:bg-indigo-600 transition-colors">
                  Add Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 p-8 overflow-y-auto bg-[#09090b]">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Header Actions */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 p-5 rounded-2xl backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-zinc-900 dark:text-white font-semibold">Financial Dashboard</h2>
                <span className="text-zinc-600 dark:text-zinc-400 text-sm">Real-time revenue metrics and transactions</span>
              </div>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <button onClick={() => setIsStripeModalOpen(true)} className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-xl hover:bg-zinc-100 dark:bg-zinc-800 hover:text-zinc-900 dark:text-white transition-all shadow-sm">
                <Settings className="w-4 h-4" /> Setup Stripe
              </button>
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-5 py-2.5 bg-white text-black rounded-xl hover:bg-zinc-200 transition-all font-medium shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                {isExporting ? <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <Download className="w-4 h-4" />} 
                {isExporting ? 'Exporting...' : 'Export Report'}
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STATS.map((stat, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-6 relative overflow-hidden group hover:bg-white dark:bg-zinc-900/80 transition-all duration-300">
                <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full bg-gradient-to-br ${stat.color} opacity-[0.03] group-hover:opacity-[0.08] blur-2xl transition-opacity duration-500`}></div>
                
                <div className="flex justify-between items-start mb-4">
                  <div className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">{stat.label}</div>
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.color} bg-opacity-10 shadow-inner`}>
                    <stat.icon className="w-5 h-5 text-zinc-900 dark:text-white" />
                  </div>
                </div>
                
                <div className="text-3xl font-bold text-zinc-900 dark:text-white mb-3 tracking-tight">{stat.value}</div>
                
                <div className={`flex items-center text-xs font-semibold px-2.5 py-1 rounded-full w-max ${
                  stat.up ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {stat.up ? <TrendingUp className="w-3.5 h-3.5 mr-1" /> : <TrendingDown className="w-3.5 h-3.5 mr-1" />}
                  {stat.trend} <span className="text-zinc-500 dark:text-zinc-500 font-normal ml-1">vs last month</span>
                </div>
              </div>
            ))}
          </div>

          {/* Chart Placeholder (CSS visually interesting) */}
          <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>
            
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Revenue Overview</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Monthly breakdown of gross volume</p>
              </div>
              <select className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-300 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500">
                <option>2026</option>
                <option>2025</option>
              </select>
            </div>
            
            <div className="h-64 flex items-end justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800/50 pb-2 relative mt-4">
              {/* Y-axis lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[4,3,2,1,0].map(i => (
                  <div key={i} className="w-full border-t border-zinc-200 dark:border-zinc-800/30 flex items-start">
                    <span className="text-[10px] text-zinc-600 -mt-2.5 bg-[#09090b] pr-2 absolute left-0">${i * 30}k</span>
                  </div>
                ))}
              </div>
              
              {/* Mock Bars */}
              <div className="w-8 flex-shrink-0"></div> {/* Spacer for y-axis labels */}
              {[40, 60, 45, 80, 55, 90, 75, 100, 85, 110, 95, 120].map((h, i) => (
                <div key={i} className="w-full bg-gradient-to-t from-indigo-600/20 to-indigo-400/40 hover:from-indigo-500/40 hover:to-indigo-300/60 border-t border-x border-indigo-400/30 rounded-t-md transition-all duration-300 relative group cursor-pointer" style={{ height: `${h}%` }}>
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-medium py-1 px-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl border border-zinc-700 whitespace-nowrap z-10">
                    ${(h * 300).toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-4 text-xs font-medium text-zinc-500 dark:text-zinc-500 pl-11">
              <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
            </div>
          </div>

          {/* Recent Transactions Table */}
          <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800/50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Recent Transactions</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Latest activity across your platform</p>
              </div>
              <button 
                onClick={() => setIsAddTrxModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Transaction
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-950/50">
                    <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/50">Transaction ID</th>
                    <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/50">Date</th>
                    <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/50">Type</th>
                    <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/50">User</th>
                    <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/50">Amount</th>
                    <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/50">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/30">
                  {transactions.map((trx, i) => (
                    <tr key={i} className="hover:bg-zinc-100 dark:bg-zinc-800/20 transition-colors group">
                      <td className="p-4 font-mono text-xs font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-300">{trx.id}</td>
                      <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400">{trx.date}</td>
                      <td className="p-4 text-sm font-medium text-zinc-900 dark:text-white">{trx.type}</td>
                      <td className="p-4 text-sm text-zinc-300">{trx.user}</td>
                      <td className={`p-4 text-sm font-semibold ${trx.amount > 0 ? 'text-emerald-400' : 'text-zinc-900 dark:text-white'}`}>
                        {trx.amount > 0 ? '+' : ''}${Math.abs(trx.amount).toFixed(2)}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          trx.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          trx.status === 'Processing' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {trx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-zinc-500 dark:text-zinc-500">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
