'use client';

import useSWR from 'swr';
import { Globe2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { fetcher } from '@/lib/fetcher';
import { errorMessage } from '@/lib/api';
import { useActivePoll } from '@/lib/realtime-client';
import { Planet } from '@/components/live/Planet';
import { globeFromShipments, type GlobeShipment } from '@/lib/trace-globe';

// Trace's Live globe (M59): the brand's own shipments as points and arcs on the 3D globe, polled
// while the page is active. Reuses GET /trace/map/tracking and the Planet component; the mapping is
// in src/lib/trace-globe.ts. Only the brand's data — no outside tracking.

export function GlobeView() {
  const poll = useActivePoll(10_000);
  const { data, error, mutate } = useSWR<{ shipments: GlobeShipment[] }>('/trace/map/tracking', fetcher, { refreshInterval: poll, keepPreviousData: true });

  if (error) {
    const noBrand = /brand/i.test(errorMessage(error, ''));
    return (
      <div className="panel p-8 text-center">
        <Globe2 className="w-8 h-8 mx-auto text-pink-500" aria-hidden />
        <p className="mt-3 font-bold text-zinc-900 dark:text-white">{noBrand ? 'Start your brand to see it on the globe.' : 'The globe could not load.'}</p>
        {noBrand ? <Link href="/trace" className="btn-primary mt-4 inline-flex">Start your brand</Link> : <button type="button" onClick={() => void mutate()} className="btn-secondary mt-4">Try again</button>}
      </div>
    );
  }

  const ships = data?.shipments ?? [];
  const onMove = ships.filter((s) => s.status === 'IN_TRANSIT' && s.position).length;
  const { places, arcs } = globeFromShipments(ships);

  return (
    <div className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-zinc-900 dark:text-white">Your shipments, live</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{onMove} on the move · {places.length ? `${ships.filter((s) => s.position).length} on the globe` : 'nothing shipping yet'}</p>
      </div>
      {places.length ? (
        <Planet places={places} arcs={arcs} label="Your shipments on a turning globe" className="mt-4 h-[360px] sm:h-[520px]" />
      ) : (
        <p className="mt-10 mb-10 text-center text-sm text-zinc-500 dark:text-zinc-400">Ship a batch and it appears here, moving toward its destination.</p>
      )}
    </div>
  );
}
