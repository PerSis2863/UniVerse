'use client';

import { Bike, Car, ExternalLink, Footprints, TrainFront } from 'lucide-react';
import { duration } from '@/lib/map-tools';
import { reach, reachLink, type Pt } from '@/lib/relief-route';
import type { QuickMode } from '@/lib/transit-options';

// M362: how to get somewhere, every way (on foot, by bike, bus or train, car) with its time, the quickest marked, each
// opening Google Maps' directions that way: Relief (a helper to a need, shown about 500 m from where it is, so times are
// close) and Green's places (with the car's CO₂, `note`). `hot` is the quickest chip's colour (white text on it, 4.5:1).

const ICON: Record<QuickMode, typeof Car> = { foot: Footprints, bike: Bike, transit: TrainFront, car: Car };
const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums';

/** `linkFor`: where a chip goes (Relief's places search by name and town: their saved spot is rounded about 500 m). */
export function ReachWays({ from, to, hot = 'bg-orange-700 hover:bg-orange-800', label = 'Getting there', note, linkFor }: { from: Pt; to: Pt; hot?: string; label?: string; note?: React.ReactNode; linkFor?: (mode: QuickMode) => string }) {
  const { ways, best } = reach(from, to);
  if (!ways.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs text-zinc-600 dark:text-zinc-300">{label}{best ? <>: quickest <span className="font-semibold text-zinc-900 dark:text-white">{best.words}</span></> : null}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {ways.map((w) => {
          const I = ICON[w.mode], top = w === best;
          return (
            <li key={w.mode}>
              <a href={linkFor ? linkFor(w.mode) : reachLink(from, to, w.mode)} target="_blank" rel="noopener noreferrer" aria-label={`${duration(w.minutes)} ${w.words}: directions in Google Maps`}
                className={top ? `${chip} ${hot} text-white` : `${chip} bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-white/[0.07] dark:text-zinc-100 dark:hover:bg-white/[0.11]`}>
                <I className="h-3.5 w-3.5" aria-hidden />{w.mode === 'transit' ? '~' : ''}{duration(w.minutes)}
              </a>
            </li>
          );
        })}
        <li className="inline-flex items-center text-[11px] text-zinc-500"><ExternalLink className="me-1 h-3 w-3" aria-hidden />Google Maps</li>
      </ul>
      {note && <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">{note}</p>}
    </div>
  );
}
