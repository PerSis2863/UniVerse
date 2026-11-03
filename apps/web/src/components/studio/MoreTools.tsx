'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Copy, Download, Maximize2, Mic, Pause, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import { addDays, calc, cite, contrast, convertUnit, daysBetween, findReplace, groups, hexRgb, jwtParts, password, readability, rgbHsl, toMillis, UNITS, urlParts } from '@/lib/quick-tools-2';
import { markdownToHtml } from '@/lib/convert-formats';
import { cn } from '@/lib/utils';
import { Btn, Field, Out, area, copy, save } from './QuickTools';
import { useKept } from './kept';

// Collaborate → Create's second set of tools (M71, the owner: "add at least 25 more features"): writing
// (Word), sheets and numbers, presenting, colour and code helpers. All in the browser: nothing is sent
// anywhere. Logic in src/lib/quick-tools-2.ts (tested).

export type MoreId = 'replace' | 'read' | 'cite' | 'speak' | 'dictate' | 'symbols' | 'calc' | 'units' | 'percent' | 'picker' | 'chart' | 'dates' | 'present' | 'timer' | 'contrast' | 'colour' | 'hash' | 'uuid' | 'password' | 'time' | 'url' | 'jwt';

export function MoreTool({ id }: { id: MoreId }) {
  const T = { replace: Replace, read: Readability, cite: Cite, speak: Speak, dictate: Dictate, symbols: Symbols, calc: Calc, units: Units, percent: Percent, picker: Picker, chart: Chart, dates: Dates, present: Present, timer: Timer, contrast: Contrast, colour: ColourConvert, hash: Hash, uuid: Uuid, password: Password, time: Time, url: Url, jwt: Jwt }[id];
  return <T />;
}

const Stat = ({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) => (
  <div className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2"><dt className="text-[11px] text-zinc-600 dark:text-zinc-300">{k}</dt><dd className={cn('font-mono tabular-nums text-zinc-900 dark:text-white', tone)}>{v}</dd></div>
);
const nf = (n: number, d = 4) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');

/** Find and replace (like Word's Ctrl+H). */
function Replace() {
  const [t, setT] = useKept('uv-draft-replace', ''), [f, setF] = useState(''), [r, setR] = useState(''), [cs, setCs] = useState(false), [w, setW] = useState(false);
  const found = useMemo(() => findReplace(t, f, r, { caseSensitive: cs, words: w }).count, [t, f, r, cs, w]);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2"><Field label="Find"><input className="input" value={f} onChange={(e) => setF(e.target.value)} /></Field><Field label="Replace with"><input className="input" value={r} onChange={(e) => setR(e.target.value)} /></Field></div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} className="accent-pink-500" />Match case</label>
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={w} onChange={(e) => setW(e.target.checked)} className="accent-pink-500" />Whole words</label>
        <span role="status">{f ? `${found} found` : ''}</span>
        <Btn onClick={() => { const x = findReplace(t, f, r, { caseSensitive: cs, words: w }); setT(x.text); toast.success(`${x.count} replaced`); }}>Replace all</Btn>
      </div>
      <Field label="Text"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <Out text={t} name="text.txt" />
    </div>
  );
}

/** How easy a text is to read (Flesch), like Word's readability statistics. */
function Readability() {
  const [t, setT] = useKept('uv-draft-read', '');
  const r = useMemo(() => readability(t), [t]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      <Field label="Your text (English)"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <dl className="grid grid-cols-2 gap-2 content-start text-sm">
        <Stat k="Reading ease" v={r ? r.ease : '—'} /><Stat k="That is" v={r?.label ?? '—'} />
        <Stat k="School grade" v={r ? r.grade : '—'} /><Stat k="Words a sentence" v={r ? r.wordsPerSentence : '—'} />
      </dl>
      <p className="lg:col-span-2 text-xs text-zinc-600 dark:text-zinc-300">60 or more reads easily for most people; shorter sentences and words raise it.</p>
    </div>
  );
}

/** References in APA or MLA style. */
function Cite() {
  const [s, setS] = useKept('uv-draft-cite', { authors: '', title: '', site: '', year: '', url: '', accessed: '' });
  const [style, setStyle] = useState<'apa' | 'mla'>('apa');
  const ref = s.title ? cite(s, style) : '';
  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><Btn on={style === 'apa'} onClick={() => setStyle('apa')}>APA</Btn><Btn on={style === 'mla'} onClick={() => setStyle('mla')}>MLA</Btn></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Authors (Last, First; Last, First)"><input className="input" value={s.authors} onChange={set('authors')} /></Field>
        <Field label="Title"><input className="input" value={s.title} onChange={set('title')} /></Field>
        <Field label="Website or publisher"><input className="input" value={s.site} onChange={set('site')} /></Field>
        <Field label="Year"><input className="input" inputMode="numeric" value={s.year} onChange={set('year')} /></Field>
        <Field label="Link"><input className="input" value={s.url} onChange={set('url')} /></Field>
        {style === 'mla' && <Field label="Date you read it"><input className="input" value={s.accessed} onChange={set('accessed')} placeholder="1 Nov. 2026" /></Field>}
      </div>
      {ref && <p className="rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm" translate="no">{ref}</p>}
      {ref && <Out text={ref} />}
    </div>
  );
}

/** Read a text aloud (the device's own voices). */
function Speak() {
  const [t, setT] = useKept('uv-draft-speak', ''), [rate, setRate] = useState(1), [voice, setVoice] = useState(''), [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]), [on, setOn] = useState(false);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load(); speechSynthesis.addEventListener('voiceschanged', load);
    return () => { speechSynthesis.removeEventListener('voiceschanged', load); speechSynthesis.cancel(); };
  }, []);
  const play = () => {
    const u = new SpeechSynthesisUtterance(t); u.rate = rate;
    const v = voices.find((x) => x.name === voice); if (v) u.voice = v;
    u.onend = () => setOn(false); speechSynthesis.cancel(); speechSynthesis.speak(u); setOn(true);
  };
  if (typeof window !== 'undefined' && !('speechSynthesis' in window)) return <p className="text-sm">This browser can’t read aloud.</p>;
  return (
    <div className="space-y-3">
      <Field label="Text to read"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Voice"><select className="input" value={voice} onChange={(e) => setVoice(e.target.value)}><option value="">The usual one</option>{voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}</select></Field>
        <Field label={`Speed ${rate}×`}><input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(+e.target.value)} className="accent-pink-500" /></Field>
        {on ? <button type="button" onClick={() => { speechSynthesis.cancel(); setOn(false); }} className="btn-primary"><Square className="w-4 h-4" aria-hidden />Stop</button>
          : <button type="button" disabled={!t.trim()} onClick={play} className="btn-primary disabled:opacity-50"><Volume2 className="w-4 h-4" aria-hidden />Read aloud</button>}
      </div>
    </div>
  );
}

type Rec = { start(): void; stop(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void; onerror: () => void };
/** Speak and it is typed (the browser's speech recognition; Chrome and Edge send the sound to their maker). */
function Dictate() {
  const [t, setT] = useState(''), [on, setOn] = useState(false), [live, setLive] = useState('');
  const rec = useRef<Rec | null>(null);
  const Ctor = typeof window === 'undefined' ? undefined : ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition);
  const start = () => {
    if (!Ctor) return;
    const r = new Ctor(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
    r.onresult = (e) => { let fin = '', mid = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) fin += x[0].transcript; else mid += x[0].transcript; } if (fin) setT((p) => `${p}${p && !p.endsWith(' ') ? ' ' : ''}${fin.trim()}`); setLive(mid); };
    r.onend = () => { setOn(false); setLive(''); }; r.onerror = () => toast.error('Dictation stopped (it needs the microphone).');
    rec.current = r; r.start(); setOn(true);
  };
  if (!Ctor) return <p className="text-sm text-zinc-700 dark:text-zinc-200">This browser can’t take dictation. Try Chrome, Edge or Safari, or your keyboard’s microphone button.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Your browser turns speech into text; some browsers use their maker’s online service for this.</p>
      {on ? <button type="button" onClick={() => rec.current?.stop()} className="btn-primary"><Square className="w-4 h-4" aria-hidden />Stop</button> : <button type="button" onClick={start} className="btn-primary"><Mic className="w-4 h-4" aria-hidden />Start speaking</button>}
      <Field label="Text"><textarea className={area} value={t + (live ? ` ${live}` : '')} onChange={(e) => setT(e.target.value)} /></Field>
      <Out text={t} name="dictation.txt" />
    </div>
  );
}

const SYMBOLS: [string, string][] = [['Maths', '± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ ∏ ∫ π ° ² ³ ½ ¼ ¾ ∆ ∂ ∈ ∉ ⊂ ∪ ∩ ∀ ∃ → ⇒ ⇔'], ['Greek', 'α β γ δ ε θ λ μ σ φ ω Ω Σ Φ Ψ'], ['Money', '€ £ ¥ ₹ ₩ ₽ ₺ ¢ $'], ['Marks', '✓ ✗ ★ ☆ • ◦ ▪ → ← ↑ ↓ ↔ © ® ™ § ¶ † ‡ … – — « » “ ” ‘ ’'], ['Science', 'Å µ Ω ℃ ℉ ⚛ ☢ ⚡ ♻']];
/** Special characters to copy (like Word's Insert → Symbol). */
function Symbols() {
  return (
    <div className="space-y-4">
      {SYMBOLS.map(([g, list]) => (
        <section key={g} aria-label={g}><h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{g}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">{list.split(' ').map((c) => <button key={c} type="button" onClick={() => void copy(c)} aria-label={`Copy ${c}`} className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-lg hover:ring-2 hover:ring-pink-500">{c}</button>)}</div>
        </section>
      ))}
    </div>
  );
}

/** A calculator that keeps what you worked out. */
function Calc() {
  const [x, setX] = useState(''), [hist, setHist] = useKept<[string, string][]>('uv-calc-history', []);
  let preview = '', err = '';
  try { if (x.trim()) preview = nf(calc(x), 10); } catch (e) { err = (e as Error).message; }
  const run = () => { if (preview && !err) { setHist((h) => [[x, preview] as [string, string], ...h].slice(0, 20)); setX(preview.replace(/,/g, '')); } };
  const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '%', '+', '(', ')', '^', 'sqrt('];
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
      <div className="space-y-2">
        <Field label="Sum (press Enter)"><input className="input font-mono text-lg" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} placeholder="(12 + 8) × 3%" /></Field>
        <p role="status" className={cn('font-mono text-2xl', err ? 'text-base text-rose-600 dark:text-rose-300' : 'text-zinc-900 dark:text-white')}>{err || (preview ? `= ${preview}` : '')}</p>
        <div className="grid grid-cols-4 gap-1.5">{keys.map((k) => <button key={k} type="button" onClick={() => setX((v) => v + k)} className="h-10 rounded-xl bg-zinc-100 dark:bg-white/[0.06] font-mono">{k}</button>)}
          <button type="button" onClick={() => setX('')} className="h-10 rounded-xl bg-zinc-200 dark:bg-white/[0.1]">Clear</button><button type="button" onClick={run} className="col-span-3 h-10 rounded-xl btn-primary justify-center">=</button></div>
      </div>
      <ol className="space-y-1 text-sm font-mono" aria-label="Earlier sums">{hist.map(([q, a], i) => <li key={i}><button type="button" onClick={() => setX(a.replace(/,/g, ''))} className="w-full text-end rounded-lg px-2 py-1 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><span className="block text-xs text-zinc-600 dark:text-zinc-300">{q}</span>{a}</button></li>)}</ol>
    </div>
  );
}

/** Units: length, weight, area, volume, speed, data, time and temperature. */
function Units() {
  const [kind, setKind] = useState('Length'), [v, setV] = useState('1');
  const names = Object.keys(UNITS[kind]);
  const [from, setFrom] = useState('m');
  const f = names.includes(from) ? from : names[0];
  const n = Number(v);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">{Object.keys(UNITS).map((k) => <Btn key={k} on={k === kind} onClick={() => setKind(k)}>{k}</Btn>)}</div>
      <div className="flex flex-wrap items-end gap-2"><Field label="Amount"><input className="input w-36" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></Field>
        <Field label="From"><select className="input" value={f} onChange={(e) => setFrom(e.target.value)}>{names.map((u) => <option key={u}>{u}</option>)}</select></Field></div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{names.filter((u) => u !== f).map((u) => <Stat key={u} k={u} v={Number.isFinite(n) && v.trim() ? nf(convertUnit(kind, n, f, u), 6) : '—'} />)}</dl>
    </div>
  );
}

/** Percentages, the three questions people ask. */
function Percent() {
  const [a, setA] = useState('15'), [b, setB] = useState('80');
  const x = Number(a), y = Number(b), ok = a.trim() !== '' && b.trim() !== '' && Number.isFinite(x) && Number.isFinite(y);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2"><Field label="A"><input className="input w-32" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field><Field label="B"><input className="input w-32" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} /></Field></div>
      <dl className="grid gap-2 sm:grid-cols-2 text-sm">
        <Stat k="A% of B" v={ok ? nf((x / 100) * y) : '—'} /><Stat k="A is what % of B" v={ok && y ? `${nf((x / y) * 100, 2)}%` : '—'} />
        <Stat k="Change from A to B" v={ok && x ? `${nf(((y - x) / Math.abs(x)) * 100, 2)}%` : '—'} /><Stat k="B with A% added" v={ok ? nf(y * (1 + x / 100)) : '—'} />
      </dl>
    </div>
  );
}

/** Pick someone at random, or split a class into groups. */
function Picker() {
  const [t, setT] = useKept('uv-draft-picker', 'Asha\nBo\nChen\nDara\nEli\nFatima'), [n, setN] = useState(2), [out, setOut] = useState<string[][] | null>(null), [one, setOne] = useState('');
  const names = t.split('\n').map((x) => x.trim()).filter(Boolean);
  const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  return (
    <div className="space-y-3">
      <Field label="Names, one a line"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <div className="flex flex-wrap items-end gap-2">
        <Btn onClick={() => setOne(names[Math.floor(rand() * names.length)] ?? '')}>Pick one</Btn>
        <Field label="Groups"><input type="number" min={1} max={50} className="input w-20" value={n} onChange={(e) => setN(Math.max(1, +e.target.value || 1))} /></Field>
        <Btn onClick={() => setOut(groups(names, n, rand))}>Make groups</Btn>
      </div>
      {one && <p role="status" className="text-3xl font-bold text-zinc-900 dark:text-white" translate="no">{one}</p>}
      {out && <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{out.map((g, i) => <li key={i} className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] p-3"><p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Group {i + 1}</p><p className="text-sm" translate="no">{g.join(', ')}</p></li>)}</ol>}
    </div>
  );
}

/** Numbers into a bar or line chart, saved as a picture. */
function Chart() {
  const [t, setT] = useKept('uv-draft-chart', 'Mon 12\nTue 18\nWed 9\nThu 22\nFri 15'), [kind, setKind] = useState<'bar' | 'line'>('bar'), [title, setTitle] = useState('This week');
  const rows = t.split('\n').map((l) => { const m = l.trim().match(/^(.*?)[\s,;:\t]+(-?[\d.]+)$/); return m ? { k: m[1], v: Number(m[2]) } : null; }).filter((r): r is { k: string; v: number } => !!r && Number.isFinite(r.v));
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = 1200, H = 675, g = c.getContext('2d')!; c.width = W; c.height = H;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#141320'; g.font = '700 40px system-ui, sans-serif'; g.fillText(title, 60, 80);
    if (!rows.length) return;
    const max = Math.max(...rows.map((r) => r.v), 0), min = Math.min(...rows.map((r) => r.v), 0), x0 = 80, y0 = 600, w = W - 140, h = 440, span = max - min || 1;
    const Y = (v: number) => y0 - ((v - min) / span) * h;
    g.strokeStyle = '#d6d9e3'; g.lineWidth = 1; g.font = '20px system-ui, sans-serif'; g.fillStyle = '#5b6077';
    for (let k = 0; k <= 4; k++) { const v = min + (span * k) / 4, y = Y(v); g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); g.fillText(nf(v, 1), 10, y + 6); }
    const step = w / rows.length;
    rows.forEach((r, i) => { g.fillStyle = '#5b6077'; g.textAlign = 'center'; g.fillText(r.k.slice(0, 12), x0 + step * (i + 0.5), y0 + 34); g.textAlign = 'start'; });
    if (kind === 'bar') rows.forEach((r, i) => { g.fillStyle = '#533ff6'; const y = Y(Math.max(0, r.v)), yb = Y(Math.min(0, r.v)); g.fillRect(x0 + step * i + step * 0.18, y, step * 0.64, yb - y); });
    else { g.strokeStyle = '#ec74ce'; g.lineWidth = 5; g.beginPath(); rows.forEach((r, i) => { const x = x0 + step * (i + 0.5); if (i) g.lineTo(x, Y(r.v)); else g.moveTo(x, Y(r.v)); }); g.stroke(); rows.forEach((r, i) => { g.fillStyle = '#ec74ce'; g.beginPath(); g.arc(x0 + step * (i + 0.5), Y(r.v), 8, 0, Math.PI * 2); g.fill(); }); }
  }, [rows, kind, title]);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_200px]"><Field label="Label and number, one a line"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
        <div className="space-y-2"><Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field><div className="flex gap-2"><Btn on={kind === 'bar'} onClick={() => setKind('bar')}>Bars</Btn><Btn on={kind === 'line'} onClick={() => setKind('line')}>Line</Btn></div></div></div>
      <canvas ref={ref} role="img" aria-label={`${kind} chart: ${title}`} className="w-full rounded-xl ring-1 ring-black/10" />
      <Btn onClick={() => ref.current?.toBlob((b) => b && save('chart.png', b, 'image/png'))}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn>
    </div>
  );
}

/** Days between dates, and a date some days on. */
function Dates() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [a, setA] = useState(today), [b, setB] = useState(addDays(today, 30)), [n, setN] = useState('14');
  const d = daysBetween(a, b);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2"><Field label="From"><input type="date" className="input" value={a} onChange={(e) => setA(e.target.value)} /></Field><Field label="To"><input type="date" className="input" value={b} onChange={(e) => setB(e.target.value)} /></Field></div>
      <dl className="grid grid-cols-3 gap-2 text-sm"><Stat k="Days" v={d?.days ?? '—'} /><Stat k="Weeks" v={d?.weeks ?? '—'} /><Stat k="Weekdays" v={d?.weekdays ?? '—'} /></dl>
      <div className="flex flex-wrap items-end gap-2"><Field label="Days after “From”"><input className="input w-28" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} /></Field>
        <p className="pb-2 font-mono text-zinc-900 dark:text-white">{Number.isFinite(+n) && a ? new Date(`${addDays(a, +n)}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}</p></div>
    </div>
  );
}

/** Write slides as Markdown (--- between slides) and present them full screen. */
function Present() {
  const [t, setT] = useKept('uv-draft-present', '# Our project\nA short talk\n---\n## The problem\n- Point one\n- Point two\n---\n## Thank you');
  const slides = t.split(/\n-{3,}\n/), [i, setI] = useState(0), [full, setFull] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const at = Math.min(i, slides.length - 1);
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) setI((x) => Math.min(slides.length - 1, x + 1)); if (['ArrowLeft', 'PageUp'].includes(e.key)) setI((x) => Math.max(0, x - 1)); if (e.key === 'Escape') setFull(false); };
    const exit = () => { if (!document.fullscreenElement) setFull(false); };
    window.addEventListener('keydown', k); document.addEventListener('fullscreenchange', exit);
    return () => { window.removeEventListener('keydown', k); document.removeEventListener('fullscreenchange', exit); };
  }, [full, slides.length]);
  const go = async () => { setI(0); setFull(true); try { await box.current?.requestFullscreen(); } catch { /* shown in the page instead */ } };
  return (
    <div className="space-y-3">
      <Field label="Slides (Markdown, --- between slides)"><textarea className={cn(area, 'min-h-[200px]')} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <div ref={box} className={cn('relative grid place-items-center bg-white text-[#141320] rounded-2xl ring-1 ring-black/10 overflow-hidden', full ? 'fixed inset-0 z-50 rounded-none' : 'aspect-video')}>
        <iframe title={`Slide ${at + 1}`} sandbox="" className="w-full h-full pointer-events-none" srcDoc={`<style>body{margin:0;height:100vh;display:grid;place-content:center;font:4vw/1.3 system-ui,sans-serif;color:#141320;padding:0 8vw}h1{font-size:8vw;margin:0}h2{font-size:6vw;margin:0 0 2vw}li{margin:.5vw 0}</style>${markdownToHtml(slides[at] ?? '')}`} />
        <div className="absolute bottom-3 end-3 flex items-center gap-1 rounded-full bg-[#171f44]/85 text-white px-2 py-1">
          <button type="button" aria-label="Previous slide" onClick={() => setI(Math.max(0, at - 1))} className="p-1"><ChevronLeft className="w-4 h-4 rtl:rotate-180" /></button>
          <span className="font-mono text-xs">{at + 1}/{slides.length}</span>
          <button type="button" aria-label="Next slide" onClick={() => setI(Math.min(slides.length - 1, at + 1))} className="p-1"><ChevronRight className="w-4 h-4 rtl:rotate-180" /></button>
          {full && <button type="button" onClick={() => { void document.exitFullscreen?.().catch(() => {}); setFull(false); }} className="px-2 text-xs">Close</button>}
        </div>
      </div>
      <div className="flex gap-2"><button type="button" onClick={() => void go()} className="btn-primary"><Maximize2 className="w-4 h-4" aria-hidden />Present</button><Btn onClick={() => save('slides.md', t, 'text/markdown')}><Download className="w-3.5 h-3.5" aria-hidden />Download .md</Btn></div>
    </div>
  );
}

/** A big countdown for talks, tests and breaks. */
function Timer() {
  const [mins, setMins] = useState(5), [left, setLeft] = useState(300), [run, setRun] = useState(false);
  const end = useRef(0); // when the running countdown reaches zero (set on Start)
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => { const s = Math.max(0, Math.round((end.current - Date.now()) / 1000)); setLeft(s); if (!s) { setRun(false); try { navigator.vibrate?.(300); } catch { /* fine */ } toast.success('Time’s up'); } }, 250);
    return () => clearInterval(t);
  }, [run]);
  const toggle = () => { if (!run) end.current = Date.now() + left * 1000; setRun(!run); };
  return (
    <div className="space-y-4 text-center">
      <p role="timer" aria-live="off" className={cn('font-mono text-7xl sm:text-8xl tabular-nums', left <= 10 && left > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-zinc-900 dark:text-white')}>{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {[1, 3, 5, 10, 15, 30].map((m) => <Btn key={m} on={mins === m} onClick={() => { setRun(false); setMins(m); setLeft(m * 60); }}>{m} min</Btn>)}
      </div>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={toggle} disabled={!left} className="btn-primary disabled:opacity-50">{run ? <><Pause className="w-4 h-4" aria-hidden />Pause</> : <><Play className="w-4 h-4" aria-hidden />Start</>}</button>
        <Btn onClick={() => { setRun(false); setLeft(mins * 60); }}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Reset</Btn>
      </div>
    </div>
  );
}

/** Is text readable on a background? (WCAG contrast). */
function Contrast() {
  const [fg, setFg] = useState('#141320'), [bg, setBg] = useState('#fe81d1');
  const r = contrast(fg, bg);
  const pass = (n: number) => (r !== null && r >= n ? 'Passes' : 'Fails');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {([['Text', fg, setFg], ['Background', bg, setBg]] as const).map(([l, v, set]) => (
          <Field key={l} label={l}><span className="flex gap-1"><input type="color" value={hexRgb(v) ? v : '#000000'} onChange={(e) => set(e.target.value)} className="h-10 w-12" aria-label={`${l} colour`} /><input className="input w-28 font-mono" value={v} onChange={(e) => set(e.target.value)} /></span></Field>
        ))}
      </div>
      <div className="rounded-2xl p-6 text-xl font-semibold" style={{ color: hexRgb(fg) ? fg : undefined, background: hexRgb(bg) ? bg : undefined }}>The quick brown fox jumps over the lazy dog</div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"><Stat k="Contrast" v={r ? `${r} : 1` : '—'} /><Stat k="Normal text (AA, 4.5)" v={pass(4.5)} /><Stat k="Large text (AA, 3)" v={pass(3)} /><Stat k="Best (AAA, 7)" v={pass(7)} /></dl>
    </div>
  );
}

/** A colour as HEX, RGB and HSL. */
function ColourConvert() {
  const [v, setV] = useState('#74ffed');
  const rgb = hexRgb(v), hsl = rgb ? rgbHsl(rgb) : null;
  const rows: [string, string][] = rgb && hsl ? [['HEX', v.startsWith('#') ? v : `#${v}`], ['RGB', `rgb(${rgb.join(', ')})`], ['HSL', `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`]] : [];
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2"><input type="color" value={rgb ? (v.startsWith('#') ? v : `#${v}`) : '#000000'} onChange={(e) => setV(e.target.value)} className="h-10 w-12" aria-label="Pick a colour" /><Field label="HEX"><input className="input w-32 font-mono" value={v} onChange={(e) => setV(e.target.value)} /></Field></div>
      {rows.length ? <ul className="space-y-1.5">{rows.map(([k, x]) => <li key={k} className="flex items-center gap-2"><span className="w-12 text-xs font-semibold">{k}</span><code className="flex-1 rounded-lg bg-zinc-100 dark:bg-white/[0.06] px-2 py-1">{x}</code><button type="button" aria-label={`Copy ${k}`} onClick={() => void copy(x)} className="p-1"><Copy className="w-4 h-4" /></button></li>)}</ul> : <p className="text-sm text-rose-600 dark:text-rose-300">Type a colour like #74ffed.</p>}
    </div>
  );
}

/** SHA fingerprints of a text or file (to check a download is the same). */
function Hash() {
  const [t, setT] = useState(''), [out, setOut] = useState<[string, string][]>([]);
  const run = async (data: ArrayBuffer) => setOut(await Promise.all((['SHA-1', 'SHA-256', 'SHA-512'] as const).map(async (a) => [a, [...new Uint8Array(await crypto.subtle.digest(a, data))].map((b) => b.toString(16).padStart(2, '0')).join('')] as [string, string])));
  return (
    <div className="space-y-3">
      <Field label="Text"><textarea className={area} value={t} onChange={(e) => { setT(e.target.value); void run(new TextEncoder().encode(e.target.value).buffer as ArrayBuffer); }} /></Field>
      <label className="btn-secondary btn-sm cursor-pointer w-fit">Or a file<input type="file" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.arrayBuffer().then(run); }} /></label>
      <ul className="space-y-1.5">{out.map(([k, x]) => <li key={k} className="flex items-center gap-2"><span className="w-16 text-xs font-semibold">{k}</span><code className="flex-1 min-w-0 break-all rounded-lg bg-zinc-100 dark:bg-white/[0.06] px-2 py-1 text-xs">{x}</code><button type="button" aria-label={`Copy ${k}`} onClick={() => void copy(x)} className="p-1"><Copy className="w-4 h-4" /></button></li>)}</ul>
    </div>
  );
}

/** Unique ids for code and spreadsheets. */
function Uuid() {
  const [n, setN] = useState(5), [ids, setIds] = useState<string[]>(() => Array.from({ length: 5 }, () => crypto.randomUUID()));
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2"><Field label="How many"><input type="number" min={1} max={500} className="input w-24" value={n} onChange={(e) => setN(Math.min(500, Math.max(1, +e.target.value || 1)))} /></Field><Btn onClick={() => setIds(Array.from({ length: n }, () => crypto.randomUUID()))}>Make new ones</Btn></div>
      <textarea readOnly aria-label="IDs" className={area} value={ids.join('\n')} /><Out text={ids.join('\n')} name="ids.txt" />
    </div>
  );
}

/** A strong password, made on this device. */
function Password() {
  const [len, setLen] = useState(16), [k, setK] = useState({ lower: true, upper: true, digits: true, symbols: true }), [p, setP] = useState(() => password(16, { lower: true, upper: true, digits: true, symbols: true }));
  const make = (l = len, kk = k) => setP(password(l, kk));
  return (
    <div className="space-y-3">
      <code className="block break-all rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-3 text-lg" translate="no">{p}</code>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Field label={`Length ${len}`}><input type="range" min={8} max={64} value={len} onChange={(e) => { setLen(+e.target.value); make(+e.target.value); }} className="accent-pink-500" /></Field>
        {(['lower', 'upper', 'digits', 'symbols'] as const).map((x) => <label key={x} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={k[x]} onChange={(e) => { const kk = { ...k, [x]: e.target.checked }; setK(kk); make(len, kk); }} className="accent-pink-500" />{{ lower: 'a–z', upper: 'A–Z', digits: '2–9', symbols: '!@#' }[x]}</label>)}
      </div>
      <div className="flex gap-2"><Btn onClick={() => make()}>New one</Btn><Btn onClick={() => void copy(p)}><Copy className="w-3.5 h-3.5" aria-hidden />Copy</Btn></div>
    </div>
  );
}

/** Unix time and dates, both ways. */
function Time() {
  const [v, setV] = useState(() => String(Math.floor(Date.now() / 1000)));
  const ms = toMillis(v);
  const rows: [string, string][] = ms === null ? [] : [['Your time', new Date(ms).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })], ['UTC (ISO)', new Date(ms).toISOString()], ['Unix seconds', String(Math.floor(ms / 1000))], ['Unix milliseconds', String(ms)]];
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2"><Field label="A Unix time or a date"><input className="input font-mono" value={v} onChange={(e) => setV(e.target.value)} /></Field><Btn onClick={() => setV(String(Math.floor(Date.now() / 1000)))}>Now</Btn></div>
      {rows.length ? <dl className="grid gap-2 sm:grid-cols-2 text-sm">{rows.map(([k, x]) => <Stat key={k} k={k} v={x} />)}</dl> : <p className="text-sm text-rose-600 dark:text-rose-300">Not a time I can read.</p>}
    </div>
  );
}

/** A web address taken apart, with its query as a table. */
function Url() {
  const [v, setV] = useState('https://universeimpact.com/trace?tab=map&days=30#top');
  const p = urlParts(v);
  return (
    <div className="space-y-3">
      <Field label="Web address"><input className="input font-mono" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      {p ? <dl className="grid gap-2 sm:grid-cols-2 text-sm"><Stat k="Protocol" v={p.protocol} /><Stat k="Site" v={p.host} /><Stat k="Path" v={p.path} /><Stat k="Section (#)" v={p.hash || '—'} />
        {p.query.map(([k, x], i) => <Stat key={i} k={`?${k}`} v={x || '(empty)'} />)}</dl> : <p className="text-sm text-rose-600 dark:text-rose-300">Not a full web address (it needs https://).</p>}
    </div>
  );
}

/** What a JWT says inside (decoded here only; never sent or checked). */
function Jwt() {
  const [v, setV] = useState('');
  const p = v.trim() ? jwtParts(v) : null;
  const exp = typeof p?.payload.exp === 'number' ? new Date(p.payload.exp * 1000) : null;
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Read on this device only. A token is like a password: don’t paste one you don’t own.</p>
      <Field label="Token"><textarea className={area} value={v} onChange={(e) => setV(e.target.value)} spellCheck={false} /></Field>
      {v.trim() && !p && <p className="text-sm text-rose-600 dark:text-rose-300">Not a JWT.</p>}
      {p && <div className="grid gap-3 md:grid-cols-2">{(['header', 'payload'] as const).map((k) => <div key={k}><p className="text-xs font-semibold">{k === 'header' ? 'Header' : 'Payload'}</p><pre className="mt-1 overflow-x-auto rounded-xl bg-zinc-100 dark:bg-white/[0.06] p-3 text-xs">{JSON.stringify(p[k], null, 2)}</pre></div>)}</div>}
      {exp && <p className="text-sm">Expires {exp.toLocaleString()}</p>}
    </div>
  );
}
