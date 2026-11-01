'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Angry, ChevronLeft, ChevronRight, Download, Frown, Laugh, Meh, Play, Printer, Smile, Square } from 'lucide-react';
import { fancy, FANCY, fromMorse, fromRoman, isAnagram, isPalindrome, lorem, numberToWords, toMorse, toRoman } from '@/lib/more-tools';
import { cn } from '@/lib/utils';
import { Btn, CopyBtn, Field, Out, area, save } from './QuickTools';
import { printOnly, today, useKept } from './kept';
import { Segments, Stat } from './bits';

// Collaborate → Create → Write, fourth set (M74, the owner: "add more than 50 new features and tools"):
// placeholder text, Morse, numbers in words, Roman numerals, letters from templates, line tools, fancy
// letters, a journal and word play. All on this device.

export type WordId = 'lorem' | 'morse' | 'numwords' | 'roman' | 'letters' | 'lines' | 'fancy' | 'journal' | 'wordplay';

export function WordTool({ id }: { id: WordId }) {
  const T = { lorem: Lorem, morse: Morse, numwords: NumWords, roman: Roman, letters: Letters, lines: Lines, fancy: Fancy, journal: Journal, wordplay: WordPlay }[id];
  return <T />;
}

/** Placeholder text for designs and layouts. */
function Lorem() {
  const [p, setP] = useState(3), [s, setS] = useState(4), [html, setHtml] = useState(false), [seed, setSeed] = useState(0);
  const text = useMemo(() => { void seed; return lorem(p, s); }, [p, s, seed]);
  const out = html ? text.split('\n\n').map((x) => `<p>${x}</p>`).join('\n') : text;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <Field label={`Paragraphs: ${p}`}><input type="range" min={1} max={12} value={p} onChange={(e) => setP(+e.target.value)} className="accent-pink-500" /></Field>
        <Field label={`Sentences each: ${s}`}><input type="range" min={1} max={12} value={s} onChange={(e) => setS(+e.target.value)} className="accent-pink-500" /></Field>
        <Btn on={html} onClick={() => setHtml(!html)}>As HTML</Btn>
        <Btn onClick={() => setSeed(seed + 1)}>New text</Btn>
      </div>
      <textarea readOnly className={area} value={out} aria-label="Placeholder text" />
      <Out text={out} name="placeholder.txt" />
    </div>
  );
}

/** Morse code both ways, played as beeps. */
function Morse() {
  const [t, setT] = useKept('uv-draft-morse', 'Hello world');
  const [m, setM] = useState(() => toMorse('Hello world'));
  const [wpm, setWpm] = useState(15), [playing, setPlaying] = useState(false);
  const stop = useRef<() => void>(() => {});
  const play = () => {
    if (playing) return stop.current();
    const ctx = new AudioContext(), osc = ctx.createOscillator(), gain = ctx.createGain(), dot = 1.2 / wpm;
    osc.frequency.value = 650; gain.gain.value = 0; osc.connect(gain).connect(ctx.destination);
    let at = ctx.currentTime + 0.05;
    for (const ch of m) {
      if (ch === '.' || ch === '-') { const len = ch === '.' ? dot : dot * 3; gain.gain.setTargetAtTime(0.25, at, 0.004); gain.gain.setTargetAtTime(0, at + len, 0.004); at += len + dot; }
      else if (ch === ' ') at += dot * 2; else if (ch === '/') at += dot * 2;
    }
    osc.start(); osc.stop(at + 0.1);
    stop.current = () => { try { osc.stop(); } catch { /* already stopped */ } void ctx.close(); setPlaying(false); };
    osc.onended = () => stop.current();
    setPlaying(true);
  };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Field label="Text"><textarea className={area} value={t} onChange={(e) => { setT(e.target.value); setM(toMorse(e.target.value)); }} /></Field>
      <Field label="Morse (. and -, a / between words)"><textarea className={cn(area, 'tracking-widest')} value={m} onChange={(e) => { setM(e.target.value); setT(fromMorse(e.target.value)); }} /></Field>
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <button type="button" onClick={play} className="btn-primary btn-sm">{playing ? <Square className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}{playing ? 'Stop' : 'Play the beeps'}</button>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">Speed<input type="range" min={5} max={30} value={wpm} onChange={(e) => setWpm(+e.target.value)} className="accent-pink-500" /><span className="font-mono tabular-nums">{wpm} wpm</span></label>
        <CopyBtn text={m} label="Copy the Morse" />
      </div>
    </div>
  );
}

const CURRENCIES: [string, string, string][] = [['', '', ''], ['rupees', 'paise', 'Rupees'], ['dollars', 'cents', 'Dollars'], ['pounds', 'pence', 'Pounds'], ['euros', 'cents', 'Euros']];
/** Numbers in words, for cheques and forms. */
function NumWords() {
  const [v, setV] = useState('125450.75'), [cur, setCur] = useState(1), [caps, setCaps] = useState(true);
  let out = '', err = '';
  try {
    const [whole, cents] = v.replace(/,/g, '').split('.');
    const [unit, small] = CURRENCIES[cur];
    if (unit) { out = `${numberToWords(whole || '0')} ${unit}`; const c = Math.round(Number(`0.${cents ?? 0}`) * 100); if (c) out += ` and ${numberToWords(c)} ${small}`; out += ' only'; }
    else out = numberToWords(v);
    if (caps) out = out.replace(/\b\p{L}/gu, (c) => c.toUpperCase()).replace(/\bAnd\b/g, 'and');
  } catch (e) { err = (e as Error).message; }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Number"><input className="input font-mono w-48" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></Field>
        <Field label="Money"><select className="input" value={cur} onChange={(e) => setCur(+e.target.value)}>{CURRENCIES.map((c, i) => <option key={i} value={i}>{c[2] || 'Just the number'}</option>)}</select></Field>
        <Btn on={caps} onClick={() => setCaps(!caps)}>Capital letters</Btn>
      </div>
      {err ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{err}</p> : <p className="rounded-2xl bg-zinc-100/70 dark:bg-white/[0.05] p-4 text-lg font-semibold text-zinc-900 dark:text-white" role="status">{out}</p>}
      {!err && <CopyBtn text={out} />}
    </div>
  );
}

/** Roman numerals both ways. */
function Roman() {
  const [n, setN] = useState('2026'), [r, setR] = useState('MMXXVI'), [err, setErr] = useState('');
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Number (1–3999)"><input className="input font-mono text-lg" inputMode="numeric" value={n} onChange={(e) => { setN(e.target.value); try { setR(toRoman(+e.target.value)); setErr(''); } catch (x) { setErr((x as Error).message); } }} /></Field>
        <Field label="Roman numerals"><input className="input font-mono text-lg uppercase" value={r} onChange={(e) => { setR(e.target.value); try { setN(String(fromRoman(e.target.value))); setErr(''); } catch (x) { setErr((x as Error).message); } }} /></Field>
      </div>
      <p className="text-sm min-h-5" role="status">{err ? <span className="text-rose-700 dark:text-rose-300">{err}</span> : <span className="text-zinc-600 dark:text-zinc-300">I 1 · V 5 · X 10 · L 50 · C 100 · D 500 · M 1000</span>}</p>
    </div>
  );
}

const LETTERS: Record<string, string> = {
  'Leave request (school)': '[Date]\n\nDear [Teacher’s name],\n\nI am writing to ask for leave for [Student’s name] of class [Class] from [From date] to [To date], because [Reason].\n\nWe will make sure any work missed is caught up. Thank you for understanding.\n\nYours sincerely,\n[Your name]',
  'Thank-you note': 'Dear [Name],\n\nThank you so much for [What they did]. It meant a lot to me because [Why it mattered].\n\nWith thanks,\n[Your name]',
  Apology: 'Dear [Name],\n\nI am sorry for [What happened]. I understand that it [How it affected them], and that was not fair to you.\n\nFrom now on, I will [What you will do differently].\n\nSincerely,\n[Your name]',
  Complaint: '[Date]\n\nDear [Company or person],\n\nI am writing about [Product or service], bought on [Date bought] (reference [Order number]).\n\nThe problem is that [What went wrong]. I would like you to [What you want: refund, repair, replacement] by [Deadline].\n\nI look forward to your reply.\n\nYours faithfully,\n[Your name]\n[Phone or email]',
  'Job or internship application': 'Dear [Hiring manager],\n\nI would like to apply for the [Role] position at [Organisation]. I am currently [What you do now], and I have [One strong skill or experience].\n\nI am excited by [Something specific about the organisation], and I believe I can help by [What you would bring].\n\nI have attached my CV and would welcome the chance to talk.\n\nKind regards,\n[Your name]',
  'Asking for a reference': 'Dear [Name],\n\nI hope you are well. I am applying for [What you are applying for] and would be grateful if you could act as a reference for me, as you know my work from [How they know you].\n\nThe deadline is [Deadline]. I am happy to send my CV and any details that would help.\n\nThank you for considering it.\n\nBest wishes,\n[Your name]',
};
/** Letters from templates: fill in the blanks. */
function Letters() {
  const [kind, setKind] = useState(Object.keys(LETTERS)[0]);
  const [vals, setVals] = useKept<Record<string, string>>('uv-letter-values', {});
  const tpl = LETTERS[kind], blanks = [...new Set([...tpl.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]))];
  const out = tpl.replace(/\[([^\]]+)\]/g, (m, k: string) => (k === 'Date' && !vals[k] ? new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : vals[k]?.trim() || m));
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="space-y-2">
        <Field label="Letter"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.keys(LETTERS).map((k) => <option key={k}>{k}</option>)}</select></Field>
        {blanks.map((b) => <Field key={b} label={b}><input className="input" value={vals[b] ?? ''} placeholder={b === 'Date' ? 'Today' : ''} onChange={(e) => setVals({ ...vals, [b]: e.target.value })} /></Field>)}
      </div>
      <div className="space-y-2">
        <div id="letter-sheet" className="whitespace-pre-wrap rounded-2xl bg-white p-6 text-[15px] leading-relaxed text-zinc-900 ring-1 ring-black/10 min-h-[320px]" translate="no">{out}</div>
        <div className="flex flex-wrap gap-2"><CopyBtn text={out} /><Btn onClick={() => save('letter.txt', out, 'text/plain')}><Download className="w-3.5 h-3.5" aria-hidden />Download</Btn><Btn onClick={() => printOnly('letter-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn></div>
      </div>
    </div>
  );
}

/** Line tools: number, prefix, wrap, join, split, filter. */
function Lines() {
  const [t, setT] = useKept('uv-draft-lines', 'apples\nbananas\n\ncherries\ndates');
  const [a, setA] = useState('- '), [b, setB] = useState(''), [w, setW] = useState(60), [find, setFind] = useState('');
  const lines = t.split('\n');
  const ops: [string, () => string][] = [
    ['Number them', () => lines.map((l, i) => `${i + 1}. ${l}`).join('\n')],
    ['Add before', () => lines.map((l) => a + l).join('\n')],
    ['Add after', () => lines.map((l) => l + b).join('\n')],
    ['Remove empty', () => lines.filter((l) => l.trim()).join('\n')],
    ['Trim spaces', () => lines.map((l) => l.trim()).join('\n')],
    ['Join with “before”', () => lines.filter((l) => l.trim()).join(a)],
    ['Split at “before”', () => t.split(a || ',').map((x) => x.trim()).join('\n')],
    [`Wrap at ${w}`, () => t.split('\n').map((l) => l.replace(new RegExp(`(.{1,${w}})(\\s+|$)`, 'g'), '$1\n').trimEnd()).join('\n')],
    ['Shuffle', () => { const x = [...lines]; for (let i = x.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x.join('\n'); }],
    ['Keep lines with…', () => lines.filter((l) => l.toLowerCase().includes(find.toLowerCase())).join('\n')],
    ['Drop lines with…', () => lines.filter((l) => !find || !l.toLowerCase().includes(find.toLowerCase())).join('\n')],
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <Field label="Before / join with"><input className="input" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <Field label="After"><input className="input" value={b} onChange={(e) => setB(e.target.value)} /></Field>
        <Field label="Wrap width"><input type="number" min={10} max={200} className="input" value={w} onChange={(e) => setW(Math.max(10, Math.min(200, +e.target.value || 60)))} /></Field>
        <Field label="Lines with…"><input className="input" value={find} onChange={(e) => setFind(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">{ops.map(([l, f]) => <Btn key={l} onClick={() => setT(f())}>{l}</Btn>)}</div>
      <Field label={`Text · ${lines.length} lines`}><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <Out text={t} name="lines.txt" />
    </div>
  );
}

/** Fancy letters for bios and posts (Unicode, so they paste anywhere). */
function Fancy() {
  const [t, setT] = useKept('uv-draft-fancy', 'UniVerse Impact');
  return (
    <div className="space-y-3">
      <Field label="Your words"><input className="input text-lg" value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <ul className="divide-y divide-zinc-200 dark:divide-white/10 rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10">
        {FANCY.map((s) => { const v = fancy(t, s); return (
          <li key={s} className="flex items-center gap-3 px-3 py-2">
            <span className="w-28 shrink-0 text-xs text-zinc-600 dark:text-zinc-300">{s}</span>
            <span className="flex-1 min-w-0 truncate text-lg text-zinc-900 dark:text-white" translate="no">{v}</span>
            <CopyBtn text={v} />
          </li>
        ); })}
      </ul>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Screen readers may read these letters one by one: keep them for short names and titles.</p>
    </div>
  );
}

const MOODS = [{ k: 'great', l: 'Great', I: Laugh, c: 'text-emerald-600' }, { k: 'good', l: 'Good', I: Smile, c: 'text-teal-600' }, { k: 'okay', l: 'Okay', I: Meh, c: 'text-amber-600' }, { k: 'low', l: 'Low', I: Frown, c: 'text-sky-600' }, { k: 'bad', l: 'Rough', I: Angry, c: 'text-rose-600' }] as const;
interface Entry { text: string; mood?: string }
/** A private journal: a page a day with a mood; kept only on this device. */
function Journal() {
  const t0 = useMemo(() => today(), []);
  const [entries, setEntries] = useKept<Record<string, Entry>>('uv-journal', {});
  const [day, setDay] = useState(t0), [month, setMonth] = useState(t0.slice(0, 7)), [q, setQ] = useState('');
  const e = entries[day] ?? { text: '' };
  const put = (p: Partial<Entry>) => setEntries({ ...entries, [day]: { ...e, ...p } });
  const [y, mo] = month.split('-').map(Number), first = new Date(Date.UTC(y, mo - 1, 1)), days = new Date(Date.UTC(y, mo, 0)).getUTCDate(), lead = (first.getUTCDay() + 6) % 7;
  const shift = (n: number) => { const d = new Date(Date.UTC(y, mo - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const found = q.trim() ? Object.entries(entries).filter(([, x]) => x.text.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b[0].localeCompare(a[0])) : [];
  const words = e.text.trim() ? e.text.trim().split(/\s+/).length : 0;
  const all = () => Object.entries(entries).sort((a, b) => a[0].localeCompare(b[0])).filter(([, x]) => x.text.trim()).map(([d, x]) => `${d}${x.mood ? ` (${x.mood})` : ''}\n${x.text}`).join('\n\n---\n\n');
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="btn-ghost btn-icon"><ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden /></button>
          <p className="font-bold text-zinc-900 dark:text-white">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="btn-ghost btn-icon"><ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label="Days">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="text-[11px] text-zinc-600 dark:text-zinc-300" aria-hidden>{d}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
          {Array.from({ length: days }, (_, i) => { const d = `${month}-${String(i + 1).padStart(2, '0')}`, has = !!entries[d]?.text?.trim(), mood = MOODS.find((m) => m.k === entries[d]?.mood); return (
            <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={d === day} className={cn('relative h-9 rounded-lg text-sm tabular-nums transition-colors', d === day ? 'bg-pink-500 text-indigo-900 font-bold' : 'hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-800 dark:text-zinc-100', d === t0 && d !== day && 'ring-1 ring-pink-500')}>
              <span aria-hidden>{i + 1}</span><span className="sr-only">{new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' })}{has ? ', written' : ''}</span>{has && <span className={cn('absolute bottom-1 start-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full', mood ? 'bg-current' : 'bg-indigo-400', mood?.c)} aria-hidden />}
            </button>
          ); })}
        </div>
        <input className="input" value={q} onChange={(x) => setQ(x.target.value)} placeholder="Search your journal" aria-label="Search your journal" />
        {found.length > 0 && <ul className="space-y-1 max-h-48 overflow-auto">{found.slice(0, 20).map(([d, x]) => <li key={d}><button type="button" onClick={() => { setDay(d); setMonth(d.slice(0, 7)); }} className="w-full text-start rounded-lg px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-white/10"><span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">{d}</span> <span className="text-zinc-900 dark:text-white">{x.text.slice(0, 50)}</span></button></li>)}</ul>}
        <Btn onClick={() => { const t = all(); if (!t) return toast.error('Nothing written yet.'); save('journal.txt', t, 'text/plain'); }}><Download className="w-3.5 h-3.5" aria-hidden />Download everything</Btn>
      </div>
      <div className="space-y-3">
        <p className="font-bold text-zinc-900 dark:text-white">{new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="How was the day?">
          {MOODS.map((m) => <button key={m.k} type="button" onClick={() => put({ mood: e.mood === m.k ? undefined : m.k })} aria-pressed={e.mood === m.k} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-[transform,background-color] active:scale-95', e.mood === m.k ? 'border-pink-500 bg-pink-500/10 font-semibold text-zinc-900 dark:text-white' : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200')}><m.I className={cn('w-4 h-4', m.c)} aria-hidden />{m.l}</button>)}
        </div>
        <textarea className={cn(area, 'min-h-[320px] font-sans text-base')} value={e.text} onChange={(x) => put({ text: x.target.value })} placeholder="What happened today? What are you grateful for?" aria-label="Journal entry" translate="no" />
        <p className="text-xs text-zinc-600 dark:text-zinc-300 tabular-nums">{words} words · private: kept only in this browser, never sent anywhere.</p>
      </div>
    </div>
  );
}

/** Word play: anagrams, palindromes, letters counted. */
function WordPlay() {
  const [mode, setMode] = useState<'anagram' | 'palindrome' | 'letters'>('anagram');
  const [a, setA] = useState('Listen'), [b, setB] = useState('Silent'), [p, setP] = useState('Was it a car or a cat I saw?');
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const c of p.toLowerCase().replace(/[^\p{L}]/gu, '')) m.set(c, (m.get(c) ?? 0) + 1); return [...m].sort((x, y) => y[1] - x[1]); }, [p]);
  const vowels = (p.match(/[aeiou]/gi) ?? []).length;
  return (
    <div className="space-y-4">
      <Segments label="Game" value={mode} onChange={setMode} options={[['anagram', 'Anagram'], ['palindrome', 'Palindrome'], ['letters', 'Letters']] as const} />
      {mode === 'anagram' ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2"><Field label="First"><input className="input" value={a} onChange={(e) => setA(e.target.value)} /></Field><Field label="Second"><input className="input" value={b} onChange={(e) => setB(e.target.value)} /></Field></div>
          <p role="status" className={cn('text-lg font-bold', isAnagram(a, b) ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-900 dark:text-white')}>{isAnagram(a, b) ? 'Yes, an anagram: the same letters.' : 'Not an anagram.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Field label="Words"><input className="input" value={p} onChange={(e) => setP(e.target.value)} /></Field>
          {mode === 'palindrome' ? <p role="status" className={cn('text-lg font-bold', isPalindrome(p) ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-900 dark:text-white')}>{isPalindrome(p) ? 'Yes: it reads the same backwards.' : 'No: backwards it’s different.'} <span className="block text-sm font-normal text-zinc-600 dark:text-zinc-300" translate="no">Backwards: {[...p].reverse().join('')}</span></p>
            : (<>
              <dl className="grid grid-cols-3 gap-2 text-sm"><Stat k="Letters" v={counts.reduce((x, [, n]) => x + n, 0)} /><Stat k="Vowels" v={vowels} /><Stat k="Different letters" v={counts.length} /></dl>
              <ul className="flex flex-wrap gap-1.5">{counts.map(([c, n]) => <li key={c} className="rounded-lg bg-zinc-100 dark:bg-white/[0.06] px-2 py-1 font-mono text-sm text-zinc-900 dark:text-white">{c} <span className="text-zinc-600 dark:text-zinc-300">{n}</span></li>)}</ul>
            </>)}
        </div>
      )}
    </div>
  );
}
