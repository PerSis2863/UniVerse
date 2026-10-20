'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CreditCard,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  X,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { money } from './shared';

interface Props {
  invoiceId: string;
  seq: number;
  label: string;
  amount: number; // minor units
  currency: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function OnlineFeePaymentModal({
  invoiceId,
  seq,
  label,
  amount,
  currency,
  onClose,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<{
    orderId: string;
    provider: 'RAZORPAY' | 'STRIPE';
    orderRef: string;
    keyId: string;
    upiIntent?: string;
    checkoutUrl?: string;
    testMode?: boolean;
  } | null>(null);

  const [completedReceipt, setCompletedReceipt] = useState<number | null>(null);

  const startCheckout = async () => {
    setLoading(true);
    try {
      const res = await authedJson<{
        orderId: string;
        provider: 'RAZORPAY' | 'STRIPE';
        orderRef: string;
        keyId: string;
        upiIntent?: string;
        checkoutUrl?: string;
        testMode?: boolean;
      }>('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });
      setOrder(res);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to initialize checkout');
    } finally {
      setLoading(false);
    }
  };

  // Only the gateway decides a payment went through: the server asks Stripe, or Razorpay's
  // webhook records it (UPI), and this asks the server. Test mode (local only) can simulate it.
  const confirm = async () => {
    if (!order) return;
    setLoading(true);
    try {
      const res = await authedJson<{ receiptNumber?: number }>('/api/payments/verify', { method: 'POST', body: JSON.stringify({ orderId: order.orderId }) });
      toast.success('Payment received');
      setCompletedReceipt(res.receiptNumber ?? 0);
      onSuccess();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Not confirmed yet');
    } finally {
      setLoading(false);
    }
  };
  // A UPI payment arrives by the gateway's webhook: look every few seconds.
  const paidRef = useRef(onSuccess);
  useEffect(() => { paidRef.current = onSuccess; });
  useEffect(() => {
    if (!order || order.testMode || order.provider !== 'RAZORPAY' || completedReceipt !== null) return;
    const t = setInterval(async () => {
      const s = await authedJson<{ status: string }>(`/api/payments/status?orderId=${encodeURIComponent(order.orderId)}`).catch(() => null);
      if (s?.status === 'COMPLETED') { clearInterval(t); setCompletedReceipt(0); toast.success('Payment received'); paidRef.current(); }
    }, 4000);
    return () => clearInterval(t);
  }, [order, completedReceipt]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <CreditCard className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                Online Fee Payment
              </h3>
              <p className="text-xs text-zinc-500">Bill #{seq} · {label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {completedReceipt !== null ? (
            <div className="text-center space-y-4 py-4">
              <span className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </span>
              <div>
                <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Payment Confirmed!
                </h4>
                <p className="text-xs text-zinc-500 mt-1">
                  {completedReceipt ? `Receipt #${completedReceipt} is in your fee history.` : 'Your receipt is in your fee history.'}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Amount Paid: {money(amount, currency)}
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition"
              >
                Close & Return
              </button>
            </div>
          ) : !order ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Total Outstanding:</span>
                  <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {money(amount, currency)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>256-bit encrypted institutional gateway</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                  Accepted Payment Modes:
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-violet-500 shrink-0" />
                    <div>
                      <span className="font-semibold block text-[11px]">UPI / QR</span>
                      <span className="text-[10px] text-zinc-400">GPay, PhonePe, Paytm</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-500 shrink-0" />
                    <div>
                      <span className="font-semibold block text-[11px]">Cards / Netbanking</span>
                      <span className="text-[10px] text-zinc-400">Rupay, Visa, Master</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                disabled={loading}
                onClick={startCheckout}
                className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
              >
                {loading ? 'Initializing Gateway...' : 'Proceed to Pay'} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs font-medium flex items-center justify-between">
                <span>Gateway: {order.provider === 'RAZORPAY' ? 'Razorpay UPI & Cards' : 'Stripe Card Checkout'}</span>
                <span className="font-mono text-[11px]">{order.orderRef.slice(0, 16)}</span>
              </div>

              {order.upiIntent && (
                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center space-y-3">
                  <div className="p-3 rounded-xl bg-white text-zinc-900 inline-block shadow-sm">
                    <QrCode className="w-24 h-24 mx-auto" />
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Scan with any UPI app (GPay, PhonePe, Paytm, BHIM) to pay <strong className="font-bold text-zinc-900 dark:text-zinc-100">{money(amount, currency)}</strong>.
                  </p>
                  <a
                    href={order.upiIntent}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                  >
                    Open UPI App <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                  </a>
                </div>
              )}

              {order.checkoutUrl && !order.testMode && (
                <a
                  href={order.checkoutUrl}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-sm transition"
                >
                  Pay by card with Stripe <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                </a>
              )}

              {order.provider === 'RAZORPAY' && !order.testMode && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 text-center" aria-live="polite">Waiting for your payment… This updates by itself once Razorpay confirms it.</p>
              )}

              {order.testMode && (
                <button
                  disabled={loading}
                  onClick={confirm}
                  className="w-full py-2.5 rounded-xl border border-amber-500/40 text-amber-800 dark:text-amber-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
                  {loading ? 'Confirming…' : 'Simulate a test payment (test mode)'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
