'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { History, Loader2, Pause, Play } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { apply, replayStats, type Replay } from '@/lib/writing-replay';

// For the teaching team: how a typed answer grew (Stage 5 · B3.6, src/lib/writing-replay.ts). A change
// was kept every few seconds while the student wrote, and each paste on its own; never each key.

const EVERY = 25;
const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "How it was written": loaded when opened. */
export function WritingReplay({ submissionId, matches, name }: { submissionId: string; matches: boolean | null | undefined; name: string }) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (matches == null) return null;
  const load = async () => {
    if (replay || busy) return;
    setBusy(true);
    try { setReplay((await authedJson<{ replay: Replay }>(`/api/assignments/submissions/${submissionId}/replay`)).replay); }
    catch (e) { setError(errorMessage(e, 'The replay couldn’t be loaded.')); }
    finally { setBusy(false); }
  };
  return (
    <details className="panel px-5 py-3" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void load(); }}>
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white inline-flex items-center gap-2"><History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> How it was written</summary>
      <div className="mt-3 space-y-3">
        {busy && <p className="text-sm text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading the replay…</p>}
        {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        {replay && <Player replay={replay} matches={matches} name={name} />}
      </div>
    </details>
  );
}

function Player({ replay, matches, name }: { replay: Replay; matches: boolean; name: string }) {
  const n = replay.chunks.length;
  const [step, setStep] = useState(n);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLModElement>(null);
  const stats = useMemo(() => replayStats(replay), [replay]);
  // The text after every 25th change, so moving along the replay stays quick.
  const snaps = useMemo(() => {
    const out = [replay.base];
    let text = replay.base;
    replay.chunks.forEach((c, k) => { text = apply(text, c); if ((k + 1) % EVERY === 0) out.push(text); });
    return out;
  }, [replay]);
  const textAfter = (k: number) => {
    let text = snaps[Math.floor(k / EVERY)];
    for (let j = Math.floor(k / EVERY) * EVERY; j < k; j++) text = apply(text, replay.chunks[j]);
    return text;
  };
  const before = step > 0 ? textAfter(step - 1) : replay.base;
  const c = step > 0 ? replay.chunks[step - 1] : null;

  // Playing steps through the changes, and stops at the end.
  const running = playing && step < n;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setStep((s) => Math.min(n, s + 1)), 350);
    return () => clearInterval(t);
  }, [running, n]);
  // Keeps the change in view inside the box (not the page).
  useEffect(() => {
    const b = box.current, m = mark.current;
    if (b && m) b.scrollTop = Math.max(0, m.offsetTop - b.clientHeight / 2);
  }, [step]);

  const first = name.split(' ')[0];
  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-800 dark:text-zinc-200">
        {stats.first != null && stats.last != null ? <>Written {stats.sittings === 1 ? 'in one sitting' : `over ${stats.sittings} sittings`}, {stats.minutes ? `about ${stats.minutes} minute${stats.minutes === 1 ? '' : 's'}` : 'under a minute'} of writing ({when(stats.first) === when(stats.last) ? when(stats.first) : `${when(stats.first)} to ${when(stats.last)}`}). </> : null}
        {stats.pastes.length ? `${stats.pastes.length} longer paste${stats.pastes.length === 1 ? '' : 's'}.` : 'No longer pastes.'}
      </p>
      {!matches && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200" role="note">This record doesn’t end at the text {first} handed in: some of it was written elsewhere (another device or app). That’s common, and not proof of anything.</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { if (running) { setPlaying(false); return; } if (step >= n) setStep(0); setPlaying(true); }} className="btn-secondary btn-icon" aria-label={running ? 'Pause' : 'Play the replay'}>{running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
        <input type="range" min={0} max={n} value={step} onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }} aria-label="Point in the writing" aria-valuetext={c ? `Change ${step} of ${n}, ${when(c.t)}` : 'The start'} className="flex-1 min-w-0 accent-indigo-600" />
        <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400 shrink-0">{c ? when(c.t) : 'Start'}</span>
      </div>
      {stats.pastes.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {replay.chunks.map((x, k) => x.paste && x.i.length >= 200 ? (
            <li key={k}><button type="button" onClick={() => { setPlaying(false); setStep(k + 1); }} className="btn-ghost btn-sm">Paste: {x.i.length.toLocaleString()} characters · {when(x.t)}</button></li>
          ) : null)}
        </ul>
      )}
      <div ref={box} className="relative max-h-80 overflow-y-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-3 leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">
        {c ? <>
          {before.slice(0, c.p)}
          {c.d > 0 && <del className="bg-red-500/15 text-red-800 dark:text-red-300">{before.slice(c.p, c.p + c.d)}</del>}
          <ins ref={mark} className={c.paste ? 'no-underline bg-amber-400/30 text-zinc-900 dark:text-white' : 'no-underline bg-emerald-500/20 text-zinc-900 dark:text-white'}>{c.i}</ins>
          {before.slice(c.p + c.d)}
        </> : (replay.base || <span className="text-zinc-500">(empty)</span>)}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">Green: written at that point. Amber: pasted. Red: removed. Pastes can be {first}’s own text moved around; worth a conversation, not a conclusion.</p>
    </div>
  );
}
