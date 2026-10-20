'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import {
  Wallet,
  RefreshCw,
  Download,
  RotateCcw,
  Sliders,
  DollarSign,
  QrCode,
  FileSpreadsheet,
} from 'lucide-react';
import type { ReconciliationReport } from '@/server/payments/types';

interface GatewaySettings {
  paymentProvider: 'AUTO' | 'RAZORPAY' | 'STRIPE';
  razorpayKeyId: string | null;
  hasRazorpaySecret: boolean;
  stripePublishableKey: string | null;
  hasStripeSecret: boolean;
}

export function PaymentReconciliationPanel() {
  const [tab, setTab] = useState<'ledger' | 'settings'>('ledger');

  // Ledger state
  const { data: report, mutate: mutateReport, isLoading: loadingReport } = useSWR<ReconciliationReport>(
    '/api/admin/payments/reconciliation',
    authedJson,
  );

  // Settings state
  const { data: settings, mutate: mutateSettings } = useSWR<GatewaySettings>(
    '/api/admin/payments/settings',
    authedJson,
  );

  const [savingSettings, setSavingSettings] = useState(false);
  const [providerChoice, setProviderChoice] = useState<'AUTO' | 'RAZORPAY' | 'STRIPE'>('AUTO');
  const [rzpKeyId, setRzpKeyId] = useState('');
  const [rzpKeySecret, setRzpKeySecret] = useState('');
  const [stripePubKey, setStripePubKey] = useState('');
  const [stripeSecret, setStripeSecret] = useState('');

  // Refund modal state
  const [refundingOrderId, setRefundingOrderId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await authedJson('/api/admin/payments/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentProvider: providerChoice,
          razorpayKeyId: rzpKeyId || undefined,
          razorpayKeySecret: rzpKeySecret || undefined,
          stripePublishableKey: stripePubKey || undefined,
          stripeSecretKey: stripeSecret || undefined,
        }),
      });
      toast.success('Payment gateway settings updated');
      mutateSettings();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundingOrderId) return;
    setProcessingRefund(true);
    try {
      await authedJson('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: refundingOrderId,
          reason: refundReason,
        }),
      });
      toast.success('Refund processed successfully');
      setRefundingOrderId(null);
      setRefundReason('');
      mutateReport();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Refund failed');
    } finally {
      setProcessingRefund(false);
    }
  };

  const moneyFmt = (minor: number, currency: string) => {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(minor / 100);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Wallet className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Payment Reconciliation & Gateways
              </h2>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                Razorpay UPI + Stripe
              </span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Audit collections across UPI, Netbanking, cards, and bank transfers with real-time settlement tracking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/admin/payments/reconciliation?format=csv"
              download
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV Ledger
            </a>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 mt-6 gap-6 text-sm font-medium">
          <button
            onClick={() => setTab('ledger')}
            className={`pb-3 inline-flex items-center gap-2 transition ${
              tab === 'ledger'
                ? 'border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Settlements & Ledger
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`pb-3 inline-flex items-center gap-2 transition ${
              tab === 'settings'
                ? 'border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Gateway Credentials
          </button>
        </div>
      </div>

      {/* TAB 1: LEDGER */}
      {tab === 'ledger' && (
        <div className="space-y-6">
          {/* Metrics summary */}
          {report && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <span className="text-xs text-zinc-500 block mb-1">Net Collected</span>
                <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {moneyFmt(report.summary.netCollectedMinor, 'INR')}
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block mt-1">
                  Total {report.summary.totalTransactions} transactions
                </span>
              </div>

              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <span className="text-xs text-zinc-500 block mb-1">UPI & Netbanking (Razorpay)</span>
                <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {moneyFmt(report.summary.providerBreakdown['RAZORPAY']?.totalMinor || 0, 'INR')}
                </span>
                <span className="text-[11px] text-zinc-500 block mt-1">
                  {report.summary.providerBreakdown['RAZORPAY']?.count || 0} settlements
                </span>
              </div>

              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <span className="text-xs text-zinc-500 block mb-1">International Cards (Stripe)</span>
                <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {moneyFmt(report.summary.providerBreakdown['STRIPE']?.totalMinor || 0, 'USD')}
                </span>
                <span className="text-[11px] text-zinc-500 block mt-1">
                  {report.summary.providerBreakdown['STRIPE']?.count || 0} settlements
                </span>
              </div>

              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <span className="text-xs text-zinc-500 block mb-1">Total Refunded</span>
                <span className="text-xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  {moneyFmt(report.summary.totalRefundedMinor, 'INR')}
                </span>
                <span className="text-[11px] text-zinc-500 block mt-1">Reconciled</span>
              </div>
            </div>
          )}

          {/* Transactions Table */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Recent Online Settlements</h3>
              <button
                onClick={() => mutateReport()}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {loadingReport ? (
              <div className="p-8 text-center text-xs text-zinc-500">Loading reconciliation ledger...</div>
            ) : !report || report.transactions.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Wallet className="w-8 h-8 text-zinc-400 mx-auto" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No online transactions yet</p>
                <p className="text-xs text-zinc-500">Online fee payments made via UPI or Stripe will populate this settlement ledger.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-4">Order Ref</th>
                      <th className="py-2.5 px-4">Customer</th>
                      <th className="py-2.5 px-4">Gateway</th>
                      <th className="py-2.5 px-4">Purpose</th>
                      <th className="py-2.5 px-4">Amount</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Paid Date</th>
                      <th className="py-2.5 px-4 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {report.transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                        <td className="py-3 px-4 font-mono text-[11px]">{tx.orderRef}</td>
                        <td className="py-3 px-4">
                          <span className="font-semibold block text-zinc-900 dark:text-zinc-100">{tx.customerName || 'N/A'}</span>
                          <span className="text-[10px] text-zinc-400">{tx.customerEmail || ''}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            tx.provider === 'RAZORPAY' ? 'bg-blue-500/10 text-blue-600' : 'bg-violet-500/10 text-violet-600'
                          }`}>
                            {tx.provider}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-zinc-700 dark:text-zinc-300">{tx.purpose}</td>
                        <td className="py-3 px-4 font-bold tabular-nums">{moneyFmt(tx.amount, tx.currency)}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            tx.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : tx.status === 'REFUNDED'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-zinc-500">
                          {tx.paidAt ? new Date(tx.paidAt).toLocaleDateString() : 'Pending'}
                        </td>
                        <td className="py-3 px-4 text-end">
                          {tx.status === 'COMPLETED' && (
                            <button
                              onClick={() => setRefundingOrderId(tx.id)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-rose-300 dark:border-rose-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                            >
                              Refund
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SETTINGS */}
      {tab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-6">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Gateway Configuration & Credentials
            </h3>
            <p className="text-xs text-zinc-500">
              Configure institution-specific merchant accounts for Razorpay (India / UPI) and Stripe (Global).
            </p>
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Routing Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'AUTO', title: 'Smart Auto Routing', desc: 'UPI & INR via Razorpay; USD/EUR via Stripe (Recommended)' },
                { id: 'RAZORPAY', title: 'Razorpay Only', desc: 'Route all student fees via Razorpay gateway' },
                { id: 'STRIPE', title: 'Stripe Only', desc: 'Route all student fees via Stripe gateway' },
              ].map((opt) => (
                <label
                  key={opt.id}
                  onClick={() => setProviderChoice(opt.id as 'AUTO' | 'RAZORPAY' | 'STRIPE')}
                  className={`p-3.5 rounded-2xl border text-xs cursor-pointer transition ${
                    (providerChoice || settings?.paymentProvider) === opt.id
                      ? 'border-emerald-500/50 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <span className="font-bold block text-sm mb-1">{opt.title}</span>
                  <span className="text-[11px] leading-tight block">{opt.desc}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Razorpay credentials */}
            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-blue-500" />
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Razorpay (India / UPI)</h4>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Key ID (rzp_live_... / rzp_test_...)
                </label>
                <input
                  type="text"
                  placeholder={settings?.razorpayKeyId || 'rzp_live_...'}
                  value={rzpKeyId}
                  onChange={(e) => setRzpKeyId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Key Secret
                </label>
                <input
                  type="password"
                  placeholder={settings?.hasRazorpaySecret ? '••••••••••••••••••••' : 'Enter Secret Key'}
                  value={rzpKeySecret}
                  onChange={(e) => setRzpKeySecret(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-mono"
                />
              </div>
            </div>

            {/* Stripe credentials */}
            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-violet-500" />
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Stripe (Global Cards)</h4>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Publishable Key (pk_live_... / pk_test_...)
                </label>
                <input
                  type="text"
                  placeholder={settings?.stripePublishableKey || 'pk_live_...'}
                  value={stripePubKey}
                  onChange={(e) => setStripePubKey(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Secret Key (sk_live_...)
                </label>
                <input
                  type="password"
                  placeholder={settings?.hasStripeSecret ? '••••••••••••••••••••' : 'Enter Secret Key'}
                  value={stripeSecret}
                  onChange={(e) => setStripeSecret(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save Gateway Settings'}
            </button>
          </div>
        </form>
      )}

      {/* REFUND MODAL */}
      {refundingOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <form onSubmit={handleProcessRefund} className="w-full max-w-sm rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-rose-500" />
              Process Gateway Refund
            </h3>
            <p className="text-xs text-zinc-500">
              This will initiate an automated refund back to the student&apos;s source UPI account or card.
            </p>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Reason for Refund
              </label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Sibling concession adjustment or duplicate payment"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRefundingOrderId(null)}
                className="px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processingRefund}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition disabled:opacity-50"
              >
                {processingRefund ? 'Processing...' : 'Confirm Refund'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
