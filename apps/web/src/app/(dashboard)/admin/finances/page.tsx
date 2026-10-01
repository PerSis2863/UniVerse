'use client';

import { Topbar } from '@/components/layout/Topbar';
import { DollarSign, ArrowUpRight, ArrowDownRight, CreditCard, Activity, Download, Settings, Plus, X, BarChart3, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { createTransaction, getTransactions } from '@/app/actions/transaction';
import { getAuthToken } from '@/lib/auth-token';
import { isSampleMode } from '@/lib/sample-mode';
import { AdminSearch, PersonCell, matchesQuery, personText } from '@/components/admin/AdminPeople';

export default function AdminFinances() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const data = (isSampleMode() ? (await import('@/lib/sample/router')).sampleTransactions() : await getTransactions(await getAuthToken()));
        setTransactions(data);
      } catch (e) {
        console.error('Failed to load transactions', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTransactions();
  }, []);

  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString(undefined, { month: 'short' }), total: 0 };
    });
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const t of transactions) {
      if (t.status !== 'COMPLETED' || !(t.amount > 0)) continue;
      const d = new Date(t.createdAt);
      const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (bucket) bucket.total += t.amount;
    }
    return months;
  }, [transactions]);
  const maxMonthlyRevenue = Math.max(1, ...monthlyRevenue.map((m) => m.total));

  const stats = useMemo(() => {
    const completedIn = (y: number, m: number) => transactions
      .filter((t) => t.amount > 0 && t.status === 'COMPLETED' && new Date(t.createdAt).getFullYear() === y && new Date(t.createdAt).getMonth() === m)
      .reduce((acc, t) => acc + t.amount, 0);
    const now = new Date();
    const thisMonth = completedIn(now.getFullYear(), now.getMonth());
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = completedIn(prev.getFullYear(), prev.getMonth());
    const change = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;
    const totalRevenue = transactions.filter(t => t.amount > 0 && t.status === 'COMPLETED').reduce((acc, t) => acc + t.amount, 0);
    const pending = transactions.filter(t => t.status === 'PENDING');
    const pendingPayouts = Math.abs(pending.filter(t => t.amount < 0).reduce((acc, t) => acc + t.amount, 0));

    return [
      { label: 'Total Revenue', value: `$${totalRevenue.toFixed(2)}`, note: 'All completed payments', icon: DollarSign, color: 'from-emerald-400 to-teal-500' },
      { label: 'This Month', value: `$${thisMonth.toFixed(2)}`, note: change == null ? (thisMonth > 0 ? 'No revenue last month to compare' : 'No payments yet this month') : `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs last month`, up: change == null ? undefined : change >= 0, icon: Wallet, color: 'from-blue-400 to-indigo-500' },
      { label: 'Pending Payouts', value: `$${pendingPayouts.toFixed(2)}`, note: `${pending.length} pending transaction${pending.length === 1 ? '' : 's'}`, icon: CreditCard, color: 'from-amber-400 to-orange-500' },
      { label: 'Total Transactions', value: transactions.length.toString(), note: 'Recorded in UniVerse', icon: Activity, color: 'from-purple-400 to-pink-500' }
    ];
  }, [transactions]);

  const [isExporting, setIsExporting] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const shownTransactions = useMemo(
    () => transactions.filter((t) => (statusFilter === 'ALL' || t.status === statusFilter) && matchesQuery(q, t.description, t.status, t.id, String(t.amount), personText(t.user))),
    [transactions, q, statusFilter],
  );
  
  // Modal states
  const [isStripeModalOpen, setIsStripeModalOpen] = useState(false);
  const [isAddTrxModalOpen, setIsAddTrxModalOpen] = useState(false);
  
  // Add Trx form
  const [formData, setFormData] = useState({
    type: 'Course Purchase', amount: 0, status: 'Completed', user: ''
  });

  const handleExport = () => {
    // Exports what the table shows (search and status filter applied).
    if (!shownTransactions.length) return void toast.info(transactions.length ? 'No transactions match your search.' : 'No transactions to export yet.');
    setIsExporting(true);
    try {
      const cell = (v: unknown) => { let x = String(v ?? ''); if (/^[=+\-@]/.test(x)) x = `'${x}`; return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
      const rows = shownTransactions.map((t) => [t.id, new Date(t.createdAt).toISOString().slice(0, 10), t.description ?? '', t.user?.name ?? '', t.user?.email ?? '', t.user?.role ?? '', t.user?.phone ?? '', Number(t.amount).toFixed(2), t.status]);
      const csv = [['Transaction ID', 'Date', 'Description', 'User', 'Email', 'Role', 'Phone', 'Amount (USD)', 'Status'], ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
      Object.assign(document.createElement('a'), { href: url, download: `finance-report-${new Date().toISOString().slice(0, 10)}.csv` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Exported ${rows.length} transactions`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSampleMode()) {
      const amount = formData.type === 'Teacher Payout' || formData.type === 'Refund' ? -Math.abs(formData.amount) : Math.abs(formData.amount);
      setTransactions((cur) => [{ id: `sample-trx-${Date.now()}`, description: formData.type, amount, status: formData.status.toUpperCase(), createdAt: new Date().toISOString(), user: { name: formData.user || 'Sample user', email: formData.user } }, ...cur]);
      setIsAddTrxModalOpen(false);
      toast('Added in sample mode — not saved');
      return;
    }
    try {
      const newTrx = await createTransaction(await getAuthToken(), {
        amount: formData.type === 'Teacher Payout' || formData.type === 'Refund' ? -Math.abs(formData.amount) : Math.abs(formData.amount),
        description: formData.type,
        status: formData.status.toUpperCase(),
        userEmail: formData.user // Note: using the input as email for now
      });
      if ('error' in newTrx) throw new Error(newTrx.error);

      toast.success('Transaction added manually.');
      setIsAddTrxModalOpen(false);
      
      // Refresh list
      const data = (isSampleMode() ? (await import('@/lib/sample/router')).sampleTransactions() : await getTransactions(await getAuthToken()));
      setTransactions(data);
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    }
  };

  return (
    <>
      <Topbar title="Financial Overview" subtitle="Monitor revenue, platform fees, and payouts" />
      
      {/* Stripe Setup Modal */}
      {isStripeModalOpen && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="sheet-in bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
            <button onClick={() => setIsStripeModalOpen(false)} className="absolute top-4 right-4 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center text-center space-y-4 pt-4">
              <div className="w-16 h-16 bg-[#635BFF]/10 rounded-full flex items-center justify-center mb-2">
                <CreditCard className="w-8 h-8 text-[#635BFF]" />
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Stripe payments</h2>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                Stripe is connected through your server settings (STRIPE_SECRET_KEY). Payouts, refunds and disputes are managed in your Stripe dashboard.
              </p>
              <button 
                onClick={() => { window.open('https://dashboard.stripe.com', '_blank', 'noopener,noreferrer'); setIsStripeModalOpen(false); }}
                className="w-full py-3 bg-[#635BFF] hover:bg-[#635BFF]/90 text-zinc-900 dark:text-white rounded-xl font-medium transition-colors shadow-lg shadow-[#635BFF]/20 mt-4"
              >
                Open Stripe dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {isAddTrxModalOpen && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="sheet-in bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Manual Transaction</h2>
              <button onClick={() => setIsAddTrxModalOpen(false)} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddTransaction} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">User Email</label>
                <input required value={formData.user} onChange={e => setFormData({...formData, user: e.target.value})} type="email" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500" placeholder="e.g. student@universe.edu" />
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
                <button type="submit" className="btn-primary">
                  Add Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
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
              <button onClick={() => setIsStripeModalOpen(true)} className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-all shadow-sm">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-6 relative overflow-hidden group hover:bg-white dark:bg-zinc-900/80 transition-all duration-300">
                <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full bg-gradient-to-br ${stat.color} opacity-[0.03] group-hover:opacity-[0.08] blur-2xl transition-opacity duration-500`}></div>
                
                <div className="flex justify-between items-start mb-4">
                  <div className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">{stat.label}</div>
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.color} bg-opacity-10 shadow-inner`}>
                    <stat.icon className="w-5 h-5 text-zinc-900 dark:text-white" />
                  </div>
                </div>
                
                <div className="text-3xl font-bold text-zinc-900 dark:text-white mb-3 tracking-tight">{stat.value}</div>
                
                {stat.up === undefined ? (
                  <p className="text-xs text-zinc-500">{stat.note}</p>
                ) : (
                  <div className={`flex items-center text-xs font-semibold px-2.5 py-1 rounded-full w-max ${
                    stat.up ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                  }`}>
                    {stat.up ? <TrendingUp className="w-3.5 h-3.5 mr-1" /> : <TrendingDown className="w-3.5 h-3.5 mr-1" />}
                    {stat.note}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Revenue by month (completed payments, last 12 months) */}
          <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-6 md:p-8">
            <div className="flex justify-between items-baseline mb-6">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Revenue Overview</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Completed payments per month · last 12 months</p>
              </div>
              <span className="text-sm font-semibold text-zinc-900 dark:text-white tabular-nums">
                ${monthlyRevenue.reduce((n, m) => n + m.total, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="h-56 flex items-end gap-2 border-b border-zinc-200 dark:border-zinc-800/50">
              {monthlyRevenue.map((m) => (
                <div key={m.key} className="flex-1 h-full flex flex-col justify-end items-center group">
                  <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity mb-1 tabular-nums">
                    ${m.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <div
                    className="w-full min-h-[2px] rounded-t-[4px] bg-indigo-500/60 group-hover:bg-indigo-500 transition-all duration-500"
                    style={{ height: `${(m.total / maxMonthlyRevenue) * 88}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              {monthlyRevenue.map((m) => <span key={m.key} className="flex-1 text-center text-[10px] text-zinc-500">{m.label}</span>)}
            </div>
            {!isLoading && monthlyRevenue.every((m) => m.total === 0) && (
              <p className="mt-4 text-sm text-zinc-500">No completed payments in the last 12 months yet.</p>
            )}
          </div>

          {/* Transactions with the person who paid (or was paid) */}
          <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800/50 space-y-4">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Transactions</h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Every payment with the payer&apos;s name, email, role and phone (latest 500)</p>
                </div>
                <button
                  onClick={() => setIsAddTrxModalOpen(true)}
                  className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Transaction</span><span className="sm:hidden">Add</span>
                </button>
              </div>
              <div className="flex flex-col md:flex-row gap-3 md:items-center">
                <AdminSearch className="flex-1" value={q} onChange={setQ} placeholder="Search payer name, email, role, phone, description…" shown={shownTransactions.length} total={transactions.length} />
                <div className="flex gap-1 overflow-x-auto shrink-0">
                  {['ALL', 'COMPLETED', 'PENDING', 'FAILED', 'REFUNDED'].map((st) => (
                    <button key={st} onClick={() => setStatusFilter(st)} aria-pressed={statusFilter === st}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${statusFilter === st ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'}`}>
                      {st.charAt(0) + st.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="p-8 flex justify-center"><div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" /></div>
            ) : shownTransactions.length === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">{transactions.length ? 'No transactions match your search.' : 'No transactions found.'}</p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
                {shownTransactions.map((trx) => (
                  <li key={trx.id} className="p-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <PersonCell person={trx.user} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white break-words">{trx.description}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(trx.createdAt).toISOString().split('T')[0]} · <span className="font-mono" title={trx.id}>{trx.id.substring(0, 8)}…</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3 md:justify-end">
                      <span className={`text-sm font-semibold tabular-nums ${trx.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-white'}`}>
                        {trx.amount > 0 ? '+' : trx.amount < 0 ? '-' : ''}${Math.abs(trx.amount).toFixed(2)}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        trx.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' :
                        trx.status === 'PENDING' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' :
                        'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                      }`}>
                        {trx.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
