'use client';

import { useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Activity, Check, Star, WifiOff, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { CALL_ISSUES, grade, rate, type Grade, type Reading } from '@/lib/call-quality';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Call quality (Stage 5 · B8.1; numbers from src/lib/call-quality.ts): the Connection panel (my
// connection and each person's, live), the "your network is weak" banner with audio only in one
// tap, and a quick rating after the call that goes with the call's health report.

const TONE: Record<Exclude<Grade, null>, { label: string; className: string }> = {
  good: { label: 'Good', className: 'text-emerald-300' },
  fair: { label: 'Fair', className: 'text-amber-300' },
  poor: { label: 'Poor', className: 'text-rose-300' },
};

function Numbers({ r }: { r: Reading | null }) {
  if (!r) return <p className="text-xs text-zinc-400">Measuring…</p>;
  const g = grade(r);
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      <dt className="text-zinc-400">Quality</dt><dd className={cn('font-semibold', g ? TONE[g].className : 'text-zinc-300')}>{g ? TONE[g].label : '—'}</dd>
      <dt className="text-zinc-400">Round trip</dt><dd className="tabular-nums">{r.rttMs === null ? '—' : `${r.rttMs} ms`}</dd>
      <dt className="text-zinc-400">Packets lost</dt><dd className="tabular-nums">{r.lossPct}%</dd>
      {r.jitterMs !== null && <><dt className="text-zinc-400">Jitter</dt><dd className="tabular-nums">{r.jitterMs} ms</dd></>}
      <dt className="text-zinc-400">Coming in</dt><dd className="tabular-nums">{rate(r.inKbps)}</dd>
      <dt className="text-zinc-400">Going out</dt><dd className="tabular-nums">{rate(r.outKbps)}</dd>
      {r.relay && <><dt className="text-zinc-400">Route</dt><dd>Through a relay server</dd></>}
    </dl>
  );
}

export function ConnectionPanel({ open, onClose, me, people, server, audioOnly, onAudioOnly }: {
  open: boolean; onClose: () => void;
  me: Reading | null;
  /** Each person (one-to-one connections), or nothing when everyone goes through the call server. */
  people: { id: string; name: string; reading: Reading | null }[];
  server: boolean; audioOnly: boolean; onAudioOnly: (on: boolean) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40 sm:hidden" aria-hidden />
          <motion.aside key="net" role="dialog" aria-label="Connection"
            initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }} transition={spring.smooth}
            className="absolute z-40 inset-x-0 bottom-0 max-h-[78vh] rounded-t-3xl sm:inset-x-auto sm:end-4 sm:top-[calc(env(safe-area-inset-top)+4.75rem)] sm:bottom-auto sm:max-h-[calc(100%-12rem)] sm:w-[22rem] sm:rounded-3xl bg-[#1d2650]/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
              <div className="min-w-0">
                <p className="font-semibold flex items-center gap-1.5"><Activity className="w-4 h-4 text-sky-300" aria-hidden />Connection</p>
                <p className="text-[11px] text-zinc-400">Updated every few seconds.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10 shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3" aria-live="polite">
              <section className="rounded-2xl bg-white/[0.06] p-3 space-y-2">
                <p className="text-sm font-semibold">You{server ? ' (through the call server)' : ''}</p>
                <Numbers r={me} />
                <button type="button" onClick={() => onAudioOnly(!audioOnly)} className="w-full mt-1 h-9 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                  <WifiOff className="w-3.5 h-3.5" aria-hidden />{audioOnly ? 'Show video again' : 'Audio only (saves data)'}
                </button>
              </section>
              {people.map((p) => (
                <section key={p.id} className="rounded-2xl bg-white/[0.04] p-3 space-y-2">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <Numbers r={p.reading} />
                </section>
              ))}
              {server && <p className="text-[11px] text-zinc-400">In bigger calls everyone connects through the call server, so these are your numbers to it.</p>}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** "Your network is weak", with audio only one tap away. */
export function WeakNetwork({ show, onAudioOnly, onDismiss }: { show: boolean; onAudioOnly: () => void; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring.snappy}
          className="pointer-events-auto rounded-2xl bg-amber-500/15 border border-amber-400/30 backdrop-blur-xl px-3 py-2 flex items-center gap-2 text-sm shadow-xl">
          <WifiOff className="w-4 h-4 text-amber-300 shrink-0" aria-hidden />
          <span className="flex-1 min-w-0 text-amber-100">Your network is weak, so video may freeze.</span>
          <button type="button" onClick={() => { haptic('tap'); onAudioOnly(); }} className="shrink-0 h-8 px-3 rounded-full bg-amber-400 text-zinc-900 text-xs font-bold">Audio only</button>
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 p-1 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ASKED = 'call-rated-at';
/** Ask for a rating after a call that lasted a minute, at most once a day on this device. */
export function shouldAskRating(talkedSeconds: number) {
  if (talkedSeconds < 60) return false;
  try { return Date.now() - Number(localStorage.getItem(ASKED) || 0) > 86_400_000; } catch { return false; }
}

/** "How was the call?": stars, and what went wrong if it wasn't great. */
export function RateCall({ callId, onDone }: { callId: string; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [issues, setIssues] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const send = (n: number, list: string[]) => {
    try { localStorage.setItem(ASKED, String(Date.now())); } catch { /* private window */ }
    void authedJson(`/api/calls/${callId}/stat`, { method: 'POST', keepalive: true, body: JSON.stringify({ rating: n, issues: list }) }).catch(() => {});
    setSent(true);
    setTimeout(onDone, 900);
  };
  const skip = () => { try { localStorage.setItem(ASKED, String(Date.now())); } catch { /* private window */ } onDone(); };
  return (
    <motion.div role="dialog" aria-labelledby="rate-title" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring.snappy}
      className="w-[min(22rem,calc(100vw-2rem))] rounded-3xl bg-white/[0.08] border border-white/10 backdrop-blur-2xl p-5 space-y-3 text-center">
      {sent ? <p className="py-4 text-sm inline-flex items-center gap-2 justify-center"><Check className="w-4 h-4 text-emerald-300" aria-hidden />Thanks, that helps us make calls better.</p> : (
        <>
          <p id="rate-title" className="font-semibold">How was the call?</p>
          <div className="flex justify-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => { haptic('tap'); setStars(n); if (n >= 4) send(n, []); }}
                className="p-1.5 rounded-full hover:bg-white/10"><Star className={cn('w-7 h-7', n <= stars ? 'fill-amber-300 text-amber-300' : 'text-zinc-500')} /></button>
            ))}
          </div>
          {stars > 0 && stars < 4 && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-300">What went wrong?</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {CALL_ISSUES.map((i) => (
                  <button key={i.id} type="button" aria-pressed={issues.includes(i.id)} onClick={() => setIssues((l) => (l.includes(i.id) ? l.filter((x) => x !== i.id) : [...l, i.id]))}
                    className={cn('px-2.5 py-1 rounded-full text-xs border', issues.includes(i.id) ? 'bg-white text-zinc-900 border-white' : 'border-white/20 text-zinc-200 hover:bg-white/10')}>{i.label}</button>
                ))}
              </div>
              <button type="button" onClick={() => send(stars, issues)} className="h-9 px-4 rounded-full bg-white text-zinc-900 text-sm font-semibold">Send</button>
            </div>
          )}
          <button type="button" onClick={skip} className="block mx-auto text-xs text-zinc-400 underline underline-offset-2">Not now</button>
        </>
      )}
    </motion.div>
  );
}
