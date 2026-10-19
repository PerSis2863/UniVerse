'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Heart, Loader2, ShieldCheck } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { money } from '@/components/fees/shared';
import { authedJson } from '@/lib/authed-fetch';
import { DONATION_CURRENCIES, DONATION_LIMITS, DONATION_PRESETS, offers80G, type DonationCurrency } from '@/lib/global-impact';
import { cn } from '@/lib/utils';

// Stage 5 · Q16: give money to an NGO project. Paid by card on Stripe's own page; back on My
// donations the payment is checked with Stripe and the receipt appears (src/server/donate.ts).

export interface DonateProject { id: string; name: string; ngo: { name: string; reg80G?: string | null; pan?: string | null } }
interface Support { raised: Record<string, number>; donors: number; supporters: string[] }

export function DonateSheet({ project, onClose }: { project: DonateProject; onClose: () => void }) {
  const [currency, setCurrency] = useState<DonationCurrency>('INR');
  const [amount, setAmount] = useState('500');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [want80G, setWant80G] = useState(false);
  const [pan, setPan] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const support = useSWR<Support>(`/api/impact/donations?projectId=${encodeURIComponent(project.id)}`, authedJson);
  const tax = offers80G(currency, { reg80G: project.ngo.reg80G ?? null, pan: project.ngo.pan ?? null });
  const [min, max] = DONATION_LIMITS[currency];
  const n = Number(amount.replace(/[,\s]/g, ''));
  const valid = Number.isFinite(n) && n >= min && n <= max;
  const raised = Object.entries(support.data?.raised ?? {});

  const give = async () => {
    setBusy(true);
    try {
      const out = await authedJson<{ checkoutUrl?: string }>('/api/impact/donations', {
        method: 'POST',
        body: JSON.stringify({ projectId: project.id, amount: n, currency, message, anonymous, ...(tax && want80G ? { pan, address } : {}) }),
      });
      if (!out.checkoutUrl) throw new Error('The payment page didn’t open. Please try again.');
      window.location.assign(out.checkoutUrl);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet title={`Donate to ${project.name}`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={!valid || busy || (want80G && tax && (!pan.trim() || !address.trim()))} onClick={give}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Heart className="w-4 h-4" aria-hidden />} Give {valid ? money(Math.round(n * 100), currency) : ''}</button></div>}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">To <strong className="text-zinc-900 dark:text-white">{project.ngo.name}</strong>.{' '}
          {support.data && (raised.length ? <>So far {raised.map(([c, v]) => money(v, c)).join(' + ')} from {support.data.donors} {support.data.donors === 1 ? 'person' : 'people'}{support.data.supporters.length ? `, including ${support.data.supporters.slice(0, 3).join(', ')}` : ''}.</> : 'Be the first to give.')}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Currency" className="w-28">{(p) => (
            <select {...p} className="input" value={currency} onChange={(e) => { const c = e.target.value as DonationCurrency; setCurrency(c); setAmount(String(DONATION_PRESETS[c][1])); }}>
              {DONATION_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}</Field>
          <Field label="Amount" className="flex-1 min-w-[8rem]" error={amount && !valid ? `Between ${money(min * 100, currency)} and ${money(max * 100, currency)}` : null}>{(p) => (
            <input {...p} className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          )}</Field>
        </div>
        <div role="group" aria-label="Quick amounts" className="flex flex-wrap gap-1.5">
          {DONATION_PRESETS[currency].map((v) => (
            <button key={v} type="button" aria-pressed={n === v} onClick={() => setAmount(String(v))}
              className={cn('rounded-full px-3 py-1.5 text-sm font-medium transition-colors', n === v ? 'bg-emerald-700 text-white' : 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10')}>
              {money(v * 100, currency)}
            </button>
          ))}
        </div>
        <Field label="A message for the NGO (optional)" count={message.length} max={300}>{(p) => <textarea {...p} className="input min-h-[70px]" maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} />}</Field>
        <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
          <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Don’t show my name to other supporters
        </label>
        {tax && (
          <div className="rounded-2xl border border-zinc-200 dark:border-white/10 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white">
              <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={want80G} onChange={(e) => setWant80G(e.target.checked)} /> I’d like an 80G tax receipt (India)
            </label>
            {want80G && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Your PAN" hint="Shared with the NGO for its Form 10BD filing">{(p) => <input {...p} className="input uppercase" maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" autoComplete="off" />}</Field>
                <Field label="Your address">{(p) => <input {...p} className="input" maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />}</Field>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-zinc-500 flex items-start gap-1.5"><ShieldCheck className="w-4 h-4 shrink-0" aria-hidden /> You pay by card on Stripe’s secure page; UniVerse never sees your card. The school receives the gift and passes it on to {project.ngo.name}.</p>
      </div>
    </Sheet>
  );
}
