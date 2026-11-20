'use client';

import { Clock, Coins, Leaf, Plane, Ship, TrainFront, Truck, type LucideIcon } from 'lucide-react';
import { distanceM } from '@/lib/attendance-rules';
import { shipWays, type ShipMode } from '@/lib/trace';

// M359 (the owner, 20 Nov: "all of them and add more options like this in the system"): Directions' compare-the-ways
// (M356) for a shipment: from where it left to where it's going, road, rail, sea and air with door-to-door days, the CO₂
// for its weight (the product's weight × units) and the usual price level, the fastest, greenest and cheapest marked.

const KIND: Record<ShipMode, { icon: LucideIcon; label: string; color: string }> = {
  road: { icon: Truck, label: 'Road', color: '#52525b' },
  rail: { icon: TrainFront, label: 'Rail', color: '#7c3aed' },
  sea: { icon: Ship, label: 'Sea', color: '#0284c7' },
  air: { icon: Plane, label: 'Air', color: '#ea580c' },
};
const PRICE = ['', 'Cheapest kind', 'Low price', 'Mid price', 'Highest price'];
const kgText = (n: number) => (n < 10 ? `${n.toFixed(1)} kg` : n < 10_000 ? `${Math.round(n).toLocaleString()} kg` : `${(n / 1000).toFixed(1)} t`);

export function ShipWays({ from, to, weightKg }: { from: { lat: number; lng: number }; to: { lat: number; lng: number }; weightKg: number }) {
  const km = distanceM(from, to) / 1000, ways = shipWays(km, weightKg);
  if (ways.length < 2) return null;
  const now = ways.find((w) => w.mode === 'road') ?? ways[0], green = ways.find((w) => w.greenest)!;
  return (
    <section className="mt-4" aria-labelledby="shipways-h">
      <h3 id="shipways-h" className="text-xs font-semibold text-zinc-900 dark:text-white">Ways to ship this</h3>
      <p className="text-[11px] text-zinc-500">{Math.round(km).toLocaleString()} km as the crow flies · {kgText(weightKg)} of goods</p>
      <ul className="mt-2 space-y-1.5">
        {ways.map((w) => {
          const { icon: I, label, color } = KIND[w.mode];
          return (
            <li key={w.mode} className="flex items-center gap-2.5 rounded-xl bg-zinc-50 px-2.5 py-2 dark:bg-white/[0.04]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }} aria-hidden><I className="h-3.5 w-3.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">{label}</span>
                  <span className="text-xs tabular-nums text-zinc-700 dark:text-zinc-200">{w.days} {w.days === 1 ? 'day' : 'days'}</span>
                  <span className="text-xs tabular-nums text-zinc-500">{kgText(w.kg)} CO₂</span>
                </span>
                <span className="flex flex-wrap gap-x-2 text-[11px]">
                  <span className="text-zinc-500"><span aria-hidden>{'$'.repeat(w.cost)}</span><span className="sr-only">{PRICE[w.cost]}</span></span>
                  {w.fastest && <span className="inline-flex items-center gap-0.5 font-semibold text-pink-700 dark:text-pink-300"><Clock className="h-3 w-3" aria-hidden />Fastest</span>}
                  {w.greenest && <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 dark:text-emerald-300"><Leaf className="h-3 w-3" aria-hidden />Greenest</span>}
                  {w.cheapest && <span className="inline-flex items-center gap-0.5 font-semibold text-amber-800 dark:text-amber-300"><Coins className="h-3 w-3" aria-hidden />Cheapest</span>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {now !== green && now.kg - green.kg > 1 && <p className="mt-2 text-[11px] text-emerald-800 dark:text-emerald-300">By {KIND[green.mode].label.toLowerCase()} instead of road: {kgText(now.kg - green.kg)} less CO₂.</p>}
      <p className="mt-1 text-[11px] text-zinc-500">Estimates from the distance; sea needs a port at both ends. Your carrier quotes the real days and price.</p>
    </section>
  );
}
