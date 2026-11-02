'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, ImagePlus, Pause, Play, Printer, RotateCcw, Shuffle } from 'lucide-react';
import { seeded } from '@/lib/big-tools';
import { asciiArt, blobPath, mix, tintsShades, typeScale } from '@/lib/tools-5';
import { cn } from '@/lib/utils';
import { Btn, CopyBtn, Field, save } from './QuickTools';
import { printOnly, useKept } from './kept';
import { Segments } from './bits';

// Collaborate → Create → Design and media, fifth set (M75): an event poster, business cards, a colour
// mixer, a type scale, blob shapes, ASCII art, a drum machine, a piano and splitting a photo into a
// grid. All on the device; sounds are made by the browser.

export type ArtId = 'poster' | 'bizcard' | 'mixer' | 'typescale' | 'blob' | 'ascii' | 'drums' | 'piano' | 'gridsplit';

export function ArtTool({ id }: { id: ArtId }) {
  const T = { poster: Poster, bizcard: BizCard, mixer: Mixer, typescale: TypeScale, blob: Blob, ascii: Ascii, drums: Drums, piano: Piano, gridsplit: GridSplit }[id];
  return <T />;
}
const savePng = (c: HTMLCanvasElement | null, name: string) => c?.toBlob((b) => b && save(name, b, 'image/png'));
const loadImage = (f: File) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('This picture can’t be opened here.')); i.src = URL.createObjectURL(f); });

const THEMES = [{ n: 'Night', a: '#171f44', b: '#533ff6', ink: '#ffffff', hi: '#fe81d1' }, { n: 'Sunrise', a: '#f97316', b: '#ec4899', ink: '#ffffff', hi: '#fef08a' }, { n: 'Mint', a: '#ecfdf5', b: '#99f6e4', ink: '#134e4a', hi: '#0d9488' }, { n: 'Paper', a: '#fffdf8', b: '#f3efe6', ink: '#171f44', hi: '#dc2626' }];
/** Event poster: title, date, place and details on a theme; save it A4 as a picture or print it. */
function Poster() {
  const [p, setP] = useKept('uv-poster', { title: 'Science Fair', tag: 'Ideas that change the world', date: 'Friday 14 November · 2–5 pm', place: 'School hall', more: 'Free entry · Everyone welcome · Prizes for the best projects', theme: 0 });
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = 1240, H = 1754, g = c.getContext('2d')!, t = THEMES[p.theme] ?? THEMES[0]; c.width = W; c.height = H;
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, t.a); gr.addColorStop(1, t.b); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.18; g.fillStyle = t.hi; for (const [x, y, r] of [[1050, 260, 300], [180, 1500, 380], [1100, 1300, 160]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1;
    const wrap = (text: string, size: number, y: number, weight = 800, colour = t.ink, lh = 1.1) => { g.font = `${weight} ${size}px Urbanist, system-ui, sans-serif`; g.fillStyle = colour; const words = text.split(' '); let line = '', yy = y; for (const w of words) { const test = line ? `${line} ${w}` : w; if (g.measureText(test).width > W - 200 && line) { g.fillText(line, 100, yy); line = w; yy += size * lh; } else line = test; } if (line) g.fillText(line, 100, yy); return yy + size * lh; };
    let y = wrap(p.tag.toUpperCase(), 40, 260, 700, t.hi);
    y = wrap(p.title, 170, y + 120, 900);
    g.fillStyle = t.hi; g.fillRect(100, y + 10, 220, 14);
    y = wrap(p.date, 60, y + 150, 700);
    y = wrap(p.place, 60, y + 10, 500);
    wrap(p.more, 44, Math.max(y + 120, 1450), 500, t.ink, 1.35);
  }, [p]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-2">
        {(['title', 'tag', 'date', 'place', 'more'] as const).map((k) => <Field key={k} label={{ title: 'Title', tag: 'Line above', date: 'When', place: 'Where', more: 'Details' }[k]}><input className="input" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></Field>)}
        <div className="flex flex-wrap gap-1.5">{THEMES.map((t, i) => <Btn key={t.n} on={p.theme === i} onClick={() => setP({ ...p, theme: i })}>{t.n}</Btn>)}</div>
        <div className="flex gap-2"><Btn onClick={() => savePng(ref.current, 'poster.png')}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn><Btn onClick={() => printOnly('poster-canvas')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn></div>
      </div>
      <canvas id="poster-canvas" ref={ref} className="w-full rounded-xl ring-1 ring-black/10 shadow-lg" role="img" aria-label={`Poster: ${p.title}`} />
    </div>
  );
}

/** Business cards: name, role, contacts and a colour; a sheet of 10 to print, or one as a picture. */
function BizCard() {
  const [v, setV] = useKept('uv-bizcard', { name: 'Your Name', role: 'Student Ambassador', org: 'UniVerse School', line1: 'you@example.com', line2: '+00 0000 000000', colour: '#533ff6', dark: true });
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const W = 1050, H = 600, g = c.getContext('2d')!; c.width = W; c.height = H;
    g.fillStyle = v.dark ? '#171f44' : '#ffffff'; g.fillRect(0, 0, W, H); g.fillStyle = v.colour; g.fillRect(0, 0, 26, H); g.beginPath(); g.arc(W - 90, 90, 40, 0, Math.PI * 2); g.fill();
    const ink = v.dark ? '#ffffff' : '#141320', soft = v.dark ? '#c7cbe0' : '#4b5068';
    g.fillStyle = ink; g.font = '800 72px Urbanist, system-ui, sans-serif'; g.fillText(v.name, 90, 230);
    g.fillStyle = v.colour === '#171f44' && v.dark ? '#fe81d1' : v.colour; g.font = '700 38px Urbanist, system-ui, sans-serif'; g.fillText(v.role, 90, 290);
    g.fillStyle = soft; g.font = '500 34px Urbanist, system-ui, sans-serif'; g.fillText(v.org, 90, 340); g.fillText(v.line1, 90, 470); g.fillText(v.line2, 90, 520);
  }, [v]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">{(['name', 'role', 'org', 'line1', 'line2'] as const).map((k) => <Field key={k} label={{ name: 'Name', role: 'Role', org: 'School or company', line1: 'Contact line 1', line2: 'Contact line 2' }[k]}><input className="input" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}<Field label="Colour"><input type="color" className="input h-11 p-1" value={v.colour} onChange={(e) => setV({ ...v, colour: e.target.value })} /></Field></div>
        <div className="flex flex-wrap gap-2"><Btn on={v.dark} onClick={() => setV({ ...v, dark: !v.dark })}>Dark card</Btn><Btn onClick={() => savePng(ref.current, 'business-card.png')}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn><Btn onClick={() => { const url = ref.current?.toDataURL('image/png'); const w = document.getElementById('cards-sheet'); if (url && w) { w.innerHTML = Array.from({ length: 10 }, () => `<img src="${url}" alt="" style="width:85mm;height:55mm;margin:2mm;display:inline-block" />`).join(''); printOnly('cards-sheet'); } }}><Printer className="w-3.5 h-3.5" aria-hidden />Print 10</Btn></div>
        <div id="cards-sheet" className="hidden print:block" aria-hidden />
      </div>
      <canvas ref={ref} className="w-full rounded-xl ring-1 ring-black/10 shadow-lg" role="img" aria-label={`Business card for ${v.name}`} />
    </div>
  );
}

/** Colour mixer: two colours blended in steps, and a colour's tints and shades. */
function Mixer() {
  const [a, setA] = useKept('uv-mix-a', '#533ff6'), [b, setB] = useKept('uv-mix-b', '#fe81d1'), [steps, setSteps] = useState(7);
  const blend = Array.from({ length: steps }, (_, i) => mix(a, b, i / (steps - 1))), ts = tintsShades(a, 5);
  const row = (cs: string[], label: string) => <div><p className="mb-1 text-xs text-zinc-600 dark:text-zinc-300">{label}</p><div className="flex rounded-xl overflow-hidden ring-1 ring-black/10">{cs.map((c) => <button key={c + label} type="button" onClick={() => void navigator.clipboard?.writeText(c).then(() => toast.success(`${c} copied`), () => {})} className="flex-1 h-16 grid place-items-end pb-1 text-[11px] font-mono transition-transform hover:scale-y-110" style={{ background: c }} aria-label={`Copy ${c}`}><span className="rounded bg-white/90 px-1 text-zinc-900">{c}</span></button>)}</div></div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><Field label="Colour A"><input type="color" className="input h-11 w-20 p-1" value={a} onChange={(e) => setA(e.target.value)} /></Field><Field label="Colour B"><input type="color" className="input h-11 w-20 p-1" value={b} onChange={(e) => setB(e.target.value)} /></Field><Field label={`Steps: ${steps}`}><input type="range" min={3} max={12} value={steps} onChange={(e) => setSteps(+e.target.value)} className="accent-pink-500" /></Field></div>
      {row(blend, 'A mixed into B (tap to copy)')}
      {row(ts.tints, 'Tints of A (with white)')}
      {row(ts.shades, 'Shades of A (with black)')}
      <CopyBtn text={`:root {\n${blend.map((c, i) => `  --mix-${i + 1}: ${c};`).join('\n')}\n}`} label="Copy as CSS" />
    </div>
  );
}

const RATIOS: [number, string][] = [[1.125, 'Major second'], [1.2, 'Minor third'], [1.25, 'Major third'], [1.333, 'Perfect fourth'], [1.5, 'Perfect fifth'], [1.618, 'Golden ratio']];
/** Type scale: text sizes that go together, seen as real text; copy as CSS. */
function TypeScale() {
  const [base, setBase] = useState(16), [ratio, setRatio] = useState(1.25), [sample, setSample] = useState('Every great idea starts small');
  const scale = typeScale(base, ratio), names = ['small', 'caption', 'body', 'large', 'h4', 'h3', 'h2', 'h1'];
  const css = `:root {\n${scale.map((s, i) => `  --text-${names[i]}: ${(s.px / 16).toFixed(3)}rem; /* ${s.px}px */`).join('\n')}\n}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><Field label="Body size (px)"><input type="number" min={10} max={24} className="input w-24" value={base} onChange={(e) => setBase(Math.max(10, Math.min(24, +e.target.value || 16)))} /></Field><Field label="Step"><select className="input w-auto!" value={ratio} onChange={(e) => setRatio(+e.target.value)}>{RATIOS.map(([r, n]) => <option key={r} value={r}>{n} ({r})</option>)}</select></Field><Field label="Sample"><input className="input" value={sample} onChange={(e) => setSample(e.target.value)} /></Field></div>
      <ul className="space-y-2 overflow-hidden">{[...scale].reverse().map((s, i) => <li key={s.step} className="flex items-baseline gap-3"><span className="w-20 shrink-0 font-mono text-xs text-zinc-600 dark:text-zinc-300">{names[scale.length - 1 - i]} {s.px}</span><span className="truncate font-bold text-zinc-900 dark:text-white" style={{ fontSize: s.px, lineHeight: 1.15 }}>{sample}</span></li>)}</ul>
      <CopyBtn text={css} label="Copy as CSS" />
    </div>
  );
}

/** Blob shapes: soft organic shapes for backgrounds; shuffle, colour and save as SVG or PNG. */
function Blob() {
  const [v, setV] = useKept('uv-blob', { points: 7, wobble: 0.45, seed: 3, a: '#ec74ce', b: '#533ff6' });
  const d = useMemo(() => blobPath(v.points, v.wobble, seeded(v.seed)), [v.points, v.wobble, v.seed]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${v.a}"/><stop offset="1" stop-color="${v.b}"/></linearGradient></defs><path d="${d}" fill="url(#g)"/></svg>`;
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_280px]">
      <div className="space-y-2">
        <Field label={`Points: ${v.points}`}><input type="range" min={3} max={14} value={v.points} onChange={(e) => setV({ ...v, points: +e.target.value })} className="w-full accent-pink-500" /></Field>
        <Field label={`Wobble: ${Math.round(v.wobble * 100)}%`}><input type="range" min={0} max={0.9} step={0.05} value={v.wobble} onChange={(e) => setV({ ...v, wobble: +e.target.value })} className="w-full accent-pink-500" /></Field>
        <div className="flex flex-wrap items-end gap-2"><Field label="From"><input type="color" className="input h-11 w-20 p-1" value={v.a} onChange={(e) => setV({ ...v, a: e.target.value })} /></Field><Field label="To"><input type="color" className="input h-11 w-20 p-1" value={v.b} onChange={(e) => setV({ ...v, b: e.target.value })} /></Field><Btn onClick={() => setV({ ...v, seed: v.seed + 1 })}><Shuffle className="w-3.5 h-3.5" aria-hidden />New shape</Btn></div>
        <div className="flex gap-2"><Btn onClick={() => save('blob.svg', svg, 'image/svg+xml')}><Download className="w-3.5 h-3.5" aria-hidden />SVG</Btn><CopyBtn text={svg} label="Copy SVG" /></div>
      </div>
      <svg viewBox="0 0 200 200" className="w-full max-w-[280px]" role="img" aria-label="Blob shape"><defs><linearGradient id="blobg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={v.a} /><stop offset="1" stopColor={v.b} /></linearGradient></defs><path d={d} fill="url(#blobg)" style={{ transition: 'd 500ms var(--ease-out-soft)' }} /></svg>
    </div>
  );
}

/** ASCII art: a picture as letters and symbols, to paste in code or a chat. */
function Ascii() {
  const [img, setImg] = useState<HTMLImageElement | null>(null), [cols, setCols] = useState(80), [invert, setInvert] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const out = useMemo(() => {
    if (!img) return '';
    const s = Math.min(1, 400 / img.naturalWidth), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0, c.width, c.height);
    return asciiArt(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, cols, invert);
  }, [img, cols, invert]);
  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Choose a picture" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { setImg(await loadImage(f)); } catch (x) { toast.error((x as Error).message); } } }} />
      <div className="flex flex-wrap items-end gap-2"><button type="button" onClick={() => fileRef.current?.click()} className="btn-primary btn-sm"><ImagePlus className="w-4 h-4" aria-hidden />{img ? 'Another picture' : 'Choose a picture'}</button><Field label={`Width: ${cols} characters`}><input type="range" min={30} max={160} value={cols} onChange={(e) => setCols(+e.target.value)} className="accent-pink-500" /></Field><Btn on={invert} onClick={() => setInvert(!invert)}>For dark backgrounds</Btn>{out && <CopyBtn text={out} />}{out && <Btn onClick={() => save('ascii.txt', out, 'text/plain')}><Download className="w-3.5 h-3.5" aria-hidden />.txt</Btn>}</div>
      {out ? <pre tabIndex={0} aria-label="ASCII art" className={cn('overflow-auto rounded-xl p-3 font-mono leading-[1.05] text-[7px] sm:text-[8px] max-h-[520px]', invert ? 'bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900 ring-1 ring-black/10')}>{out}</pre> : <p className="text-sm text-zinc-600 dark:text-zinc-300">Pictures with a clear subject and plain background work best.</p>}
    </div>
  );
}

const DRUMS = ['Kick', 'Snare', 'Hi-hat', 'Clap'] as const;
function hit(ctx: AudioContext, kind: (typeof DRUMS)[number], t: number) {
  const g = ctx.createGain(); g.connect(ctx.destination);
  if (kind === 'Kick') { const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); o.start(t); o.stop(t + 0.3); return; }
  const len = kind === 'Hi-hat' ? 0.05 : 0.18, b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(); s.buffer = b;
  f.type = kind === 'Hi-hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'Hi-hat' ? 7000 : kind === 'Clap' ? 1500 : 1800;
  g.gain.setValueAtTime(kind === 'Hi-hat' ? 0.3 : 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  s.connect(f).connect(g); s.start(t);
}
/** Drum machine: 16 steps for kick, snare, hi-hat and clap; set the tempo and play the loop. */
function Drums() {
  const [grid, setGrid] = useKept<boolean[][]>('uv-drums', () => [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], new Array(16).fill(0)].map((r) => r.map(Boolean)));
  const [bpm, setBpm] = useKept('uv-drums-bpm', 100), [on, setOn] = useState(false), [step, setStep] = useState(-1);
  const live = useRef({ grid, bpm });
  useEffect(() => { live.current = { grid, bpm }; }, [grid, bpm]);
  useEffect(() => {
    if (!on) return;
    const ctx = new AudioContext(); let next = ctx.currentTime + 0.05, n = 0; const marks: [number, number][] = [];
    const timer = setInterval(() => { while (next < ctx.currentTime + 0.12) { const k = n % 16; live.current.grid.forEach((row, r) => { if (row[k]) hit(ctx, DRUMS[r], next); }); marks.push([next, k]); n++; next += 60 / live.current.bpm / 4; } }, 25);
    let raf = 0; const draw = () => { while (marks.length && marks[0][0] <= ctx.currentTime) setStep(marks.shift()![1]); raf = requestAnimationFrame(draw); }; raf = requestAnimationFrame(draw);
    return () => { clearInterval(timer); cancelAnimationFrame(raf); void ctx.close(); setStep(-1); };
  }, [on]);
  return (
    <div className="space-y-3">
      <div tabIndex={0} role="region" aria-label="Beat grid" className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-pink-500">
        <div className="grid gap-1 min-w-[560px]" style={{ gridTemplateColumns: '64px repeat(16, minmax(0, 1fr))' }}>
          {DRUMS.map((d, r) => [<span key={d} className="self-center text-sm font-semibold text-zinc-900 dark:text-white">{d}</span>, ...grid[r].map((v, c) => <button key={`${d}${c}`} type="button" onClick={() => setGrid(grid.map((row, i) => (i === r ? row.map((x, j) => (j === c ? !x : x)) : row)))} aria-pressed={v} aria-label={`${d}, step ${c + 1}`} className={cn('h-9 rounded-md transition-[background-color,transform] duration-75 active:scale-90', v ? 'bg-pink-500' : c % 4 === 0 ? 'bg-zinc-300 dark:bg-white/20' : 'bg-zinc-200 dark:bg-white/10', step === c && 'ring-2 ring-indigo-600 dark:ring-aqua-300 scale-105')} />)])}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => setOn(!on)} className="btn-primary">{on ? <Pause className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}{on ? 'Stop' : 'Play'}</button><label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">Tempo<input type="range" min={60} max={180} value={bpm} onChange={(e) => setBpm(+e.target.value)} className="accent-pink-500" /><span className="font-mono tabular-nums">{bpm}</span></label><Btn onClick={() => setGrid(grid.map((r) => r.map(() => false)))}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Clear</Btn></div>
    </div>
  );
}

const KEYS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const KB = 'awsedftgyhujkolp';
/** Piano: two octaves to play with the mouse, a finger or the keyboard (A W S E D…); record a tune. */
function Piano() {
  const ctx = useRef<AudioContext | null>(null), [down, setDown] = useState<number | null>(null), [rec, setRec] = useState<[number, number][] | null>(null), [tune, setTune] = useKept<[number, number][]>('uv-piano-tune', []);
  const t0 = useRef(0);
  const play = (n: number, when = 0) => {
    const c = (ctx.current ??= new AudioContext()), f = 261.63 * 2 ** (n / 12), t = c.currentTime + when;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2;
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    o.connect(g); o2.connect(g); g.connect(c.destination); o.start(t); o2.start(t); o.stop(t + 1.25); o2.stop(t + 1.25);
  };
  const press = (n: number) => { play(n); setDown(n); setTimeout(() => setDown((d) => (d === n ? null : d)), 160); if (rec) setRec([...rec, [n, performance.now() - t0.current]]); };
  useEffect(() => { const k = (e: KeyboardEvent) => { const el = e.target as HTMLElement; if (e.repeat || el.closest('input, textarea, select')) return; const i = KB.indexOf(e.key.toLowerCase()); if (i >= 0) { e.preventDefault(); press(i); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  useEffect(() => () => { void ctx.current?.close(); }, []);
  const white = Array.from({ length: 24 }, (_, i) => i).filter((i) => !KEYS[i % 12].includes('♯')), black = Array.from({ length: 24 }, (_, i) => i).filter((i) => KEYS[i % 12].includes('♯'));
  const wx = (i: number) => white.indexOf(i);
  return (
    <div className="space-y-3">
      <div className="relative h-44 select-none touch-none" role="group" aria-label="Piano keys">
        {white.map((n, k) => <button key={n} type="button" onPointerDown={() => press(n)} aria-label={`${KEYS[n % 12]}${4 + Math.floor(n / 12)}`} className={cn('absolute top-0 h-full rounded-b-lg border border-zinc-300 transition-colors duration-75', down === n ? 'bg-pink-200' : 'bg-white')} style={{ left: `${(k / white.length) * 100}%`, width: `${100 / white.length}%` }}><span className="absolute bottom-2 inset-x-0 text-center text-[11px] text-zinc-500 uppercase">{KB[n] ?? ''}</span></button>)}
        {black.map((n) => <button key={n} type="button" onPointerDown={() => press(n)} aria-label={`${KEYS[n % 12]}${4 + Math.floor(n / 12)}`} className={cn('absolute top-0 z-10 h-[60%] rounded-b-md transition-colors duration-75', down === n ? 'bg-pink-500' : 'bg-zinc-900')} style={{ left: `${((wx(n - 1) + 1) / white.length) * 100 - 100 / white.length / 3}%`, width: `${(100 / white.length) * 0.66}%` }} />)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn on={!!rec} onClick={() => { if (rec) { setTune(rec); setRec(null); toast.success(`${rec.length} notes kept`); } else { setRec([]); t0.current = performance.now(); } }}>{rec ? 'Stop recording' : 'Record a tune'}</Btn>
        <Btn onClick={() => tune.forEach(([n, ms]) => play(n, ms / 1000))}><Play className="w-3.5 h-3.5" aria-hidden />Play it back ({tune.length})</Btn>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">On a keyboard: A W S E D F T G Y H U J K O L P play the notes from C.</p>
    </div>
  );
}

/** Split a photo into a grid of tiles (for a post carousel or a puzzle); each tile saved as a PNG. */
function GridSplit() {
  const [img, setImg] = useState<HTMLImageElement | null>(null), [cols, setCols] = useState(3), [rows, setRows] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const tiles = useMemo(() => {
    if (!img) return [];
    const w = Math.floor(img.naturalWidth / cols), h = Math.floor(img.naturalHeight / rows);
    return Array.from({ length: rows * cols }, (_, k) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(img, (k % cols) * w, Math.floor(k / cols) * h, w, h, 0, 0, w, h); return c.toDataURL('image/png'); });
  }, [img, cols, rows]);
  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Choose a picture" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { setImg(await loadImage(f)); } catch (x) { toast.error((x as Error).message); } } }} />
      <div className="flex flex-wrap items-end gap-2"><button type="button" onClick={() => fileRef.current?.click()} className="btn-primary btn-sm"><ImagePlus className="w-4 h-4" aria-hidden />{img ? 'Another picture' : 'Choose a picture'}</button>
        <Segments label="Across" value={String(cols) as '2' | '3' | '4'} onChange={(v) => setCols(+v)} options={[['2', '2 across'], ['3', '3 across'], ['4', '4 across']] as const} />
        <Segments label="Down" value={String(rows) as '1' | '2' | '3'} onChange={(v) => setRows(+v)} options={[['1', '1 down'], ['2', '2 down'], ['3', '3 down']] as const} />
        {tiles.length > 0 && <Btn onClick={() => tiles.forEach((u, i) => setTimeout(() => { const a = document.createElement('a'); a.href = u; a.download = `tile-${i + 1}.png`; a.click(); }, i * 250))}><Download className="w-3.5 h-3.5" aria-hidden />Save all {tiles.length}</Btn>}
      </div>
      {tiles.length > 0 && <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{tiles.map((u, i) => <a key={i} href={u} download={`tile-${i + 1}.png`} className="relative block rounded-md overflow-hidden ring-1 ring-black/10 hover:ring-pink-500"><span className="block w-full bg-cover bg-center" style={{ backgroundImage: `url(${u})`, aspectRatio: img ? `${img.naturalWidth / cols} / ${img.naturalHeight / rows}` : undefined }} role="img" aria-label={`Tile ${i + 1}`} /><span className="absolute top-1 start-1 rounded bg-black/60 px-1.5 text-xs text-white tabular-nums">{i + 1}</span></a>)}</div>}
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Post the tiles in order (1 first) so they line up. Tap a tile to save just that one.</p>
    </div>
  );
}
