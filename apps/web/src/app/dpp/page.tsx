'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Loader2, Package } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LogoMark } from '@/components/ui/LogoMark';
import { DppCard } from '@/components/trace/DppCard';
import { fetcher } from '@/lib/fetcher';
import type { Dpp } from '@/lib/dpp';

// A product's EU Digital Product Passport (M108, GET /trace/dpp/<GTIN>): the product, its brand and the
// passport, for anyone (no sign-in). One unit's page (/t/<code>) also proves the unit is genuine.

interface Answer { gtin: string; product: { name: string; category: string | null; description: string | null; imageUrl: string | null }; brand: { name: string; slug: string; logoUrl: string | null } | null; dpp: Dpp | null; updatedAt: string | null }

function View() {
  const g = useSearchParams().get('g');
  const { data, error } = useSWR<Answer>(g ? `/trace/dpp/${encodeURIComponent(g)}` : null, fetcher);
  return (
    <main className="dark passport min-h-[100dvh] relative overflow-hidden text-white">
      <span aria-hidden className="passport-glow passport-glow-a" /><span aria-hidden className="passport-glow passport-glow-b" />
      <div className="relative max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 min-w-0"><LogoMark className="w-7 h-7" /><span className="font-semibold truncate">{data?.brand?.name ?? 'UniVerse Trace'}</span></span>
          <span className="passport-pill">Product passport</span>
        </header>
        {!g || error ? (
          <p className="mt-24 text-center text-zinc-300">{g ? 'No product passport has this number.' : 'Open this page from a product’s code.'}</p>
        ) : !data ? (
          <div className="mt-24 flex flex-col items-center text-center gap-3" role="status"><Loader2 className="w-8 h-8 animate-spin text-pink-300" /><p className="text-zinc-300">Opening the passport…</p></div>
        ) : (
          <>
            <section className="passport-card mt-6 p-5 pp-rise">
              <div className="flex gap-4">
                <span className="w-16 h-16 rounded-2xl shrink-0 grid place-items-center bg-white/[0.06]"><Package className="w-7 h-7 text-pink-200" aria-hidden /></span>
                <div className="min-w-0">
                  {data.product.category && <p className="text-xs font-semibold uppercase tracking-wider text-pink-200">{data.product.category}</p>}
                  <h1 className="text-2xl font-black leading-tight" translate="no">{data.product.name}</h1>
                  {data.product.description && <p className="mt-1 text-sm text-zinc-300">{data.product.description}</p>}
                </div>
              </div>
              <p className="mt-4 text-xs text-zinc-400">This is the product’s passport. To check that one item is genuine, scan the code on it.</p>
            </section>
            {data.dpp ? <DppCard dpp={data.dpp} gtin={data.gtin} /> : <p className="passport-card mt-4 p-5 text-sm text-zinc-300">{data.brand?.name ?? 'The brand'} hasn’t filled in this passport yet.</p>}
            {data.brand && <Link href={`/b/${data.brand.slug}`} className="mt-6 inline-flex text-sm font-semibold text-pink-200 underline underline-offset-2">More from {data.brand.name}</Link>}
          </>
        )}
      </div>
    </main>
  );
}

export default function DppPage() {
  return <Suspense><View /></Suspense>;
}
