'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { PLANS, type PlanId } from '@/lib/plans';

/** "Contact us" for plans we price individually. Sends the request to the UniVerse team. */
export function ContactSalesDialog({ plan, onClose }: { plan: PlanId; onClose: () => void }) {
  const [size, setSize] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const input = 'w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/50 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authedJson('/api/support', { method: 'POST', body: JSON.stringify({ kind: 'sales', plan, size, phone, message }) });
      toast.success('Thanks! Our team will contact you with a quote.', { description: 'We usually reply within one working day.' });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50" role="dialog" aria-modal="true" aria-label={`Contact us about ${PLANS[plan].name}`}>
      <form onSubmit={send} className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Contact us about {PLANS[plan].name}</h2>
            <p className="text-sm text-zinc-500 mt-0.5">{PLANS[plan].name} is priced for your institution. Tell us what you need and we&apos;ll send a quote.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Number of students</span>
            <select className={input} value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="">Choose…</option>
              {['Under 500', '500 – 2,000', '2,000 – 10,000', '10,000 – 50,000', 'Over 50,000'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Phone (optional)</span>
            <input className={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="+91 98765 43210" />
          </label>
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">What do you need?</span>
          <textarea className={`${input} min-h-[120px]`} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} required placeholder="e.g. We're a university network of 4 campuses and want AI impact reports and invoiced billing." />
        </label>
        <button disabled={busy || !message.trim()} className="btn-primary btn-lg w-full">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send request
        </button>
      </form>
    </div>
  );
}
