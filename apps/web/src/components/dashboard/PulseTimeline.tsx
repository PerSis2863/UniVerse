'use client';

import { useState } from 'react';
import { Activity, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

// Class sessions → the classroom pulse over a class (Stage 4 · 4.4), for the teacher: how many
// students tapped "Got it" (above the line) and "I'm lost" (below it), minute by minute, and what
// the AI suggests going over again. Counts only, never names. A bar opens the recording there.

export interface PulsePoint { t: number; lost: number; got: number; total: number }
export interface Reexplain { t: number; topic: string; why: string }

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
// Rose (lost) and sky (got it): checked for colour-blind readers in light and dark; the position
// (below or above the line) and the labels say it too.
const LOST = '#f43f5e', GOT = '#0284c7';

/** The pulse as bars: the most students in each state during each slot (a tap lasts until it changes). */
function slots(pulse: PulsePoint[], durationSec: number) {
  const end = Math.max(durationSec, pulse.at(-1)?.t ?? 0, 60);
  const size = Math.max(60, Math.ceil(end / 90 / 60) * 60); // at most ~90 bars
  const n = Math.ceil(end / size);
  const rows: { from: number; lost: number; got: number; total: number }[] = [];
  let cur: PulsePoint | null = null;
  let j = 0;
  for (let i = 0; i < n; i++) {
    let lost = cur?.lost ?? 0, got = cur?.got ?? 0, total = cur?.total ?? 0;
    while (j < pulse.length && pulse[j].t < (i + 1) * size) {
      cur = pulse[j++];
      lost = Math.max(lost, cur.lost); got = Math.max(got, cur.got); total = Math.max(total, cur.total);
    }
    rows.push({ from: i * size, lost, got, total });
  }
  return { size, rows };
}

export function PulseTimeline({ pulse, reexplain, durationSec, recordingUrl }: { pulse: PulsePoint[]; reexplain: Reexplain[]; durationSec: number; recordingUrl: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!pulse.length && !reexplain.length) return null;
  const { size, rows } = slots(pulse, durationSec);
  const tapped = rows.some((r) => r.lost || r.got);
  const W = 600, H = 132, MID = 66, SLOT = W / rows.length, BAR = Math.max(2, Math.min(10, SLOT - 2));
  const peak = Math.max(1, ...rows.map((r) => Math.max(r.lost, r.got)));
  const h = (n: number) => (n ? Math.max(3, (n / peak) * (MID - 8)) : 0);
  const at = hover !== null ? rows[hover] : null;
  const open = (t: number) => { if (recordingUrl) window.open(`${recordingUrl}#t=${t}`, '_blank', 'noopener'); };

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500 inline-flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Class pulse <span className="font-normal normal-case">(only you see this)</span></h4>
        <span className="flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: GOT }} />Got it</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: LOST }} />I’m lost</span>
        </span>
      </div>
      {!tapped ? (
        <p className="text-sm text-zinc-500">Nobody tapped “I’m lost” or “Got it” during this class.</p>
      ) : (
        <div className="rounded-xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.02] p-3">
          <p className="text-xs text-zinc-600 dark:text-zinc-300 h-4 tabular-nums" aria-live="polite">
            {at ? `${clock(at.from)}–${clock(at.from + size)} · ${at.got} got it · ${at.lost} lost${at.total ? ` · of ${at.total}` : ''}${recordingUrl ? ' · tap to watch' : ''}` : 'Point at a bar to see the counts'}
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 mt-1" role="img" aria-label="Students who got it (above the line) and who were lost (below it) over the class" onMouseLeave={() => setHover(null)}>
            <line x1={0} x2={W} y1={MID} y2={MID} className="stroke-zinc-300 dark:stroke-white/15" strokeWidth={1} />
            {rows.map((r, i) => {
              const x = i * SLOT + (SLOT - BAR) / 2;
              return (
                <g key={i} className={cn(recordingUrl && 'cursor-pointer')} onMouseEnter={() => setHover(i)} onClick={() => open(r.from)}>
                  <rect x={i * SLOT} y={0} width={SLOT} height={H} fill="transparent" />
                  {r.got > 0 && <rect x={x} y={MID - 2 - h(r.got)} width={BAR} height={h(r.got)} rx={Math.min(4, BAR / 2)} fill={GOT} opacity={hover === null || hover === i ? 1 : 0.45} />}
                  {r.lost > 0 && <rect x={x} y={MID + 2} width={BAR} height={h(r.lost)} rx={Math.min(4, BAR / 2)} fill={LOST} opacity={hover === null || hover === i ? 1 : 0.45} />}
                </g>
              );
            })}
          </svg>
          <div className="flex justify-between text-[10px] text-zinc-400 tabular-nums"><span>0:00</span><span>{clock(rows.length * size)}</span></div>
        </div>
      )}
      {reexplain.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 p-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" /> Worth going over again (AI suggestion)</p>
          <ul className="mt-2 space-y-2">
            {reexplain.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <button type="button" onClick={() => open(r.t)} disabled={!recordingUrl} title={recordingUrl ? 'Watch from here' : undefined}
                  className="font-mono text-xs tabular-nums px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-300 shrink-0 disabled:cursor-default">{clock(r.t)}</button>
                <span className="min-w-0"><span className="font-medium text-zinc-900 dark:text-white">{r.topic}</span><span className="block text-xs text-zinc-600 dark:text-zinc-400">{r.why}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
