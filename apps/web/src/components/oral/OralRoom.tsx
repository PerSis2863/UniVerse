'use client';

import { CircleStop, Loader2, Mic, MicOff, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OralResult } from './OralResult';
import type { OralSession } from './useOralSession';

// The oral in progress (Stage 5 · D11): the examiner speaking or listening, the clock, live
// captions, Mute and I'm done; then the result.

export function OralRoom({ oral, onBack }: { oral: OralSession; onBack: () => void }) {
  const { phase, info, left, speaking, muted, lines } = oral;
  if (phase === 'done' && oral.result) {
    return (
      <section className="panel p-5 space-y-4" aria-labelledby="oral-result-title">
        <h2 id="oral-result-title" className="font-semibold text-zinc-900 dark:text-white">{oral.result.status === 'PRACTICE' ? 'How you did' : 'Oral check sent'}</h2>
        <OralResult data={oral.result} />
        <button type="button" onClick={onBack} className="btn-primary">Done</button>
      </section>
    );
  }
  return (
    <section className="panel p-6 text-center space-y-4" aria-labelledby="oral-live-title">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">{info?.title ?? 'Oral'}</p>
        <h2 id="oral-live-title" className="font-semibold text-zinc-900 dark:text-white">{info?.topic || 'With the AI examiner'}</h2>
        {info?.attempt && phase === 'live' && <p className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-300 inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" aria-hidden /> Recording for your teacher</p>}
      </div>
      <div className={cn('w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all', phase === 'live' ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-xl shadow-fuchsia-500/30' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-500', speaking && 'scale-110')}>
        {phase !== 'live' ? <Loader2 className="w-9 h-9 animate-spin" /> : speaking ? <Volume2 className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-300" role="status">
        {phase === 'starting' ? 'Connecting to the examiner…'
          : phase === 'saving' ? (info?.attempt ? 'Sending to your teacher…' : 'Scoring your answers…')
          : speaking ? 'The examiner is speaking… (you can interrupt)' : muted ? 'Muted' : 'Listening… answer out loud'}
        {phase === 'live' && left !== null && <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left</span>}
      </p>
      {phase === 'live' && (
        <div className="flex gap-2 justify-center">
          <button type="button" className="btn-secondary" onClick={oral.toggleMute} aria-pressed={muted}>{muted ? <><Mic className="w-4 h-4" /> Unmute</> : <><MicOff className="w-4 h-4" /> Mute</>}</button>
          <button type="button" className="btn-primary" onClick={oral.finish}><CircleStop className="w-4 h-4" /> I’m done</button>
        </div>
      )}
      {lines.length > 0 && (
        <div className="text-left space-y-2 max-h-80 overflow-y-auto" role="log" aria-label="Captions" tabIndex={0}>
          {lines.map((l, i) => (
            <p key={i} className={cn('text-sm rounded-2xl px-4 py-2 max-w-[85%]', l.who === 'you' ? 'ml-auto bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-800 dark:text-zinc-200')}>
              <span className="sr-only">{l.who === 'you' ? 'You: ' : 'Examiner: '}</span>{l.text}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
