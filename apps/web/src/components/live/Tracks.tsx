'use client';

import type { CSSProperties } from 'react';
import Link from '@/components/ui/Link';
import { cn } from '@/lib/utils';
import { TONES, type Tone } from './paint';

// Tracks (M171, the owner, 13 Nov: "remove the constellation animation… add something else animations
// which are functional and unique and it shows the details"; then "make the ui and design smooth"): in
// place of the constellation's drifting points, one row per course, class, department, kind or brand: its
// name and number, a smooth bar that glides out from the start (its parts side by side in their colours,
// a soft light on the end), and a line of detail. The next thing due breathes at the end of its bar. A
// row with a link opens what it's about.

export interface TrackPart { n: number; tone: Tone; label: string }
export interface Track {
  key: string;
  /** A short code (in mono beside the name) or the row's name. */
  label: string;
  /** The longer name, when `label` is a code. */
  name?: string;
  parts: TrackPart[];
  /** On the right (default: the total). */
  value?: string;
  /** A small amber note before the value ("2 due"). */
  badge?: string;
  detail?: string;
  href?: string;
  /** Breathes at the end of the bar (the next thing due). */
  next?: boolean;
}

export function Tracks({ tracks, label, max: scale, className }: { tracks: Track[]; label: string; /** What a full bar means (default: the biggest row). */ max?: number; className?: string }) {
  const total = (t: Track) => t.parts.reduce((a, p) => a + p.n, 0);
  const max = scale ?? Math.max(1, ...tracks.map(total));
  const legend = new Map<string, Tone>();
  for (const t of tracks) for (const p of t.parts) if (p.n > 0 && !legend.has(p.label)) legend.set(p.label, p.tone);
  return (
    <figure aria-label={label} className={cn('tracks', className)}>
      <ul className="divide-y divide-white/[0.06]">
        {tracks.map((t, r) => {
          const sum = total(t), fill = Math.min(1, sum / max);
          const body = (
            <>
              <span className="flex items-center gap-2">
                {t.name && <span className="shrink-0 rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[11px] text-white/70" translate="no">{t.label}</span>}
                <span className="min-w-0 truncate text-sm font-medium text-white/90" translate="no">{t.name ?? t.label}</span>
                {t.badge && <span className="ms-auto shrink-0 rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200">{t.badge}</span>}
                <span className={cn('shrink-0 font-mono text-sm tabular-nums text-white', !t.badge && 'ms-auto')}>{t.value ?? sum.toLocaleString()}</span>
              </span>
              <span className="tracks-track mt-2" aria-hidden>
                {fill > 0 && (
                  <span className="tracks-fill" style={{ inlineSize: `${Math.max(fill * 100, 2)}%` }}>
                    {t.parts.filter((p) => p.n > 0).map((p) => (
                      <span key={p.label} style={{ flexGrow: p.n, '--c': TONES[p.tone] } as CSSProperties} />
                    ))}
                  </span>
                )}
                {t.next && fill > 0 && <span className="tracks-next" style={{ insetInlineStart: `${Math.max(fill * 100, 2)}%` }} />}
              </span>
              {t.detail && <span className="mt-1.5 block truncate text-xs text-white/60">{t.detail}</span>}
            </>
          );
          const row = 'block rounded-xl px-3 py-2.5 transition-colors duration-200';
          return (
            <li key={t.key} style={{ '--r': r } as CSSProperties} className="border-white/[0.06]">
              {t.href
                ? <Link href={t.href} className={cn(row, 'hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2')}>{body}</Link>
                : <div className={row}>{body}</div>}
            </li>
          );
        })}
      </ul>
      {legend.size > 1 && (
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 text-xs text-white/60">
          {[...legend].map(([name, tone]) => (
            <span key={name} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: `rgb(${TONES[tone]})` }} aria-hidden />{name}</span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
