'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Check, ChevronRight, Copy, Loader2, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { MathText } from '@/components/ui/MathText';
import { api, errorMessage } from '@/lib/api';
import { ASK_PAGES, type AskPlan } from '@/lib/ask';
import { inboxFor, settingsFor } from '@/lib/apps';
import { stashText } from '@/lib/share-in';
import { cleanCode } from '@/lib/trace';
import { cn } from '@/lib/utils';
import { ReportAnswer } from '@/components/ui/ReportAnswer';

// One Ghidra reply (M422–M424, src/lib/ask.ts), the same in the hub's chat (components/hub/Ghidra.tsx) and the assistant on
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
export const proposes = (p: GhidraPlan): boolean => ['green_log', 'relief_post', 'trace_check', 'open', 'trip_new', 'message_draft'].includes(p.action)
  || (p.action === 'quiz_draft' && !!p.courseId) || (p.action === 'chain' && p.steps.some(proposes));
const LABEL: Partial<Record<GhidraPlan['action'], string>> = { green_log: 'Log it', relief_post: 'Post it', trace_check: 'Check it', trip_new: 'Make the trip', message_draft: 'Choose a chat', quiz_draft: 'Write the quiz' };
const label = (p: GhidraPlan) => (p.action === 'chain' ? `Do ${p.steps.filter(proposes).length === 1 ? 'it' : `all ${p.steps.filter(proposes).length}`}` : LABEL[p.action] ?? 'Open');

/** The reply's words, list and buttons. `onSettle` hears Confirm (after it worked) or Cancel; `onLeave` a link or page opened. */
export function GhidraReply({ plan, role, settled, onSettle, onLeave, className, question }: {
  plan: GhidraPlan; role: string; settled: Settled; onSettle: (s: 'done' | 'cancelled') => void; onLeave?: () => void; className?: string;
  /** The words it answered: with them, an answer can be reported (M429). */
  question?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = (href: string) => { onLeave?.(); router.push(href); };

  /** Does one step through its app's own route and says where it would take the person next (or null). Throws when it fails. */
  const act = async (p: GhidraPlan): Promise<string | null> => {
    if (p.action === 'green_log') {
      await api.post('/green/actions', { kind: p.kind, amount: p.amount, note: p.note });
      toast.success('Logged in Green living.', { action: { label: 'Open Green living', onClick: () => go('/student/life/green') } });
      void mutate('/hub/wallet');
      return null;
    }
    if (p.action === 'relief_post') {
      const pos = await here();
      if (!pos) throw new Error('Relief needs your location to put it on the map. Allow it, or post it from the Relief map.');
      await api.post('/relief/posts', { type: p.type, kind: p.kind, title: p.title, people: p.people, urgency: p.urgency, ...pos });
      toast.success('Posted on Relief. Helpers nearby can see it now.', { action: { label: 'Open Relief', onClick: () => go('/relief/mine') } });
      return null;
    }
    if (p.action === 'trace_check') return `/t/${cleanCode(p.code)}`;
    if (p.action === 'open') return pageHref(p.page, role);
    if (p.action === 'trip_new') {
      // M424: Travel's own route makes it; the trip's page opens to add its cities.
      // M434, the Travel Planner: with a place, the trip starts with that city and its days, and opens planning them.
      const r = await api.post<{ trip: { id: string } }>('/travel/trips', { name: p.name, startDate: p.startDate, travellers: p.travellers, ...(p.place ? { stop: { guide: p.place, days: p.days ?? 3 } } : {}) });
      toast.success(p.place ? 'Trip made. Planning its days…' : 'Trip made. Add its cities and Ghidra can help plan the days.');
      return `/travel/trip?id=${r.data.trip.id}${p.place ? '&plan=1' : ''}`;
    }
    if (p.action === 'quiz_draft' && p.courseId) {
      // M425: the quiz route checks the course again and saves a draft only this teacher sees; the editor opens on it.
      const r = await api.post<{ quiz: { id: string }; count: number }>('/quizzes/draft', { courseId: p.courseId, topic: p.topic, count: p.count });
      toast.success(`Draft ready: ${r.data.count} questions. Check each one before you publish.`);
      return `/teacher/quizzes?manage=${r.data.quiz.id}`;
    }
    if (p.action === 'message_draft') {
      // M424: the draft waits until a chat is picked; it becomes that chat's draft and goes only when they press Send.
      if (!stashText(p.text)) throw new Error('Couldn’t keep the draft on this device. Copy it, then open Messages.');
      toast('Pick the chat: the draft will be waiting in its box.');
      return inboxFor(role);
    }
    return null;
  };

  // M432: a chain's steps run one after another, in order; it stops at the first that fails; the page moves only at
  // the end, to the last step's place.
  const [stepState, setStepState] = useState<Record<number, 'done' | 'failed'>>({});
  const confirm = async () => {
    setBusy(true);
    try {
      if (plan.action === 'chain') {
        let to: string | null = null;
        for (const [i, st] of plan.steps.entries()) {
          if (!proposes(st)) continue;
          try { to = (await act(st)) ?? to; setStepState((m) => ({ ...m, [i]: 'done' })); }
          catch (err) { setStepState((m) => ({ ...m, [i]: 'failed' })); toast.error(errorMessage(err, `Step ${i + 1} didn’t work; the rest weren’t done.`)); return; }
        }
        onSettle('done');
        if (to) go(to);
        return;
      }
      const to = await act(plan);
      onSettle('done');
      if (to) go(to);
    } catch (err) { toast.error(errorMessage(err, 'That didn’t work.')); } finally { setBusy(false); }
  };

  return (
    <div className={cn('rounded-2xl rounded-es-md border p-3.5', proposes(plan) && !settled ? 'border-fuchsia-400/40 bg-fuchsia-500/[0.06]' : 'border-zinc-200 bg-[var(--fill)] dark:border-white/10', className)}>
      <div className="text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap break-words" translate="no"><MathText text={plan.say} /></div>
      {plan.action === 'message_draft' && <p className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 whitespace-pre-wrap dark:border-white/10 dark:bg-zinc-900 dark:text-white" translate="no">{plan.text}</p>}
      {plan.action === 'quiz_draft' && plan.courseName && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{plan.courseName} · {plan.count} questions · multiple choice · a draft</p>}
      {plan.action === 'trip_new' && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{plan.name}{plan.days ? ` · ${plan.days} days` : ''} · {plan.travellers} {plan.travellers === 1 ? 'person' : 'people'}{plan.startDate ? ` · from ${plan.startDate}` : ''}</p>}
      {plan.action === 'show' && plan.items.length > 0 && (
        <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/10">
          {plan.items.map((i, n) => {
            const body = <><span className="min-w-0 flex-1"><span className="block truncate font-medium text-zinc-900 dark:text-white" translate="no">{i.title}</span><span className="block truncate text-xs text-zinc-600 dark:text-zinc-300">{i.sub}</span></span>{i.href && <ChevronRight className="w-4 h-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden />}</>;
            return <li key={n}>{i.href && i.external ? <a href={i.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-2 text-sm">{body}<span className="sr-only">(opens in a new tab)</span></a> : i.href ? <Link href={i.href} onClick={onLeave} className="flex items-center gap-2 py-2 text-sm">{body}</Link> : <span className="flex items-center gap-2 py-2 text-sm">{body}</span>}</li>;
          })}
        </ul>
      )}
      {plan.action === 'posts' && (
        <ul className="mt-2 space-y-2">
          {plan.posts.map((p, n) => (
            <li key={n} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{p.platform}{p.when ? ` · ${p.when}` : ''}</span>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(p.text).then(() => toast.success(`Copied the ${p.platform} post.`), () => toast.error('Couldn’t copy: select the text instead.')); }} className="btn-secondary btn-sm"><Copy className="w-4 h-4" aria-hidden />Copy<span className="sr-only"> the {p.platform} post</span></button>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-900 dark:text-white" translate="no">{p.text}</p>
            </li>
          ))}
        </ul>
      )}
      {plan.action === 'chain' && (
        <ol className="mt-2 space-y-2">
          {plan.steps.map((st, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold', stepState[i] === 'done' ? 'bg-emerald-600 text-white' : stepState[i] === 'failed' ? 'bg-rose-600 text-white' : 'bg-zinc-900/[0.07] text-zinc-700 dark:bg-white/10 dark:text-zinc-200')} aria-hidden>{stepState[i] === 'done' ? '✓' : stepState[i] === 'failed' ? '!' : i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-zinc-800 dark:text-zinc-100" translate="no">{st.say}</span>
                {st.action === 'show' && st.items.slice(0, 3).map((it, n) => <span key={n} className="block truncate text-xs text-zinc-600 dark:text-zinc-300" translate="no">{it.title} · {it.sub}</span>)}
                {stepState[i] && <span className="sr-only">{stepState[i] === 'done' ? 'Done' : 'Didn’t work'}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {plan.note && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{plan.note}</p>}
      {question && plan.action === 'answer' && <ReportAnswer question={question} answer={plan.say} />}
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
