'use client';

import { useMemo } from 'react';
import { Download, Flame, CalendarDays, Smartphone, TreePine, Car, Globe2 } from 'lucide-react';
import { GREEN_FACTORS, GREEN_KINDS, type GreenKind } from '@/lib/green';
import { equivalents, longestStreak, yearGrid } from '@/lib/green-plus';
import { useNow } from '@/lib/use-now';

// Green → My impact (M216): the year at a glance (a heatmap of every day you acted, the longest run of days,
// the best month), what the CO₂ saved means in everyday terms, and "Your year": a picture to keep or share,
// drawn in the browser.

const LEVELS = ['bg-zinc-200/80 dark:bg-white/[0.06]', 'bg-emerald-200 dark:bg-emerald-900', 'bg-emerald-400 dark:bg-emerald-700', 'bg-emerald-600 dark:bg-emerald-500', 'bg-emerald-800 dark:bg-emerald-300'];
const level = (kg: number) => (kg <= 0 ? 0 : kg < 2 ? 1 : kg < 5 ? 2 : kg < 10 ? 3 : 4);
const EQ_ICON = { trees: TreePine, car: Car, phone: Smartphone, days: Globe2 } as const;

export function GreenYear({ year, totals }: { year: Record<string, number>; totals: { kg: number; actions: number; kgByKind: Partial<Record<GreenKind, number>> } }) {
  const now = useNow();
  const today = now ? new Date(now).toISOString().slice(0, 10) : null;
  const weeks = useMemo(() => (today ? yearGrid(year, today) : []), [year, today]);
  const days = Object.keys(year).filter((d) => year[d] > 0);
  const longest = longestStreak(days);
  const months = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [d, kg] of Object.entries(year)) m[d.slice(0, 7)] = (m[d.slice(0, 7)] ?? 0) + kg;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [year]);
  const best = months[0], yearKg = Math.round(Object.values(year).reduce((s, v) => s + v, 0) * 10) / 10;
  const top = GREEN_KINDS.filter((k) => totals.kgByKind[k]).sort((a, b) => (totals.kgByKind[b] ?? 0) - (totals.kgByKind[a] ?? 0))[0];
  const eq = equivalents(totals.kg);
  const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const card = () => {
    const c = document.createElement('canvas'), W = 1080, H = 1350;
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!g) return;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f3b2e'); bg.addColorStop(0.6, '#0b2620'); bg.addColorStop(1, '#111113');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const font = (w: number, px: number) => `${w} ${px}px Inter, system-ui, sans-serif`;
    g.fillStyle = '#86d9b8'; g.font = font(600, 36); g.fillText('My green year with UniVerse', 80, 130);
    g.fillStyle = '#ffffff'; g.font = font(700, 150); g.fillText(`${Math.round(yearKg)} kg`, 80, 320);
    g.fillStyle = '#cbd5d1'; g.font = font(500, 40); g.fillText('of CO₂ saved', 84, 380);
    const stat = (label: string, value: string, x: number, y: number) => { g.fillStyle = '#ffffff'; g.font = font(700, 64); g.fillText(value, x, y); g.fillStyle = '#9fb3ab'; g.font = font(500, 30); g.fillText(label, x, y + 46); };
    stat('days I acted', String(days.length), 80, 520); stat('days in a row, at best', String(longest), 560, 520);
    stat('my top action', top ? GREEN_FACTORS[top].label.split(' ')[0] : '–', 80, 690); stat('best month', best ? new Date(`${best[0]}-15T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }) : '–', 560, 690);
    // The year's days, small.
    const cell = 15, gap = 3, x0 = 80, y0 = 840;
    weeks.forEach((w, i) => w.forEach((d, j) => { g.fillStyle = ['#1d3b33', '#2f6f58', '#3f9b77', '#5cc29d', '#a7e8cf'][level(d.kg)]; g.fillRect(x0 + i * (cell + gap), y0 + j * (cell + gap), cell, cell); }));
    g.fillStyle = '#cbd5d1'; g.font = font(500, 34);
    g.fillText(`As much as ${eq[0].value} trees take up in a year,`, 80, 1060);
    g.fillText(`or ${eq[1].value.toLocaleString()} km not driven.`, 80, 1110);
    g.fillStyle = '#86d9b8'; g.font = font(600, 30); g.fillText('universe · Green', 80, 1260);
    c.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'my-green-year.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }, 'image/png');
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="panel p-5" aria-labelledby="year-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="year-h" className="flex items-center gap-2 font-bold text-zinc-900 dark:text-white"><CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />Your year</h2>
          <button type="button" onClick={card} disabled={!weeks.length} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Download className="h-4 w-4" aria-hidden />Save your year as a picture</button>
        </div>
        <div className="mt-4 overflow-x-auto pb-1" tabIndex={0} role="region" aria-label="The last year, day by day">
          <div className="flex gap-[3px]" role="img" aria-label={`${days.length} days with actions in the last year`}>
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {w.map((d) => <span key={d.day} title={`${new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${d.kg} kg`} className={`h-3 w-3 rounded-[3px] ${LEVELS[level(d.kg)]}`} />)}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end gap-1 text-xs text-zinc-500 dark:text-zinc-400" aria-hidden>Less {LEVELS.map((l) => <span key={l} className={`h-3 w-3 rounded-[3px] ${l}`} />)} More</div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm" data-no-motion>
          <div><dt className="text-zinc-500 dark:text-zinc-400">Days you acted</dt><dd className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">{days.length}</dd></div>
          <div><dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400"><Flame className="h-3.5 w-3.5 text-amber-500" aria-hidden />Longest run</dt><dd className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">{longest} {longest === 1 ? 'day' : 'days'}</dd></div>
          <div><dt className="text-zinc-500 dark:text-zinc-400">Best month</dt><dd className="text-xl font-semibold text-zinc-900 dark:text-white">{best ? monthName(best[0]) : '–'}</dd></div>
        </dl>
      </section>
      <section className="panel p-5" aria-labelledby="means-h" data-no-motion>
        <h2 id="means-h" className="font-bold text-zinc-900 dark:text-white">What your {Math.round(totals.kg * 10) / 10} kg means</h2>
        <ul className="mt-3 space-y-3">
          {eq.map((e) => { const I = EQ_ICON[e.id as keyof typeof EQ_ICON]; return (
            <li key={e.id} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" aria-hidden><I className="h-5 w-5" /></span>
              <span className="text-sm text-zinc-700 dark:text-zinc-200"><span className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">{e.value.toLocaleString()}</span> {e.label}</span>
            </li>
          ); })}
        </ul>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">A young tree takes up about 22 kg of CO₂ a year; a petrol car gives off about 0.17 kg a km; a phone charge about 8 g (US EPA).</p>
      </section>
    </div>
  );
}
