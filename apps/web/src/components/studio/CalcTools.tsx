'use client';

import { useMemo, useState } from 'react';
import { m as motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { numbers } from '@/lib/big-tools';
import { regression, sampleSize, shiftHours } from '@/lib/tools-5';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Btn, Field, area } from './QuickTools';
import { uid, useKept } from './kept';
import { MONEY, nf, Segments, Stat } from './bits';

// Collaborate → Create → Sheets and data, fifth set (M75): a line of best fit, survey sample sizes,
// fuel cost, pay, a recipe scaler, a timesheet and the best-value pack. All on the device.

export type CalcId = 'regression' | 'samplesize' | 'fuel' | 'pay' | 'recipe' | 'timesheet' | 'unitprice';

export function CalcTool({ id }: { id: CalcId }) {
  const T = { regression: Regression, samplesize: SampleSize, fuel: Fuel, pay: Pay, recipe: Recipe, timesheet: Timesheet, unitprice: UnitPrice }[id];
  return <T />;
}
const Cur = ({ v, on }: { v: string; on: (s: string) => void }) => <Field label="Money sign"><select className="input w-auto!" value={v} onChange={(e) => on(e.target.value)}>{MONEY.map((c) => <option key={c}>{c}</option>)}</select></Field>;
const n0 = (s: string | number) => Math.max(0, Number(String(s).replace(/,/g, '')) || 0);

/** Line of best fit: x and y pairs on a scatter chart, the straight line through them, and a prediction. */
function Regression() {
  const [t, setT] = useKept('uv-regression', 'Hours studied, Score\n1 52\n2 58\n3 65\n4 70\n5 74\n6 83');
  const [x0, setX0] = useState('7');
  const lines = t.split('\n'), head = /[a-z]/i.test(lines[0] ?? '') ? lines[0].split(/[,\t]/).map((s) => s.trim()) : ['x', 'y'];
  const pts = useMemo(() => t.split('\n').map((l) => numbers(l)).filter((n) => n.length >= 2).map((n) => [n[0], n[1]] as [number, number]), [t]);
  const r = regression(pts), W = 480, H = 280;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), xl = Math.min(...xs, 0), xh = Math.max(...xs, 1), yl = Math.min(...ys, 0), yh = Math.max(...ys, 1);
  const X = (v: number) => 40 + ((v - xl) / (xh - xl || 1)) * (W - 60), Y = (v: number) => H - 30 - ((v - yl) / (yh - yl || 1)) * (H - 50);
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Field label="x and y, one pair a line"><textarea className={cn(area, 'min-h-[220px]')} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <div className="space-y-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-white ring-1 ring-black/10" role="img" aria-label={r ? `Best-fit line y = ${nf(r.slope, 3)}x + ${nf(r.intercept, 3)}` : 'Scatter chart'} fontFamily="system-ui">
          <line x1={40} x2={W - 20} y1={H - 30} y2={H - 30} stroke="#9aa0b4" /><line x1={40} x2={40} y1={20} y2={H - 30} stroke="#9aa0b4" />
          <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="#4b5068">{head[0]}</text><text x={12} y={H / 2} fontSize={12} fill="#4b5068" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">{head[1]}</text>
          {r && <motion.line initial={false} animate={{ x1: X(xl), y1: Y(r.slope * xl + r.intercept), x2: X(xh), y2: Y(r.slope * xh + r.intercept) }} transition={spring.smooth} stroke="#ec4899" strokeWidth={3} />}
          {pts.map((p, i) => <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={5} fill="#533ff6" />)}
        </svg>
        {r ? (
          <>
            <dl className="grid grid-cols-3 gap-2 text-sm"><Stat k="Line" v={`y = ${nf(r.slope, 3)}x ${r.intercept < 0 ? '−' : '+'} ${nf(Math.abs(r.intercept), 3)}`} /><Stat k="r (correlation)" v={nf(r.r, 3)} /><Stat k="r² (fit)" v={`${nf(r.r2 * 100, 1)}%`} /></dl>
            <div className="flex flex-wrap items-end gap-2"><Field label={`Predict ${head[1]} when ${head[0]} is`}><input className="input w-28 font-mono" inputMode="decimal" value={x0} onChange={(e) => setX0(e.target.value)} /></Field><p className="pb-2 font-mono text-lg font-bold text-zinc-900 dark:text-white" role="status">≈ {nf(r.slope * Number(x0) + r.intercept, 2)}</p></div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">r near 1 or −1 means a strong straight-line link; near 0, none. A link isn’t proof that one causes the other.</p>
          </>
        ) : <p className="text-sm text-zinc-600 dark:text-zinc-300">Add at least two points with different x.</p>}
      </div>
    </div>
  );
}

/** Survey sample size: how many people to ask for a result you can trust. */
function SampleSize() {
  const [c, setC] = useState<90 | 95 | 99>(95), [m, setM] = useState(5), [pop, setPop] = useState('1200');
  const n = sampleSize(c, m, n0(pop));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Segments label="How sure" value={String(c) as '90' | '95' | '99'} onChange={(v) => setC(+v as 90 | 95 | 99)} options={[['90', '90% sure'], ['95', '95% sure'], ['99', '99% sure']] as const} />
        <Field label={`Margin of error: ±${m}%`}><input type="range" min={1} max={15} value={m} onChange={(e) => setM(+e.target.value)} className="accent-pink-500" /></Field>
        <Field label="People in the group (blank = very many)"><input className="input w-36 font-mono" inputMode="numeric" value={pop} onChange={(e) => setPop(e.target.value)} /></Field>
      </div>
      <p className="text-4xl font-bold text-zinc-900 dark:text-white" role="status"><span className="font-mono">{n.toLocaleString()}</span> <span className="text-lg font-semibold">people to ask</span></p>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">If {n.toLocaleString()} people answer, you can be {c}% sure the real answer is within {m} points of yours. Ask more if many won’t reply.</p>
    </div>
  );
}

/** Fuel cost: distance, how far a litre goes, the price; per person too. */
function Fuel() {
  const [v, setV] = useKept('uv-fuel', { km: '240', eff: '15', price: '105', people: '4', back: true, cur: '₹' });
  const dist = n0(v.km) * (v.back ? 2 : 1), litres = n0(v.eff) ? dist / n0(v.eff) : 0, cost = litres * n0(v.price);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Distance (km)"><input className="input w-28 font-mono" inputMode="decimal" value={v.km} onChange={(e) => setV({ ...v, km: e.target.value })} /></Field>
        <Field label="Km per litre"><input className="input w-24 font-mono" inputMode="decimal" value={v.eff} onChange={(e) => setV({ ...v, eff: e.target.value })} /></Field>
        <Field label="Price a litre"><input className="input w-24 font-mono" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /></Field>
        <Field label="People sharing"><input className="input w-20 font-mono" inputMode="numeric" value={v.people} onChange={(e) => setV({ ...v, people: e.target.value })} /></Field>
        <Btn on={v.back} onClick={() => setV({ ...v, back: !v.back })}>There and back</Btn>
        <Cur v={v.cur} on={(cur) => setV({ ...v, cur })} />
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"><Stat big k="Distance" v={`${nf(dist, 0)} km`} /><Stat big k="Fuel" v={`${nf(litres, 1)} L`} /><Stat big k="Cost" v={`${v.cur}${nf(cost, 0)}`} /><Stat big k="Each person" v={`${v.cur}${nf(cost / Math.max(1, n0(v.people)), 0)}`} /></dl>
    </div>
  );
}

/** Pay: an hourly rate into a week, month and year (or back), with overtime. */
function Pay() {
  const [v, setV] = useKept('uv-pay', { rate: '250', hours: '40', ot: '0', otx: '1.5', weeks: '52', cur: '₹' });
  const week = n0(v.rate) * n0(v.hours) + n0(v.rate) * n0(v.otx) * n0(v.ot), year = week * n0(v.weeks);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Pay an hour"><input className="input w-28 font-mono" inputMode="decimal" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} /></Field>
        <Field label="Hours a week"><input className="input w-24 font-mono" inputMode="decimal" value={v.hours} onChange={(e) => setV({ ...v, hours: e.target.value })} /></Field>
        <Field label="Overtime hours"><input className="input w-24 font-mono" inputMode="decimal" value={v.ot} onChange={(e) => setV({ ...v, ot: e.target.value })} /></Field>
        <Field label="Overtime ×"><input className="input w-20 font-mono" inputMode="decimal" value={v.otx} onChange={(e) => setV({ ...v, otx: e.target.value })} /></Field>
        <Field label="Weeks worked a year"><input className="input w-24 font-mono" inputMode="numeric" value={v.weeks} onChange={(e) => setV({ ...v, weeks: e.target.value })} /></Field>
        <Cur v={v.cur} on={(cur) => setV({ ...v, cur })} />
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"><Stat big k="A day (5-day week)" v={`${v.cur}${nf(week / 5, 0)}`} /><Stat big k="A week" v={`${v.cur}${nf(week, 0)}`} /><Stat big k="A month" v={`${v.cur}${nf(year / 12, 0)}`} /><Stat big k="A year" v={`${v.cur}${nf(year, 0)}`} /></dl>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Before tax and deductions.</p>
    </div>
  );
}

const QTY = /^\s*(\d+(?:[.,]\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s*(.*)$/;
/** Recipe scaler: change the number of servings; every amount changes with it. */
function Recipe() {
  const [r, setR] = useKept('uv-recipe', () => ({ from: 4, to: 6, text: '2 cups flour\n1 1/2 tsp baking powder\n3 eggs\n200 g butter\n1/2 cup milk\nA pinch of salt' }));
  const scale = r.to / (r.from || 1);
  const val = (q: string) => { const t = q.replace(',', '.'); const m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t) ?? /^()(\d+)\/(\d+)$/.exec(t); return m ? (+m[1] || 0) + +m[2] / +m[3] : +t; };
  const pretty = (x: number) => { const w = Math.floor(x), f = x - w, F = [[0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.67, '⅔'], [0.75, '¾']] as const, near = F.find(([v]) => Math.abs(f - v) < 0.04); return near ? `${w || ''}${near[1]}` : nf(x, 2); };
  const out = r.text.split('\n').map((l) => { const m = QTY.exec(l); return m ? `${pretty(val(m[1]) * scale)} ${m[2]}` : l; });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="flex gap-2"><Field label="Recipe serves"><input type="number" min={1} className="input w-24" value={r.from} onChange={(e) => setR({ ...r, from: Math.max(1, +e.target.value || 1) })} /></Field><Field label="I need"><input type="number" min={1} className="input w-24" value={r.to} onChange={(e) => setR({ ...r, to: Math.max(1, +e.target.value || 1) })} /></Field></div>
        <Field label="Ingredients, one a line, amount first"><textarea className={cn(area, 'min-h-[220px] font-sans')} value={r.text} onChange={(e) => setR({ ...r, text: e.target.value })} /></Field>
      </div>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-black/10 text-zinc-900">
        <p className="text-sm text-[#4b5068]">For {r.to} {r.to === 1 ? 'person' : 'people'} (×{nf(scale, 2)})</p>
        <ul className="mt-2 space-y-1.5">{out.map((l, i) => <li key={i} className="text-lg">{l}</li>)}</ul>
      </div>
    </div>
  );
}

interface Shift { id: string; day: string; start: string; end: string; brk: number }
/** Timesheet: shifts with start, end and breaks; the hours and the pay. */
function Timesheet() {
  const [t, setT] = useKept('uv-timesheet', () => ({ rate: '200', cur: '₹', shifts: [{ id: uid(), day: 'Mon', start: '09:00', end: '17:30', brk: 30 }, { id: uid(), day: 'Tue', start: '09:00', end: '13:00', brk: 0 }] as Shift[] }));
  const put = (id: string, p: Partial<Shift>) => setT({ ...t, shifts: t.shifts.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const hours = t.shifts.map((s) => shiftHours(s.start, s.end, s.brk) ?? 0), total = hours.reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-3">
      <ul className="space-y-2">{t.shifts.map((s, i) => (
        <li key={s.id} className="grid grid-cols-[70px_1fr_1fr_80px_60px_auto] gap-2 items-center">
          <input className="input py-1.5" aria-label="Day" value={s.day} onChange={(e) => put(s.id, { day: e.target.value })} />
          <input type="time" className="input py-1.5" aria-label="Start" value={s.start} onChange={(e) => put(s.id, { start: e.target.value })} />
          <input type="time" className="input py-1.5" aria-label="End" value={s.end} onChange={(e) => put(s.id, { end: e.target.value })} />
          <input className="input py-1.5 font-mono" inputMode="numeric" aria-label="Break minutes" value={s.brk} onChange={(e) => put(s.id, { brk: Math.max(0, +e.target.value || 0) })} />
          <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{nf(hours[i], 2)} h</span>
          <button type="button" onClick={() => setT({ ...t, shifts: t.shifts.filter((x) => x.id !== s.id) })} aria-label={`Remove ${s.day}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </li>
      ))}</ul>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Day · start · end · break (minutes). Shifts past midnight are fine.</p>
      <div className="flex flex-wrap items-end gap-2"><Btn onClick={() => setT({ ...t, shifts: [...t.shifts, { id: uid(), day: '', start: '09:00', end: '17:00', brk: 30 }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add a shift</Btn><Field label="Pay an hour"><input className="input w-24 font-mono" inputMode="decimal" value={t.rate} onChange={(e) => setT({ ...t, rate: e.target.value })} /></Field><Cur v={t.cur} on={(cur) => setT({ ...t, cur })} /></div>
      <dl className="grid grid-cols-3 gap-2 text-sm"><Stat big k="Hours" v={nf(total, 2)} /><Stat big k="Shifts" v={t.shifts.length} /><Stat big k="Pay" v={`${t.cur}${nf(total * n0(t.rate), 0)}`} /></dl>
    </div>
  );
}

/** Best value: which pack costs least per gram, litre or piece. */
function UnitPrice() {
  const [list, setList] = useKept('uv-unitprice', () => [{ id: uid(), name: 'Small pack', price: '45', size: '200' }, { id: uid(), name: 'Big pack', price: '160', size: '1000' }, { id: uid(), name: 'Family pack', price: '290', size: '2000' }]);
  const [unit, setUnit] = useState<'g' | 'ml' | 'piece'>('g');
  const per = list.map((x) => (n0(x.size) ? n0(x.price) / n0(x.size) : Infinity)), best = Math.min(...per), step = unit === 'piece' ? 1 : 100;
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><Segments label="Unit" value={unit} onChange={setUnit} options={[['g', 'grams'], ['ml', 'ml'], ['piece', 'pieces']] as const} /></div>
      <ul className="space-y-2">{list.map((x, i) => (
        <motion.li key={x.id} layout transition={spring.smooth} className={cn('grid grid-cols-[1fr_90px_90px_auto_auto] gap-2 items-center rounded-xl p-2 ring-1', per[i] === best && Number.isFinite(best) ? 'ring-emerald-500 bg-emerald-500/10' : 'ring-zinc-200 dark:ring-white/10')}>
          <input className="input py-1.5" aria-label="Name" value={x.name} onChange={(e) => setList(list.map((y) => (y.id === x.id ? { ...y, name: e.target.value } : y)))} />
          <input className="input py-1.5 font-mono" inputMode="decimal" aria-label={`Price of ${x.name}`} value={x.price} onChange={(e) => setList(list.map((y) => (y.id === x.id ? { ...y, price: e.target.value } : y)))} />
          <input className="input py-1.5 font-mono" inputMode="decimal" aria-label={`Size of ${x.name} (${unit})`} value={x.size} onChange={(e) => setList(list.map((y) => (y.id === x.id ? { ...y, size: e.target.value } : y)))} />
          <span className="w-28 text-end font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{Number.isFinite(per[i]) ? `${nf(per[i] * step, 2)} / ${step === 1 ? '' : step}${unit}` : '—'}{per[i] === best && Number.isFinite(best) ? ' ★' : ''}</span>
          <button type="button" onClick={() => setList(list.filter((y) => y.id !== x.id))} aria-label={`Remove ${x.name}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </motion.li>
      ))}</ul>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Name · price · size. ★ is the best value.</p>
      <Btn onClick={() => setList([...list, { id: uid(), name: `Option ${list.length + 1}`, price: '', size: '' }])}><Plus className="w-3.5 h-3.5" aria-hidden />Add a pack</Btn>
    </div>
  );
}
