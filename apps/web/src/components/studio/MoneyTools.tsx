'use client';

import { useMemo, useState } from 'react';
import { m as motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { age, growth, loan, settle } from '@/lib/more-tools';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Ring } from '@/components/instruments/parts';
import { Btn, Field } from './QuickTools';
import { today, uid, useKept } from './kept';
import { MONEY, nf, Segments, Stat } from './bits';

// Collaborate → Create → Sheets and data, fourth set (M74): loans, savings, prices with discount and
// tax, exact age, BMI and splitting a bill. All worked out on this device.

export type MoneyId = 'loan' | 'savings' | 'price' | 'age' | 'bmi' | 'split';

export function MoneyTool({ id }: { id: MoneyId }) {
  const T = { loan: Loan, savings: Savings, price: Price, age: Age, bmi: Bmi, split: Split }[id];
  return <T />;
}

const Cur = ({ v, on }: { v: string; on: (s: string) => void }) => <Field label="Money sign"><select className="input w-auto!" value={v} onChange={(e) => on(e.target.value)}>{MONEY.map((c) => <option key={c}>{c}</option>)}</select></Field>;
const num = (s: string) => Math.max(0, Number(String(s).replace(/,/g, '')) || 0);

/** Loan and EMI: the monthly payment, the interest in all, and the schedule by year. */
function Loan() {
  const [v, setV] = useKept('uv-loan', { amount: '500000', rate: '9.5', years: '5', cur: '₹' });
  const months = Math.max(1, Math.round(num(v.years) * 12));
  const l = useMemo(() => loan(num(v.amount), num(v.rate), months), [v.amount, v.rate, months]);
  const m = (n: number) => `${v.cur}${nf(n, 0)}`;
  const years = Array.from({ length: Math.ceil(months / 12) }, (_, y) => { const rows = l.rows.slice(y * 12, y * 12 + 12); return { y: y + 1, interest: rows.reduce((a, r) => a + r.interest, 0), principal: rows.reduce((a, r) => a + r.principal, 0), left: rows[rows.length - 1]?.left ?? 0 }; });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Loan amount"><input className="input w-40 font-mono" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
        <Field label="Interest a year (%)"><input className="input w-28 font-mono" inputMode="decimal" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} /></Field>
        <Field label="Years"><input className="input w-24 font-mono" inputMode="decimal" value={v.years} onChange={(e) => setV({ ...v, years: e.target.value })} /></Field>
        <Cur v={v.cur} on={(cur) => setV({ ...v, cur })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-center">
        <dl className="grid grid-cols-3 gap-2 text-sm"><Stat big k="Each month" v={m(l.emi)} /><Stat big k="Interest in all" v={m(l.interest)} /><Stat big k="Paid in all" v={m(l.total)} /></dl>
        <div className="justify-self-center text-indigo-700 dark:text-aqua-300"><Ring pct={l.total ? (l.interest / l.total) * 100 : 0} label="interest" size={96} /></div>
      </div>
      <div className="relative overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-start text-xs text-zinc-600 dark:text-zinc-300"><th className="py-1 text-start">Year</th><th className="text-end">Interest</th><th className="text-end">Paid off</th><th className="text-end">Still owed</th></tr></thead>
        <tbody>{years.map((y) => <tr key={y.y} className="border-t border-zinc-200 dark:border-white/10 font-mono tabular-nums text-zinc-900 dark:text-white"><td className="py-1.5 font-sans">{y.y}</td><td className="text-end">{m(y.interest)}</td><td className="text-end">{m(y.principal)}</td><td className="text-end">{m(y.left)}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

/** Savings growth: a starting amount and a deposit each month, with interest; see it grow. */
function Savings() {
  const [v, setV] = useKept('uv-savings', { start: '10000', monthly: '2000', rate: '7', years: '10', cur: '₹' });
  const rows = useMemo(() => growth(num(v.start), num(v.monthly), num(v.rate), Math.max(1, Math.min(60, Math.round(num(v.years))))), [v.start, v.monthly, v.rate, v.years]);
  const last = rows[rows.length - 1] ?? { balance: 0, deposited: 0 }, top = Math.max(1, last.balance), m = (n: number) => `${v.cur}${nf(n, 0)}`;
  const W = 600, H = 220, X = (i: number) => (rows.length > 1 ? (i / (rows.length - 1)) * (W - 20) + 10 : W / 2), Y = (n: number) => H - 20 - (n / top) * (H - 40);
  const line = (k: 'balance' | 'deposited') => rows.map((r, i) => `${i ? 'L' : 'M'}${X(i)},${Y(r[k])}`).join(' ');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Start with"><input className="input w-32 font-mono" inputMode="decimal" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} /></Field>
        <Field label="Add each month"><input className="input w-32 font-mono" inputMode="decimal" value={v.monthly} onChange={(e) => setV({ ...v, monthly: e.target.value })} /></Field>
        <Field label="Interest a year (%)"><input className="input w-24 font-mono" inputMode="decimal" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} /></Field>
        <Field label="Years"><input className="input w-20 font-mono" inputMode="numeric" value={v.years} onChange={(e) => setV({ ...v, years: e.target.value })} /></Field>
        <Cur v={v.cur} on={(cur) => setV({ ...v, cur })} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm"><Stat big k="You’ll have" v={m(last.balance)} /><Stat big k="You put in" v={m(last.deposited)} /><Stat big k="Interest earned" v={m(last.balance - last.deposited)} /></dl>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-white ring-1 ring-black/10" role="img" aria-label={`Savings grow to ${m(last.balance)} in ${rows.length} years`}>
        <motion.path initial={false} animate={{ d: `${line('balance')} L${X(rows.length - 1)},${H - 20} L${X(0)},${H - 20} Z` }} transition={spring.smooth} fill="#ec74ce33" />
        <motion.path initial={false} animate={{ d: line('balance') }} transition={spring.smooth} fill="none" stroke="#ec4899" strokeWidth={3} />
        <motion.path initial={false} animate={{ d: line('deposited') }} transition={spring.smooth} fill="none" stroke="#533ff6" strokeWidth={2} strokeDasharray="6 5" />
        <text x={14} y={20} fontSize={12} fill="#be185d" fontWeight={700}>With interest</text><text x={130} y={20} fontSize={12} fill="#533ff6" fontWeight={700}>What you put in</text>
      </svg>
    </div>
  );
}

/** Price after discount and tax, or the price before tax from a total. */
function Price() {
  const [p, setP] = useState('1200'), [d, setD] = useState('20'), [t, setT] = useState('18'), [q, setQ] = useState('1'), [incl, setIncl] = useState(false), [cur, setCur] = useState('₹');
  const base = num(p) * Math.max(1, num(q)), off = (base * num(d)) / 100, after = base - off;
  const tax = incl ? after - after / (1 + num(t) / 100) : (after * num(t)) / 100, total = incl ? after : after + tax;
  const m = (n: number) => `${cur}${nf(n, 2)}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Price"><input className="input w-32 font-mono" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} /></Field>
        <Field label="How many"><input className="input w-20 font-mono" inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Discount %"><input className="input w-24 font-mono" inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Tax % (GST, VAT)"><input className="input w-24 font-mono" inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} /></Field>
        <Cur v={cur} on={setCur} />
      </div>
      <Segments label="Is tax in the price?" value={incl ? 'in' : 'out'} onChange={(x) => setIncl(x === 'in')} options={[['out', 'Tax added on top'], ['in', 'Price includes tax']] as const} />
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"><Stat k="Before discount" v={m(base)} /><Stat k="You save" v={m(off)} /><Stat k={incl ? 'Tax inside' : 'Tax added'} v={m(tax)} /><Stat big k="To pay" v={m(total)} /></dl>
    </div>
  );
}

/** Exact age, and how long to the next birthday. */
function Age() {
  const [b, setB] = useKept('uv-age-birth', '2008-06-15'), [on, setOn] = useState(() => today());
  const a = age(b, on);
  const born = new Date(`${b}T12:00:00Z`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Born on"><input type="date" className="input" value={b} onChange={(e) => setB(e.target.value)} /></Field>
        <Field label="Age on"><input type="date" className="input" value={on} onChange={(e) => setOn(e.target.value)} /></Field>
      </div>
      {a ? (
        <>
          <p className="text-3xl font-bold text-zinc-900 dark:text-white" role="status"><span className="font-mono">{a.years}</span> years, <span className="font-mono">{a.months}</span> months, <span className="font-mono">{a.days}</span> days</p>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"><Stat k="Days alive" v={a.totalDays.toLocaleString()} /><Stat k="Weeks" v={Math.floor(a.totalDays / 7).toLocaleString()} /><Stat k="Born on a" v={born.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' })} /><Stat k="Next birthday in" v={a.toBirthday ? `${a.toBirthday} days` : 'Today!'} /></dl>
        </>
      ) : <p className="text-sm text-zinc-600 dark:text-zinc-300">The birth date should be before the other date.</p>}
    </div>
  );
}

const BANDS = [{ to: 18.5, l: 'Below the healthy range', c: '#38bdf8' }, { to: 25, l: 'In the healthy range', c: '#22c55e' }, { to: 30, l: 'Above the healthy range', c: '#f59e0b' }, { to: 99, l: 'Well above the healthy range', c: '#ef4444' }];
/** BMI: weight for height (a rough guide for adults, not a diagnosis). */
function Bmi() {
  const [metric, setMetric] = useKept('uv-bmi-metric', true), [cm, setCm] = useState('165'), [kg, setKg] = useState('58'), [ft, setFt] = useState('5'), [inch, setInch] = useState('5'), [lb, setLb] = useState('128');
  const h = metric ? num(cm) / 100 : (num(ft) * 12 + num(inch)) * 0.0254, w = metric ? num(kg) : num(lb) * 0.45359237;
  const bmi = h > 0.5 && w > 0 ? w / (h * h) : 0, band = BANDS.find((x) => bmi < x.to) ?? BANDS[3];
  const pos = Math.max(0, Math.min(100, ((bmi - 12) / (40 - 12)) * 100));
  return (
    <div className="space-y-4">
      <Segments label="Units" value={metric ? 'm' : 'i'} onChange={(x) => setMetric(x === 'm')} options={[['m', 'cm and kg'], ['i', 'feet and pounds']] as const} />
      <div className="flex flex-wrap items-end gap-2">
        {metric ? (<><Field label="Height (cm)"><input className="input w-28 font-mono" inputMode="decimal" value={cm} onChange={(e) => setCm(e.target.value)} /></Field><Field label="Weight (kg)"><input className="input w-28 font-mono" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} /></Field></>)
          : (<><Field label="Feet"><input className="input w-20 font-mono" inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value)} /></Field><Field label="Inches"><input className="input w-20 font-mono" inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value)} /></Field><Field label="Pounds"><input className="input w-28 font-mono" inputMode="decimal" value={lb} onChange={(e) => setLb(e.target.value)} /></Field></>)}
      </div>
      {bmi > 0 && (
        <>
          <p className="text-3xl font-bold text-zinc-900 dark:text-white" role="status"><span className="font-mono">{nf(bmi, 1)}</span> <span className="text-lg font-semibold">· {band.l}</span></p>
          <div className="relative h-4 rounded-full overflow-hidden flex" aria-hidden>{[[12, 18.5, '#38bdf8'], [18.5, 25, '#22c55e'], [25, 30, '#f59e0b'], [30, 40, '#ef4444']].map(([a, b, c]) => <span key={String(c)} style={{ width: `${(((b as number) - (a as number)) / 28) * 100}%`, background: c as string }} />)}
            <motion.span className="absolute top-0 w-1.5 h-full bg-zinc-900 dark:bg-white rounded" initial={false} animate={{ left: `calc(${pos}% - 3px)` }} transition={spring.smooth} />
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">BMI is a rough guide for adults. It doesn’t see muscle, age or build, and it isn’t made for children: ask a doctor or nurse about your health.</p>
        </>
      )}
    </div>
  );
}

/** Split a bill: who paid what, everyone’s share, and the fewest payments to settle up. */
function Split() {
  const [v, setV] = useKept('uv-split', () => ({ cur: '₹', tip: '0', people: [{ id: uid(), name: 'Aisha', paid: '1200' }, { id: uid(), name: 'Ben', paid: '0' }, { id: uid(), name: 'Chen', paid: '300' }] }));
  const tip = num(v.tip) / 100, people = v.people.map((p) => ({ name: p.name || '?', amount: num(p.paid) * (1 + tip) }));
  const s = settle(people), m = (n: number) => `${v.cur}${nf(n, 2)}`;
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {v.people.map((p) => (
          <li key={p.id} className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
            <input className="input" aria-label="Name" value={p.name} onChange={(e) => setV({ ...v, people: v.people.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) })} />
            <input className="input font-mono" inputMode="decimal" aria-label={`${p.name} paid`} value={p.paid} onChange={(e) => setV({ ...v, people: v.people.map((x) => (x.id === p.id ? { ...x, paid: e.target.value } : x)) })} />
            <button type="button" onClick={() => setV({ ...v, people: v.people.filter((x) => x.id !== p.id) })} aria-label={`Remove ${p.name}`} disabled={v.people.length < 3} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <Btn onClick={() => setV({ ...v, people: [...v.people, { id: uid(), name: '', paid: '0' }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add a person</Btn>
        <Field label="Tip %"><input className="input w-20 font-mono" inputMode="decimal" value={v.tip} onChange={(e) => setV({ ...v, tip: e.target.value })} /></Field>
        <Cur v={v.cur} on={(cur) => setV({ ...v, cur })} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm"><Stat big k="Total" v={m(s.total)} /><Stat big k="Each person’s share" v={m(s.share)} /></dl>
      <ul className="space-y-1.5" aria-label="Payments to settle up">
        {s.moves.length ? s.moves.map((x, k) => (
          <motion.li key={`${x.from}-${x.to}-${k}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.smooth, delay: k * 0.04 }} className={cn('flex items-center gap-2 rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2 text-zinc-900 dark:text-white')}>
            <b translate="no">{x.from}</b> pays <b translate="no">{x.to}</b> <span className="ms-auto font-mono tabular-nums font-bold">{m(x.amount)}</span>
          </motion.li>
        )) : <li className="text-sm text-zinc-600 dark:text-zinc-300">Everyone is even.</li>}
      </ul>
    </div>
  );
}
