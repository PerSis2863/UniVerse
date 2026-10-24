'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Clock, Gift, Loader2, MapPin, Package, SearchX, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LogoMark } from '@/components/ui/LogoMark';
import { usePathParams } from '@/hooks/usePathParams';
import { api, errorMessage } from '@/lib/api';
import { STAGE_LABEL, type Stage, type Verdict } from '@/lib/trace';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// The product passport (UniVerse Trace): what anyone sees after scanning the code on a product. A
// big seal says whether it's genuine, then the product's story, where it has been, and (for shops
// and installers who are signed in) the points it earns. The first visit counts as a scan; this
// browser's later visits don't (`again`), so reopening the page never makes a product look copied.
// GPS is used only when the browser already allows it; otherwise the server compares countries.

interface Passport {
  result: Verdict;
  code: string; serial: number;
  brand: { name: string; logoUrl: string | null };
  product: { name: string; category: string | null; description: string | null; story: string | null; imageUrl: string | null; warrantyMonths: number; rewardPoints: number };
  batch: { label: string; origin: string | null; madeAt: string | null; quantity: number };
  journey: { stage: string; place: string | null; createdAt: string }[];
  scans: number; firstScanAt: string | null; firstPlace: string | null;
  claimed: boolean; claimedByYou: boolean; canClaim: boolean;
}
type Answer = Passport | { result: 'UNKNOWN' };

const SEAL: Record<Verdict | 'UNKNOWN', { title: string; tone: string; icon: typeof ShieldCheck }> = {
  FIRST: { title: 'Genuine', tone: 'is-good', icon: ShieldCheck },
  SEEN: { title: 'Genuine', tone: 'is-good', icon: ShieldCheck },
  SUSPECT: { title: 'Be careful', tone: 'is-warn', icon: ShieldAlert },
  UNKNOWN: { title: 'Not recognised', tone: 'is-bad', icon: SearchX },
};
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

async function here(): Promise<{ lat: number; lng: number } | null> {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (p?.state !== 'granted') return null;
    return await new Promise((done) => navigator.geolocation.getCurrentPosition((g) => done({ lat: g.coords.latitude, lng: g.coords.longitude }), () => done(null), { timeout: 4000, maximumAge: 600_000 }));
  } catch { return null; }
}

export default function View() {
  const code = usePathParams('/t/[code]')?.code;
  const signedIn = useAuthStore((s) => !!s.user);
  const [data, setData] = useState<Answer | null>(null);
  const [failed, setFailed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [earned, setEarned] = useState<{ points: number; balance: number } | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const key = `trace-seen:${code.toUpperCase().replace(/-/g, '')}`;
    void (async () => {
      let again = false;
      try { again = !!localStorage.getItem(key); } catch { /* private mode */ }
      const pos = await here();
      try {
        const res = await api.post<Answer>(`/trace/scan/${encodeURIComponent(code)}`, { ...pos, again });
        if (cancelled) return;
        setData(res.data);
        if (res.data.result !== 'UNKNOWN') { try { localStorage.setItem(key, '1'); } catch { /* private mode */ } }
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const claim = async () => {
    if (!code) return;
    setClaiming(true);
    try {
      const res = await api.post<{ points: number; balance: number }>(`/trace/scan/${encodeURIComponent(code)}/claim`);
      setEarned(res.data);
      toast.success(`+${res.data.points} points`);
    } catch (e) { toast.error(errorMessage(e, 'Could not add the points.')); } finally { setClaiming(false); }
  };

  return (
    <main className="dark passport min-h-[100dvh] relative overflow-hidden text-white">
      <span aria-hidden className="passport-glow passport-glow-a" /><span aria-hidden className="passport-glow passport-glow-b" />
      <div className="relative max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 min-w-0">
            {data && 'brand' in data && data.brand.logoUrl
              // eslint-disable-next-line @next/next/no-img-element -- the brand's own logo address
              ? <img src={data.brand.logoUrl} alt="" className="w-7 h-7 rounded-lg object-cover" />
              : <LogoMark className="w-7 h-7" />}
            <span className="font-semibold truncate">{data && 'brand' in data ? data.brand.name : 'UniVerse Trace'}</span>
          </span>
          <span className="passport-pill">Product passport</span>
        </header>

        {!data && !failed && (
          <div className="mt-24 flex flex-col items-center text-center gap-3" role="status">
            <Loader2 className="w-8 h-8 animate-spin text-pink-300" />
            <p className="text-zinc-300">Checking this product…</p>
          </div>
        )}
        {failed && <p className="mt-24 text-center text-zinc-300">We couldn’t check the code just now. Check your connection and open the page again.</p>}

        {data && <Seal data={data} />}

        {data && 'product' in data && (
          <>
            <section className="passport-card mt-6 p-5 pp-rise" style={{ animationDelay: '120ms' }}>
              <div className="flex gap-4">
                {data.product.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element -- the brand's own product photo
                  ? <img src={data.product.imageUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shrink-0" />
                  : <span className="w-20 h-20 rounded-2xl shrink-0 grid place-items-center bg-white/[0.06]"><Package className="w-8 h-8 text-pink-200" aria-hidden /></span>}
                <div className="min-w-0">
                  {data.product.category && <p className="text-xs font-semibold uppercase tracking-wider text-pink-200">{data.product.category}</p>}
                  <h1 className="text-2xl font-black leading-tight">{data.product.name}</h1>
                  {data.product.description && <p className="mt-1 text-sm text-zinc-300">{data.product.description}</p>}
                </div>
              </div>
              {data.product.story && <p className="mt-4 text-[15px] leading-relaxed text-zinc-200">{data.product.story}</p>}
              <dl className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs">
                <Fact k="Unit" v={`${data.serial.toLocaleString()} of ${data.batch.quantity.toLocaleString()}`} />
                <Fact k="Batch" v={data.batch.label} />
                {data.batch.origin && <Fact k="Made in" v={data.batch.origin} />}
                {data.batch.madeAt && <Fact k="Made on" v={day(data.batch.madeAt)} />}
                {data.product.warrantyMonths > 0 && <Fact k="Warranty" v={`${data.product.warrantyMonths} months`} />}
                <Fact k="Code" v={data.code} />
              </dl>
            </section>

            <section className="passport-card mt-4 p-5 pp-rise" style={{ animationDelay: '220ms' }} aria-labelledby="journey-h">
              <h2 id="journey-h" className="font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-pink-300" aria-hidden />Its journey</h2>
              <ol className="mt-4 relative ms-2 border-s border-white/15 space-y-4">
                {data.journey.map((e, i) => (
                  <li key={i} className="relative ps-5">
                    <span aria-hidden className="absolute -start-[6px] top-1 w-3 h-3 rounded-full bg-zinc-200" />
                    <p className="font-semibold">{STAGE_LABEL[e.stage as Stage] ?? e.stage}{e.place ? <span className="font-normal text-zinc-300"> · {e.place}</span> : null}</p>
                    <p className="font-mono text-[11px] text-zinc-400">{day(e.createdAt)}</p>
                  </li>
                ))}
                <li className="relative ps-5">
                  <span aria-hidden className="absolute -start-[7px] top-0.5 w-3.5 h-3.5 rounded-full bg-[var(--ins-hot)] pp-node" />
                  <p className="font-semibold">Checked by you<span className="font-normal text-zinc-300"> · just now</span></p>
                  <p className="font-mono text-[11px] text-zinc-400">{data.scans <= 1 ? 'the first check of this unit' : `checked ${data.scans} times, first ${data.firstPlace ? `in ${data.firstPlace}` : day(data.firstScanAt)}`}</p>
                </li>
              </ol>
            </section>

            {data.product.rewardPoints > 0 && data.result !== 'SUSPECT' && (
              <section className="passport-card passport-reward mt-4 p-5 pp-rise" style={{ animationDelay: '320ms' }}>
                <p className="font-bold flex items-center gap-2"><Gift className="w-4 h-4 text-pink-300" aria-hidden />For shops and installers</p>
                {data.code === 'DEMO' ? (
                  <p className="mt-2 text-sm text-zinc-200">On a real product, the shop that sells it scans this code and earns <b className="text-white">{data.product.rewardPoints} points</b> from the brand, once per unit.</p>
                ) : earned ? (
                  <p className="mt-2 text-sm text-zinc-200"><b className="text-white">+{earned.points} points</b> added. You have {earned.balance.toLocaleString()} points.</p>
                ) : data.claimedByYou ? (
                  <p className="mt-2 text-sm text-zinc-200">You already earned the points for this unit.</p>
                ) : data.claimed ? (
                  <p className="mt-2 text-sm text-zinc-300">The points for this unit were already earned.</p>
                ) : data.canClaim ? (
                  <button type="button" onClick={() => void claim()} disabled={claiming} className="mt-3 btn-primary w-full justify-center">
                    {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Earn {data.product.rewardPoints} points
                  </button>
                ) : !signedIn ? (
                  <Link href={`/login?next=${encodeURIComponent(`/t/${code}`)}`} className="mt-3 btn-primary w-full justify-center">Sign in to earn {data.product.rewardPoints} points</Link>
                ) : null}
              </section>
            )}
          </>
        )}

        <footer className="mt-8 text-center font-mono text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
          <Clock className="w-3 h-3" aria-hidden />Checked by UniVerse Trace · every product gets a passport
        </footer>
      </div>
    </main>
  );
}

function Seal({ data }: { data: Answer }) {
  const s = SEAL[data.result];
  const text = data.result === 'UNKNOWN'
    ? 'This code isn’t one of ours. The product may be fake: don’t rely on it, and tell the shop where you bought it.'
    : data.result === 'SUSPECT'
      ? `This code was also checked far from here${'firstPlace' in data && data.firstPlace ? ` (first in ${data.firstPlace})` : ''}. The label may have been copied. Ask the shop, or contact ${'brand' in data ? data.brand.name : 'the brand'}.`
      : data.result === 'FIRST'
        ? 'You’re the first person to check this unit. It was made by the brand and hasn’t been copied.'
        : `This unit was checked ${'scans' in data ? data.scans : 'a few'} times, all close to where it was sold. That’s normal.`;
  return (
    <section className={cn('mt-8 flex flex-col items-center text-center', s.tone)} aria-live="polite">
      <span className="passport-seal pp-pop" aria-hidden>
        <span className="passport-seal-ring" />
        <span className="passport-seal-core"><s.icon className="w-14 h-14" strokeWidth={1.6} /></span>
      </span>
      <h2 className="mt-5 text-4xl sm:text-5xl font-black tracking-tight">{s.title}</h2>
      <p className="mt-2 max-w-md text-zinc-300">{text}</p>
    </section>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-xl bg-white/[0.04] px-3 py-2 min-w-0"><dt className="text-zinc-400">{k}</dt><dd className="text-zinc-100 truncate">{v}</dd></div>
);
