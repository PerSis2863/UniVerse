'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { AlertTriangle, BadgeCheck, Globe2, Loader2, Package, ScanLine, SearchX, Star } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LogoMark } from '@/components/ui/LogoMark';
import { usePathParams } from '@/hooks/usePathParams';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

// A brand's public page (UniVerse Trace), linked from each of its passports: the trust score (how
// genuine its products' checks are, what owners rate them, how it handled recalls), its products with
// their ratings, recent reviews and its recall history. Server: GET /trace/public/:slug.

interface Brand {
  brand: { name: string; slug: string; category: string | null; color: string | null; logoUrl: string | null; pro: boolean; since: string };
  trust: { score: number; genuinePct: number; checks: number; countries: number; rating: number | null; reviews: number };
  products: { id: string; name: string; category: string | null; description: string | null; imageUrl: string | null; warrantyMonths: number; rating: number | null; reviews: number }[];
  reviews: { stars: number; text: string | null; place: string | null; createdAt: string }[];
  recalls: { reason: string; advice: string | null; severity: string; status: string; createdAt: string; endedAt: string | null }[];
}

const day = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const rise = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 + i * 0.06, duration: 0.45, ease: [0.23, 1, 0.32, 1] as const } });

export default function View() {
  const slug = usePathParams('/b/[slug]')?.slug;
  const { data, error } = useSWR<Brand>(slug ? `/trace/public/${encodeURIComponent(slug)}` : null, fetcher);
  return (
    <main className="dark passport min-h-[100dvh] relative overflow-hidden text-white">
      <span aria-hidden className="passport-glow passport-glow-a" /><span aria-hidden className="passport-glow passport-glow-b" />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2"><LogoMark className="w-7 h-7" /><span className="font-semibold">UniVerse Trace</span></Link>
          <span className="passport-pill">Brand page</span>
        </header>
        {error ? (
          <div className="mt-24 text-center"><SearchX className="w-10 h-10 mx-auto text-zinc-400" aria-hidden /><p className="mt-3 text-zinc-300">No brand has this page.</p></div>
        ) : !data ? (
          <div className="mt-24 flex justify-center" role="status"><Loader2 className="w-8 h-8 animate-spin text-pink-300" /><span className="sr-only">Loading</span></div>
        ) : <Body d={data} />}
        <footer className="mt-10 text-center font-mono text-[11px] text-zinc-400">Every product gets a passport · UniVerse Trace</footer>
      </div>
    </main>
  );
}

function Body({ d }: { d: Brand }) {
  const r = 58, c = 2 * Math.PI * r, tone = d.trust.score >= 80 ? '#34d399' : d.trust.score >= 60 ? '#fbbf24' : '#fb7185';
  return (
    <>
      <motion.section {...rise(0)} className="mt-8 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-start">
        {d.brand.logoUrl
          // eslint-disable-next-line @next/next/no-img-element -- the brand's own logo address
          ? <img src={d.brand.logoUrl} alt="" className="w-20 h-20 rounded-3xl object-cover" />
          : <span className="w-20 h-20 rounded-3xl grid place-items-center text-3xl font-black" style={{ background: d.brand.color ?? '#fe81d1' }}>{d.brand.name[0]}</span>}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight flex items-center justify-center sm:justify-start gap-2">{d.brand.name}{d.brand.pro && <BadgeCheck className="w-6 h-6 text-pink-300" aria-label="Verified brand" />}</h1>
          <p className="mt-1 text-zinc-300">{[d.brand.category, `on Trace since ${day(d.brand.since)}`].filter(Boolean).join(' · ')}</p>
        </div>
        <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0" role="img" aria-label={`Trust score ${d.trust.score} of 100`}>
          <circle cx={70} cy={70} r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth={10} />
          <motion.circle cx={70} cy={70} r={r} fill="none" stroke={tone} strokeWidth={10} strokeLinecap="round" transform="rotate(-90 70 70)" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - d.trust.score / 100) }} transition={{ duration: 1.1, delay: 0.2, ease: [0.23, 1, 0.32, 1] }} />
          <text x={70} y={74} textAnchor="middle" fill="white" fontSize={34} fontWeight={800}>{d.trust.score}</text>
          <text x={70} y={94} textAnchor="middle" fill="rgb(212 212 216)" fontSize={10}>trust score</text>
        </svg>
      </motion.section>

      <motion.dl {...rise(1)} className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          [ScanLine, 'Genuine checks', `${d.trust.genuinePct}%`, `${d.trust.checks.toLocaleString()} in 90 days`],
          [Star, 'Owners rate it', d.trust.rating !== null ? `${d.trust.rating} / 5` : '–', `${d.trust.reviews.toLocaleString()} reviews`],
          [Globe2, 'Checked in', `${d.trust.countries}`, 'countries'],
          [AlertTriangle, 'Recalls', `${d.recalls.length}`, d.recalls.some((x) => x.status === 'ACTIVE') ? 'one is active' : 'none active'],
        ].map(([Icon, k, v, note]) => {
          const I = Icon as typeof Star;
          return <div key={k as string} className="passport-card px-4 py-3"><dt className="flex items-center gap-1.5 text-xs text-zinc-400"><I className="w-3.5 h-3.5" aria-hidden />{k as string}</dt><dd className="mt-1 font-mono text-xl">{v as string}</dd><dd className="text-[11px] text-zinc-400">{note as string}</dd></div>;
        })}
      </motion.dl>

      {d.recalls.some((x) => x.status === 'ACTIVE') && (
        <motion.section {...rise(2)} className="passport-card passport-alert mt-6 p-5" role="alert">
          {d.recalls.filter((x) => x.status === 'ACTIVE').map((x, i) => (
            <div key={i}><p className="font-bold flex items-center gap-2 text-rose-200"><AlertTriangle className="w-4 h-4" aria-hidden />Recall: {x.reason}</p>{x.advice && <p className="mt-1 text-sm text-zinc-200">{x.advice}</p>}</div>
          ))}
          <p className="mt-2 text-xs text-zinc-300">Scan the code on your product to see if yours is affected.</p>
        </motion.section>
      )}

      {d.products.length > 0 && (
        <motion.section {...rise(3)} className="mt-6" aria-labelledby="products-h">
          <h2 id="products-h" className="font-bold">Products</h2>
          <ul className="mt-3 grid sm:grid-cols-2 gap-3">
            {d.products.map((p) => (
              <li key={p.id} className="passport-card p-4 flex gap-3">
                {p.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element -- the brand's own product photo
                  ? <img src={p.imageUrl} alt="" className="w-14 h-14 rounded-2xl object-cover" />
                  : <span className="w-14 h-14 rounded-2xl grid place-items-center bg-white/[0.06]"><Package className="w-6 h-6 text-pink-200" aria-hidden /></span>}
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  {p.description && <p className="text-xs text-zinc-400 line-clamp-2">{p.description}</p>}
                  <p className="mt-1 font-mono text-[11px] text-zinc-300">{[p.rating !== null ? `★ ${p.rating} (${p.reviews})` : null, p.warrantyMonths ? `${p.warrantyMonths}-month warranty` : null].filter(Boolean).join(' · ') || 'No reviews yet'}</p>
                </div>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {d.reviews.length > 0 && (
        <motion.section {...rise(4)} className="mt-6" aria-labelledby="reviews-h">
          <h2 id="reviews-h" className="font-bold">What owners say</h2>
          <p className="text-xs text-zinc-400">Only people holding a genuine unit can review it, once per unit.</p>
          <ul className="mt-3 grid sm:grid-cols-2 gap-3">
            {d.reviews.map((x, i) => (
              <li key={i} className="passport-card p-4">
                <span className="text-amber-300" aria-label={`${x.stars} of 5 stars`}>{'★'.repeat(x.stars)}<span className="text-zinc-600">{'★'.repeat(5 - x.stars)}</span></span>
                <p className="mt-1 text-sm text-zinc-200">{x.text}</p>
                <p className="mt-1 font-mono text-[10px] text-zinc-500">{[x.place, day(x.createdAt)].filter(Boolean).join(' · ')}</p>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {d.recalls.some((x) => x.status !== 'ACTIVE') && (
        <motion.section {...rise(5)} className="mt-6" aria-labelledby="past-h">
          <h2 id="past-h" className="font-bold">Past recalls</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {d.recalls.filter((x) => x.status !== 'ACTIVE').map((x, i) => <li key={i} className={cn('passport-card px-4 py-2')}>{x.reason} <span className="font-mono text-[11px] text-zinc-500">· {day(x.createdAt)}{x.endedAt ? ` to ${day(x.endedAt)}` : ''}</span></li>)}
          </ul>
        </motion.section>
      )}
    </>
  );
}
