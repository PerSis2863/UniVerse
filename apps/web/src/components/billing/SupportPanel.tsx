'use client';

import { useState } from 'react';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { LifeBuoy, Loader2, Rocket, Send, Zap } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import type { PlanId } from '@/lib/plans';

type SupportResult = { ticketId: string; emailed: boolean; priority: boolean; supportEmail: string };

export function SupportPanel({ plan }: { plan: PlanId }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState<'support' | 'onboarding' | null>(null);

  const send = async (kind: 'support' | 'onboarding') => {
    setSending(kind);
    try {
      const res = await authedJson<SupportResult>('/api/support', {
        method: 'POST',
        body: JSON.stringify({ kind, subject, message }),
      });
      toast.success(kind === 'onboarding' ? 'Onboarding requested — we’ll email you to schedule it.' : 'Request sent — we’ll reply by email.', {
        description: res.emailed ? undefined : `You can also reach us at ${res.supportEmail}.`,
      });
      if (kind === 'support') { setSubject(''); setMessage(''); }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(null);
    }
  };

  const priority = plan !== 'STARTER';
  const input = 'w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/50 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="grid lg:grid-cols-[1.4fr_1fr] gap-6"
    >
      <div className="rounded-[2rem] border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-6 md:p-8">
        <div className="flex items-center justify-between gap-3 mb-5">
          <h3 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2"><LifeBuoy className="w-5 h-5 text-indigo-500" /> Contact support</h3>
          {priority && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-500">
              <Zap className="w-3 h-3" /> Priority
            </span>
          )}
        </div>
        <div className="space-y-3">
          <input className={input} placeholder="Subject" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
          <textarea className={`${input} min-h-[120px] resize-y`} placeholder="How can we help?" value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">{priority ? 'Your plan includes priority support — your request goes to the front of the queue.' : 'Upgrade to Pro for priority support.'}</p>
            <button
              onClick={() => send('support')}
              disabled={sending !== null || !subject.trim() || !message.trim()}
              className="shrink-0 inline-flex items-center gap-2 h-11 px-5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm disabled:opacity-50 transition-colors"
            >
              {sending === 'support' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-fuchsia-500/20 bg-gradient-to-br from-white to-fuchsia-50 dark:from-zinc-900/60 dark:to-fuchsia-950/20 p-6 md:p-8 flex flex-col">
        <h3 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2"><Rocket className="w-5 h-5 text-fuchsia-500" /> Onboarding session</h3>
        <p className="text-sm text-zinc-500 mt-2 mb-6">
          A guided setup call with our team: importing members, configuring courses and NGO projects, and getting the most out of reporting.
        </p>
        <button
          onClick={() => send('onboarding')}
          disabled={sending !== null || plan !== 'ENTERPRISE'}
          className="mt-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white font-bold text-sm disabled:opacity-50"
        >
          {sending === 'onboarding' && <Loader2 className="w-4 h-4 animate-spin" />}
          {plan === 'ENTERPRISE' ? 'Request onboarding' : 'Included with Enterprise'}
        </button>
      </div>
    </motion.div>
  );
}
