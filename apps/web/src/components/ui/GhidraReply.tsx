'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Check, ChevronRight, Loader2, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { MathText } from '@/components/ui/MathText';
import { api, errorMessage } from '@/lib/api';
import { ASK_PAGES, type AskPlan } from '@/lib/ask';
import { inboxFor, settingsFor } from '@/lib/apps';
import { cleanCode } from '@/lib/trace';
import { cn } from '@/lib/utils';

// One Ghidra reply (M363–M364, src/lib/ask.ts), the same in the hub's chat (components/hub/Ghidra.tsx) and the assistant on
// every page (AIStudyAssistant): the answer, a list of the person's own things ('show'), or one proposed action with
// Confirm and Cancel. Confirming calls the app's own route, so its checks run again; nothing happens without the tap.

export type GhidraPlan = AskPlan & { note?: string };
export type Settled = 'done' | 'cancelled' | undefined;

const home = (role: string) => (role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/student');
function pageHref(page: keyof typeof ASK_PAGES, role: string) {
  if (page === 'inbox') return inboxFor(role);
  if (page === 'settings') return settingsFor(role);
  return ASK_PAGES[page].href.replace(':home', home(role));
}
const here = () => new Promise<{ lat: number; lng: number } | null>((done) => (navigator.geolocation ? navigator.geolocation.getCurrentPosition((g) => done({ lat: g.coords.latitude, lng: g.coords.longitude }), () => done(null), { timeout: 6000, maximumAge: 600_000 }) : done(null)));
/** Whether a reply proposes something to confirm. */
export const proposes = (p: GhidraPlan) => p.action === 'green_log' || p.action === 'relief_post' || p.action === 'trace_check' || p.action === 'open';
const label = (p: GhidraPlan) => (p.action === 'green_log' ? 'Log it' : p.action === 'relief_post' ? 'Post it' : p.action === 'trace_check' ? 'Check it' : 'Open');

/** The reply's words, list and buttons. `onSettle` hears Confirm (after it worked) or Cancel; `onLeave` a link or page opened. */
export function GhidraReply({ plan, role, settled, onSettle, onLeave, className }: {
  plan: GhidraPlan; role: string; settled: Settled; onSettle: (s: 'done' | 'cancelled') => void; onLeave?: () => void; className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = (href: string) => { onLeave?.(); router.push(href); };

  const confirm = async () => {
    setBusy(true);
    try {
      if (plan.action === 'green_log') {
        await api.post('/green/actions', { kind: plan.kind, amount: plan.amount, note: plan.note });
        toast.success('Logged in Green.', { action: { label: 'Open Green', onClick: () => go('/green') } });
        void mutate('/hub/wallet');
      } else if (plan.action === 'relief_post') {
        const pos = await here();
        if (!pos) { toast.error('Relief needs your location to put it on the map. Allow it, or post it from the Relief map.'); go('/relief'); return; }
        await api.post('/relief/posts', { type: plan.type, kind: plan.kind, title: plan.title, people: plan.people, urgency: plan.urgency, ...pos });
        toast.success('Posted on Relief. Helpers nearby can see it now.', { action: { label: 'Open Relief', onClick: () => go('/relief/mine') } });
      } else if (plan.action === 'trace_check') {
        go(`/t/${cleanCode(plan.code)}`);
      } else if (plan.action === 'open') {
        go(pageHref(plan.page, role));
      }
      onSettle('done');
    } catch (err) { toast.error(errorMessage(err, 'That didn’t work.')); } finally { setBusy(false); }
  };

  return (
    <div className={cn('rounded-2xl rounded-es-md border p-3.5', proposes(plan) && !settled ? 'border-fuchsia-400/40 bg-fuchsia-500/[0.06]' : 'border-zinc-200 bg-[var(--fill)] dark:border-white/10', className)}>
      <div className="text-sm text-zinc-800 dark:text-zinc-100" translate="no"><MathText text={plan.say} /></div>
      {plan.action === 'show' && plan.items.length > 0 && (
        <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/10">
          {plan.items.map((i, n) => {
            const body = <><span className="min-w-0 flex-1"><span className="block truncate font-medium text-zinc-900 dark:text-white" translate="no">{i.title}</span><span className="block truncate text-xs text-zinc-600 dark:text-zinc-300">{i.sub}</span></span>{i.href && <ChevronRight className="w-4 h-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden />}</>;
            return <li key={n}>{i.href ? <Link href={i.href} onClick={onLeave} className="flex items-center gap-2 py-2 text-sm">{body}</Link> : <span className="flex items-center gap-2 py-2 text-sm">{body}</span>}</li>;
          })}
        </ul>
      )}
      {plan.note && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{plan.note}</p>}
      {proposes(plan) && (settled ? (
        <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">{settled === 'done' ? 'Done.' : 'Cancelled.'}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void confirm()} disabled={busy} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden />}{label(plan)}</button>
          <button type="button" onClick={() => onSettle('cancelled')} disabled={busy} className="btn-secondary btn-sm"><X className="w-4 h-4" aria-hidden />Cancel</button>
        </div>
      ))}
    </div>
  );
}
