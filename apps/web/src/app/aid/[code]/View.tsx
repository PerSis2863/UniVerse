'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { Bell, BellOff, Check, Loader2, MapPin, Package, PackageCheck, Truck, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LogoMark } from '@/components/ui/LogoMark';
import { usePathParams } from '@/hooks/usePathParams';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { AID_LABEL, AID_STEPS, RELIEF_ORG_KIND_LABEL, type AidStep, type AidTrip } from '@/lib/relief';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// M151: an aid box's trip, for donors (public: the code in the link or on the box's QR label). What is
// in it, who sent it, the towns it passed and when; M154: the trip on a map (rounded to about 500 m) and a
// helper's first name when they chose to show it; never who received it. Signed-in visitors can follow it.

const ICON: Record<AidStep, typeof Package> = { PACKED: Package, ON_THE_WAY: Truck, DELIVERED: PackageCheck };
/** M154: who logged a step, when they chose to show their first name. */
const BY: Record<AidStep, string> = { PACKED: 'packed by', ON_THE_WAY: 'carried by', DELIVERED: 'delivered by' };
// The map loads only on this page, after the trip (it brings the world's shapes).
const AidMap = dynamic(() => import('@/components/relief/AidMap'), { ssr: false, loading: () => <div className="h-56 sm:h-64 rounded-xl skeleton" /> });

export default function View() {
  const code = usePathParams('/aid/[code]')?.code;
  const { data, error } = useSWR<AidTrip>(code ? `/relief/aid/${encodeURIComponent(code)}` : null, fetcher, { shouldRetryOnError: false });
  return (
    <main className="min-h-[100dvh] px-4 py-8 sm:py-14 overflow-x-hidden" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-xl mx-auto">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-zinc-900 dark:text-white"><LogoMark className="w-7 h-7" />UniVerse Relief</Link>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Aid tracker</span>
        </header>
        {!data && !error && (
          <div className="mt-24 flex flex-col items-center gap-3 text-zinc-600 dark:text-zinc-300" role="status"><Loader2 className="w-7 h-7 animate-spin" aria-hidden />Finding the box…</div>
        )}
        {error && !data && (
          <section className="card mt-10 text-center" role="alert">
            <p className="font-semibold text-zinc-900 dark:text-white">{errorMessage(error, 'We couldn’t find it just now.')}</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Check the code on the label, or scan its QR code again.</p>
          </section>
        )}
        {data && <Trip code={code!} d={data} />}
      </div>
    </main>
  );
}

function Trip({ code, d }: { code: string; d: AidTrip }) {
  const at = AID_STEPS.indexOf(d.status);
  const last = d.steps[d.steps.length - 1];
  const points = useMemo(() => d.steps.flatMap((s) => (s.lat != null && s.lng != null ? [{ lat: s.lat, lng: s.lng, place: s.place }] : [])), [d.steps]);
  return (
    <>
      <h1 className="mt-8 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white" translate="no">{d.contents}</h1>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        {d.boxes > 1 ? `${d.boxes} boxes` : 'One box'} from <b className="text-zinc-900 dark:text-white" translate="no">{d.org?.name ?? 'a Relief organisation'}</b>
        {d.org ? ` (${RELIEF_ORG_KIND_LABEL[d.org.kind as keyof typeof RELIEF_ORG_KIND_LABEL] ?? d.org.kind})` : ''}, going to <b className="text-zinc-900 dark:text-white" translate="no">{d.toPlace}</b>.
      </p>

      <section className="card mt-6" aria-label="Where it is">
        <ol className="grid grid-cols-3 gap-2">
          {AID_STEPS.map((s, i) => {
            const Icon = ICON[s], done = i <= at;
            return (
              <li key={s} className="flex flex-col items-center text-center gap-2">
                <span className={cn('w-10 h-10 rounded-full grid place-items-center transition-colors duration-300', done ? 'bg-indigo-600 text-white' : 'bg-[var(--fill)] text-zinc-500 dark:text-zinc-400')} aria-hidden><Icon className="w-5 h-5" /></span>
                <span className={cn('text-[13px] font-medium', done ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400')}>{AID_LABEL[s]}{i === at && <span className="sr-only"> (now)</span>}</span>
              </li>
            );
          })}
        </ol>
        <span className="mt-3 mx-[16.6%] block h-1 rounded-full bg-[var(--fill)] overflow-hidden" aria-hidden>
          <span className="aid-fill block h-full rounded-full bg-indigo-600 origin-left rtl:origin-right" style={{ transform: `scaleX(${at / 2})` }} />
        </span>
        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-200 text-center">
          {d.status === 'DELIVERED' ? <>Delivered{last?.place ? <> in <span translate="no">{last.place}</span></> : ''} {formatDistanceToNow(new Date(last?.createdAt ?? d.updatedAt), { addSuffix: true })}.</>
            : <>{AID_LABEL[d.status]}{last?.place ? <>, last seen in <span translate="no">{last.place}</span></> : ''}, {formatDistanceToNow(new Date(last?.createdAt ?? d.updatedAt), { addSuffix: true })}.</>}
        </p>
      </section>

      {points.length > 0 && (
        <section className="card mt-4" aria-labelledby="map-h">
          <h2 id="map-h" className="font-semibold text-zinc-900 dark:text-white">On the map</h2>
          <p className="mt-0.5 mb-3 text-xs text-zinc-500 dark:text-zinc-400">Places are rounded to about 500 m, never an exact spot.</p>
          <AidMap points={points} moving={d.status !== 'DELIVERED'} />
        </section>
      )}

      <section className="card mt-4" aria-labelledby="trip-h">
        <h2 id="trip-h" className="font-semibold text-zinc-900 dark:text-white">Its trip</h2>
        <ol className="mt-3 relative">
          {[...d.steps].reverse().map((s, i) => {
            const Icon = ICON[s.status] ?? Package;
            return (
              <li key={`${s.createdAt}-${i}`} className="app-in relative flex gap-3 pb-4 last:pb-0" style={{ animationDelay: `${i * 50}ms` }}>
                {i < d.steps.length - 1 && <span aria-hidden className="absolute start-[15px] top-8 bottom-0 w-px bg-zinc-200 dark:bg-white/[0.1]" />}
                <span className={cn('relative w-8 h-8 shrink-0 rounded-full grid place-items-center', i === 0 ? 'bg-indigo-600 text-white' : 'bg-[var(--fill)] text-zinc-600 dark:text-zinc-300')} aria-hidden><Icon className="w-4 h-4" /></span>
                <div className="min-w-0 pt-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{AID_LABEL[s.status] ?? s.status}{s.place && <span className="font-normal text-zinc-600 dark:text-zinc-300"> · <MapPin className="inline w-3.5 h-3.5 -mt-0.5" aria-hidden /> <span translate="no">{s.place}</span></span>}</p>
                  {s.byName && <p className="text-xs text-zinc-600 dark:text-zinc-300">{BY[s.status] ?? 'by'} <span translate="no">{s.byName}</span></p>}
                  {s.note && <p className="text-sm text-zinc-600 dark:text-zinc-300" translate="no">{s.note}</p>}
                  <p className="text-xs text-zinc-500 dark:text-zinc-400"><time dateTime={s.createdAt}>{format(new Date(s.createdAt), 'EEE d MMM, HH:mm')}</time></p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <Follow code={code} followers={d.followers} delivered={d.status === 'DELIVERED'} demo={d.code === 'DEMO'} />
      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400 text-center max-w-[60ch] mx-auto">Places are rounded to about 500 m. Helpers’ first names show only when they choose; the people who receive aid are never shown. Code <span className="font-mono">{d.code}</span>.</p>
    </>
  );
}

function Follow({ code, followers, delivered, demo }: { code: string; followers: number; delivered: boolean; demo: boolean }) {
  const signedIn = useAuthStore((s) => !!s.user);
  const key = signedIn && !demo ? `/relief/aid/${encodeURIComponent(code)}/follow` : null;
  const { data, mutate } = useSWR<{ following: boolean }>(key, fetcher);
  const [count, setCount] = useState(followers);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ following: boolean; followers: number }>(`/relief/aid/${encodeURIComponent(code)}/follow`, { on: !data?.following });
      setCount(r.data.followers); void mutate({ following: r.data.following }, { revalidate: false });
      toast.success(r.data.following ? 'You’ll hear when it moves' : 'Stopped following');
    } catch (err) { toast.error(errorMessage(err, 'Could not do that.')); } finally { setBusy(false); }
  };
  return (
    <section className="card mt-4 flex flex-wrap items-center gap-3" aria-label="Follow this box">
      <p className="me-auto text-sm text-zinc-700 dark:text-zinc-200 flex items-center gap-2"><Users className="w-4 h-4 text-zinc-500 dark:text-zinc-400" aria-hidden />{count === 1 ? '1 person follows this box' : `${count} people follow this box`}</p>
      {delivered ? <span className="text-sm text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5"><Check className="w-4 h-4" aria-hidden />It arrived</span>
        : demo ? <span className="text-sm text-zinc-600 dark:text-zinc-300">This is a sample box.</span>
        : !signedIn ? <Link href={`/login?app=relief&next=${encodeURIComponent(`/aid/${code}`)}`} className="btn-primary btn-sm"><Bell className="w-4 h-4" aria-hidden />Sign in to follow it</Link>
        : <button type="button" onClick={() => void toggle()} disabled={busy || !data} className={data?.following ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : data?.following ? <BellOff className="w-4 h-4" aria-hidden /> : <Bell className="w-4 h-4" aria-hidden />}{data?.following ? 'Stop following' : 'Follow this box'}</button>}
    </section>
  );
}
