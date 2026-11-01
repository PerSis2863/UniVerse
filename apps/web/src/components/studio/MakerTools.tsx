'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Eraser, FlipHorizontal, ImagePlus, Loader2, Maximize2, Pause, Play, Plus, Printer, RotateCcw, Trash2, Undo2, Video } from 'lucide-react';
import { code128, spiral, wordFreq } from '@/lib/big-tools';
import { cn } from '@/lib/utils';
import { Btn, Field, area, save } from './QuickTools';
import { BRANCH } from './PlanTools';
import { printOnly, uid, useKept } from './kept';

// Collaborate → Create → Make (M72): a CV builder, word clouds, a teleprompter, a code playground,
// barcodes, redacting pictures, slideshow videos and a signature pad. All on this device.

export type MakerId = 'cv' | 'cloud' | 'prompter' | 'playground' | 'barcode' | 'redact' | 'slideshow' | 'signature';

export function MakerTool({ id }: { id: MakerId }) {
  const T = { cv: Cv, cloud: Cloud, prompter: Prompter, playground: Playground, barcode: Barcode, redact: Redact, slideshow: Slideshow, signature: Signature }[id];
  return <T />;
}

const loadImage = (f: File) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(`“${f.name}” isn’t a picture this browser can open.`)); i.src = URL.createObjectURL(f); });

interface Job { id: string; role: string; org: string; when: string; points: string }
/** CV builder: fill it in, see the page, print it or save it as a PDF. */
function Cv() {
  const [c, setC] = useKept('uv-cv', () => ({
    look: 'modern' as 'modern' | 'classic', name: 'Your Name', title: 'Student · Aspiring designer', contact: 'you@example.com · City', summary: 'A short line about who you are and what you want to do next.',
    jobs: [{ id: uid(), role: 'Volunteer', org: 'Community library', when: '2025 – now', points: 'Ran weekly reading sessions for 20 children\nBuilt the volunteer rota' }] as Job[],
    school: [{ id: uid(), role: 'Grade 12', org: 'Your school', when: '2023 – 2026', points: 'Science stream · 92%' }] as Job[],
    skills: 'Figma, Python, Public speaking, Hindi, English',
  }));
  const set = (p: Partial<typeof c>) => setC({ ...c, ...p });
  const list = (k: 'jobs' | 'school', label: string) => (
    <fieldset className="space-y-2">
      <legend className="text-sm font-bold text-zinc-900 dark:text-white">{label}</legend>
      {c[k].map((j) => (
        <div key={j.id} className="rounded-xl ring-1 ring-zinc-200 dark:ring-white/10 p-2 grid gap-2 sm:grid-cols-3">
          <input className="input" aria-label="Role" value={j.role} onChange={(e) => set({ [k]: c[k].map((x) => (x.id === j.id ? { ...x, role: e.target.value } : x)) })} placeholder="Role" />
          <input className="input" aria-label="Where" value={j.org} onChange={(e) => set({ [k]: c[k].map((x) => (x.id === j.id ? { ...x, org: e.target.value } : x)) })} placeholder="Where" />
          <div className="flex gap-1"><input className="input" aria-label="When" value={j.when} onChange={(e) => set({ [k]: c[k].map((x) => (x.id === j.id ? { ...x, when: e.target.value } : x)) })} placeholder="When" />
            <button type="button" onClick={() => set({ [k]: c[k].filter((x) => x.id !== j.id) })} aria-label={`Remove ${j.role}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button></div>
          <textarea className="input sm:col-span-3 min-h-[60px]" aria-label="What you did, one a line" value={j.points} onChange={(e) => set({ [k]: c[k].map((x) => (x.id === j.id ? { ...x, points: e.target.value } : x)) })} placeholder="What you did, one a line" />
        </div>
      ))}
      <Btn onClick={() => set({ [k]: [...c[k], { id: uid(), role: '', org: '', when: '', points: '' }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add</Btn>
    </fieldset>
  );
  const entries = (k: 'jobs' | 'school', label: string, modern: boolean) => c[k].length > 0 && (
    <section className="space-y-2">
      <h3 className={cn('text-xs font-bold uppercase tracking-wider', modern ? 'text-[#533ff6]' : 'border-b border-zinc-900 pb-0.5')}>{label}</h3>
      {c[k].map((j) => (
        <div key={j.id}>
          <p className="flex justify-between gap-2 text-sm"><span><b>{j.role}</b>{j.org && ` · ${j.org}`}</span><span className="text-[#4b5068] whitespace-nowrap">{j.when}</span></p>
          {j.points.trim() && <ul className="mt-0.5 list-disc ps-5 text-[13px] leading-snug">{j.points.split('\n').filter((p) => p.trim()).map((p, i) => <li key={i}>{p}</li>)}</ul>}
        </div>
      ))}
    </section>
  );
  const modern = c.look === 'modern', skills = c.skills.split(',').map((s) => s.trim()).filter(Boolean);
  return (
    <div className="grid gap-5 2xl:grid-cols-2">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2"><Btn on={modern} onClick={() => set({ look: 'modern' })}>Modern</Btn><Btn on={!modern} onClick={() => set({ look: 'classic' })}>Classic</Btn><Btn onClick={() => printOnly('cv-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print or save as PDF</Btn></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Name"><input className="input" value={c.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Headline"><input className="input" value={c.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        </div>
        <Field label="Contact (email, phone, city, links)"><input className="input" value={c.contact} onChange={(e) => set({ contact: e.target.value })} /></Field>
        <Field label="About you"><textarea className="input min-h-[70px]" value={c.summary} onChange={(e) => set({ summary: e.target.value })} /></Field>
        {list('jobs', 'Experience')}
        {list('school', 'Education')}
        <Field label="Skills (split by commas)"><input className="input" value={c.skills} onChange={(e) => set({ skills: e.target.value })} /></Field>
      </div>
      <div tabIndex={0} role="region" aria-label="CV preview" className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-pink-500">
        <article id="cv-sheet" className={cn('min-w-[560px] bg-white text-zinc-900 rounded-2xl ring-1 ring-black/10 shadow-sm aspect-[1/1.414] overflow-hidden', modern ? 'grid grid-cols-[34%_1fr]' : 'p-10 font-serif')} translate="no">
          {modern ? (
            <>
              <aside className="bg-[#171f44] text-white p-6 space-y-5">
                <div><h2 className="text-2xl font-bold leading-tight">{c.name}</h2><p className="mt-1 text-sm text-pink-200">{c.title}</p></div>
                <p className="text-xs leading-relaxed break-words text-zinc-100">{c.contact}</p>
                {skills.length > 0 && <div><h3 className="text-xs font-bold uppercase tracking-wider text-[#74ffed]">Skills</h3><ul className="mt-2 flex flex-wrap gap-1">{skills.map((s) => <li key={s} className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{s}</li>)}</ul></div>}
              </aside>
              <div className="p-6 space-y-4">
                {c.summary && <p className="text-sm leading-relaxed text-zinc-700">{c.summary}</p>}
                {entries('jobs', 'Experience', true)}
                {entries('school', 'Education', true)}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <header className="text-center"><h2 className="text-3xl font-bold">{c.name}</h2><p className="text-sm">{c.title}</p><p className="mt-1 text-xs text-[#4b5068]">{c.contact}</p></header>
              {c.summary && <p className="text-sm leading-relaxed">{c.summary}</p>}
              {entries('jobs', 'Experience', false)}
              {entries('school', 'Education', false)}
              {skills.length > 0 && <section><h3 className="text-xs font-bold uppercase tracking-wider border-b border-zinc-900 pb-0.5">Skills</h3><p className="mt-1 text-sm">{skills.join(' · ')}</p></section>}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

const CLOUD_LOOKS = [{ name: 'Night', bg: '#171f44', ink: ['#fe81d1', '#74ffed', '#ffffff', '#c4b5fd', '#fbcfe8'] }, { name: 'Paper', bg: '#ffffff', ink: BRANCH }, { name: 'Pink', bg: '#fdf2f8', ink: ['#831843', '#be185d', '#533ff6', '#171f44'] }];
/** Word cloud: the most used words, bigger the more they appear. */
function Cloud() {
  const [t, setT] = useKept('uv-cloud', 'Collaborate with classmates, share ideas, plan projects, write documents, present slides, and learn together. Ideas grow when people share them. Learn, share, plan, create.');
  const [look, setLook] = useState(0), [max, setMax] = useState(50);
  const ref = useRef<HTMLCanvasElement>(null);
  const words = useMemo(() => wordFreq(t, max), [t, max]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = 1200, H = 700, g = c.getContext('2d')!, L = CLOUD_LOOKS[look]; c.width = W; c.height = H;
    g.fillStyle = L.bg; g.fillRect(0, 0, W, H);
    if (!words.length) return;
    const top = words[0][1], low = words[words.length - 1][1];
    const size = (n: number) => 22 + (top === low ? 40 : ((n - low) / (top - low)) * 90);
    const boxes = words.map(([w, n]) => { g.font = `800 ${size(n)}px Urbanist, system-ui, sans-serif`; return { w: g.measureText(w).width + 8, h: size(n) * 0.95 }; });
    const at = spiral(boxes, W, H);
    g.textBaseline = 'top';
    words.forEach(([w, n], k) => { const p = at[k]; if (!p) return; g.font = `800 ${size(n)}px Urbanist, system-ui, sans-serif`; g.fillStyle = L.ink[k % L.ink.length]; g.fillText(w, p.x + 4, p.y + size(n) * 0.04); });
  }, [words, look]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        <Field label="Your text"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
        <div className="space-y-2">
          <Field label={`Words: ${max}`}><input type="range" min={10} max={120} value={max} onChange={(e) => setMax(+e.target.value)} className="w-full accent-pink-500" /></Field>
          <div className="flex flex-wrap gap-2">{CLOUD_LOOKS.map((l, k) => <Btn key={l.name} on={look === k} onClick={() => setLook(k)}>{l.name}</Btn>)}</div>
          <Btn onClick={() => ref.current?.toBlob((b) => b && save('word-cloud.png', b, 'image/png'))}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn>
        </div>
      </div>
      <canvas ref={ref} role="img" aria-label={`Word cloud: ${words.slice(0, 10).map(([w]) => w).join(', ')}`} className="w-full rounded-xl ring-1 ring-black/10" />
    </div>
  );
}

/** Teleprompter: the script scrolls by itself, big and steady, for talks and videos. */
function Prompter() {
  const [t, setT] = useKept('uv-prompter', 'Good morning, everyone.\n\nToday I want to tell you about our project, what we learned, and what we will do next.\n\nFirst, the problem we chose…');
  const [speed, setSpeed] = useKept('uv-prompter-speed', 40), [size, setSize] = useKept('uv-prompter-size', 56), [mirror, setMirror] = useState(false);
  const [open, setOpen] = useState(false), [paused, setPaused] = useState(false);
  const box = useRef<HTMLDivElement>(null), text = useRef<HTMLDivElement>(null), y = useRef(0), live = useRef({ speed, paused });
  useEffect(() => { live.current = { speed, paused }; }, [speed, paused]);
  useEffect(() => {
    if (!open) return;
    y.current = 0; let raf = 0, last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      if (!live.current.paused) y.current += live.current.speed * dt;
      const el = text.current, max = el ? el.scrollHeight : 0;
      if (y.current > max) y.current = max;
      if (el) el.style.transform = `translate3d(0, ${-y.current}px, 0)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    void box.current?.requestFullscreen?.().catch(() => {});
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'ArrowUp') setSpeed((s) => Math.min(200, s + 10));
      else if (e.key === 'ArrowDown') setSpeed((s) => Math.max(5, s - 10));
      else if (e.key === 'ArrowLeft') y.current = Math.max(0, y.current - 120);
    };
    window.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); };
  }, [open, setSpeed]);
  useEffect(() => { const h = () => { if (!document.fullscreenElement) setOpen(false); }; document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h); }, []);
  const words = t.split(/\s+/).filter(Boolean).length;
  return (
    <div className="space-y-3">
      <Field label="Your script"><textarea className={cn(area, 'min-h-[240px] font-sans text-base')} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">Speed<input type="range" min={5} max={200} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="accent-pink-500" /></label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">Size<input type="range" min={28} max={110} value={size} onChange={(e) => setSize(+e.target.value)} className="accent-pink-500" /></label>
        <Btn on={mirror} onClick={() => setMirror(!mirror)}><FlipHorizontal className="w-3.5 h-3.5" aria-hidden />Mirror (for glass)</Btn>
        <button type="button" onClick={() => { setPaused(false); setOpen(true); }} className="btn-primary"><Maximize2 className="w-4 h-4" aria-hidden />Start</button>
        <span className="text-xs text-zinc-600 dark:text-zinc-300 tabular-nums">{words} words · about {Math.max(1, Math.round(words / 130))} min spoken</span>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">While it runs: Space pauses, ↑ ↓ change the speed, ← goes back a little, Esc stops.</p>
      {open && (
        <div ref={box} className="fixed inset-0 z-[80] bg-black text-white overflow-hidden" role="dialog" aria-modal="true" aria-label="Teleprompter">
          <div className="absolute inset-x-0 top-[38%] h-px bg-pink-500/60" aria-hidden />
          <div className="h-full pt-[38vh]" style={{ transform: mirror ? 'scaleX(-1)' : undefined }}>
            <div ref={text} className="mx-auto max-w-4xl px-8 font-bold leading-[1.35] whitespace-pre-wrap will-change-transform" style={{ fontSize: size }} translate="no">{t}<div className="h-[60vh]" /></div>
          </div>
          <div className="absolute bottom-4 inset-x-0 flex justify-center gap-2">
            <button type="button" onClick={() => setPaused(!paused)} className="btn-secondary">{paused ? <Play className="w-4 h-4" aria-hidden /> : <Pause className="w-4 h-4" aria-hidden />}{paused ? 'Go on' : 'Pause'}</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Stop</button>
          </div>
        </div>
      )}
    </div>
  );
}

const STARTERS: Record<string, { html: string; css: string; js: string }> = {
  'Bouncing ball': { html: '<canvas id="c" width="400" height="260"></canvas>\n<p>Click to change colour</p>', css: 'body { font-family: system-ui; display: grid; place-items: center; background: #171f44; color: #fff; }\ncanvas { background: #0a0f2b; border-radius: 16px; }', js: "const c = document.getElementById('c'), g = c.getContext('2d');\nlet x = 60, y = 60, dx = 3, dy = 2, col = '#fe81d1';\nconsole.log('Running: click the box to change colour');\nc.addEventListener('click', () => { col = col === '#fe81d1' ? '#74ffed' : '#fe81d1'; console.log('colour', col); });\n(function loop() {\n  g.clearRect(0, 0, 400, 260);\n  g.fillStyle = col; g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill();\n  if (x < 18 || x > 382) dx = -dx;\n  if (y < 18 || y > 242) dy = -dy;\n  x += dx; y += dy;\n  requestAnimationFrame(loop);\n})();" },
  'To-do list': { html: '<h1>My list</h1>\n<form id="f"><input id="t" placeholder="Something to do"><button>Add</button></form>\n<ul id="l"></ul>', css: 'body { font-family: system-ui; max-width: 420px; margin: 24px auto; }\nli { padding: 6px 0; cursor: pointer; }\nli.done { text-decoration: line-through; color: #888; }', js: "const f = document.getElementById('f'), t = document.getElementById('t'), l = document.getElementById('l');\nf.addEventListener('submit', (e) => {\n  e.preventDefault();\n  if (!t.value.trim()) return;\n  const li = document.createElement('li');\n  li.textContent = t.value;\n  li.addEventListener('click', () => li.classList.toggle('done'));\n  l.append(li); t.value = '';\n  console.log('added', li.textContent);\n});" },
  Blank: { html: '<h1>Hello!</h1>', css: 'body { font-family: system-ui; }', js: "console.log('Ready');" },
};
/** Code playground: HTML, CSS and JavaScript with a live page beside them (like CodePen). */
function Playground() {
  const [code, setCode] = useKept('uv-playground', () => STARTERS['Bouncing ball']);
  const [tab, setTab] = useState<'html' | 'css' | 'js'>('js');
  const [doc, setDoc] = useState(''), [logs, setLogs] = useState<{ kind: string; text: string }[]>([]), [run, setRun] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  // The page is rebuilt a moment after typing stops. It runs in a sandbox with no access to this site.
  useEffect(() => {
    const t = setTimeout(() => {
      const hook = `<script>(()=>{const s=(k,a)=>parent.postMessage({uvPlay:1,kind:k,text:a.map(v=>{try{return typeof v==='string'?v:JSON.stringify(v)}catch{return String(v)}}).join(' ')},'*');for(const k of ['log','info','warn','error'])console[k]=(...a)=>s(k,a);addEventListener('error',e=>s('error',[e.message+' (line '+e.lineno+')']));addEventListener('unhandledrejection',e=>s('error',[String(e.reason)]));})()<\/script>`;
      setDoc(`<!doctype html><html><head><meta charset="utf-8">${hook}<style>${code.css}</style></head><body>${code.html}<script>${code.js.replace(/<\/script/gi, '<\\/script')}<\/script></body></html>`);
      setLogs([]);
    }, 450);
    return () => clearTimeout(t);
  }, [code, run]);
  useEffect(() => {
    const h = (e: MessageEvent) => { const d = e.data as { uvPlay?: number; kind: string; text: string }; if (e.source === frame.current?.contentWindow && d?.uvPlay) setLogs((l) => [...l.slice(-199), { kind: d.kind, text: String(d.text).slice(0, 2000) }]); };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);
  const tabs = [['html', 'HTML'], ['css', 'CSS'], ['js', 'JavaScript']] as const;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="ios-segmented" role="tablist" aria-label="Language">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('ios-segment', tab === k && 'font-bold')}>{tab === k && <span className="ios-segment-thumb" aria-hidden />}{l}</button>)}</div>
        <Btn onClick={() => setRun(run + 1)}><Play className="w-3.5 h-3.5" aria-hidden />Run again</Btn>
        <select className="input w-auto! py-1.5 text-sm" aria-label="Start from" value="" onChange={(e) => { const s = STARTERS[e.target.value]; if (s && window.confirm('Replace your code with this example?')) setCode(s); }}>
          <option value="">Start from an example…</option>{Object.keys(STARTERS).map((k) => <option key={k}>{k}</option>)}
        </select>
        <Btn onClick={() => save('page.html', doc.replace(/<script>\(\(\)=>\{const s=.*?<\/script>/, ''), 'text/html')}><Download className="w-3.5 h-3.5" aria-hidden />Save as .html</Btn>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <textarea aria-label={`${tab.toUpperCase()} code`} spellCheck={false} value={code[tab]} onChange={(e) => setCode({ ...code, [tab]: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const el = e.currentTarget, s = el.selectionStart, v = el.value; setCode({ ...code, [tab]: `${v.slice(0, s)}  ${v.slice(el.selectionEnd)}` }); requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2)); } }}
          className="input min-h-[360px] font-mono text-[13px] leading-relaxed resize-y bg-zinc-950 text-zinc-100 dark:bg-black/40" />
        <div className="space-y-2">
          <iframe ref={frame} title="Your page" sandbox="allow-scripts allow-modals" srcDoc={doc} className="w-full h-[260px] rounded-xl bg-white ring-1 ring-black/10" />
          <div className="h-[92px] overflow-auto rounded-xl bg-zinc-950 p-2 font-mono text-xs" role="log" aria-label="Console">
            {logs.length ? logs.map((l, k) => <p key={k} className={cn(l.kind === 'error' ? 'text-rose-300' : l.kind === 'warn' ? 'text-amber-200' : 'text-zinc-200')}>{l.kind === 'error' ? '✕ ' : '› '}{l.text}</p>) : <p className="text-zinc-400">console.log appears here</p>}
          </div>
        </div>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Your page runs in a closed box: it can&rsquo;t reach this site or your account. Use addEventListener rather than onclick=&hellip; attributes.</p>
    </div>
  );
}

/** Barcode maker (Code 128): any text or number as bars that shop scanners read. */
function Barcode() {
  const [t, setT] = useState('UNIVERSE-2026'), [h, setH] = useState(90), [w, setW] = useState(2), [label, setLabel] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const bars = useMemo(() => { try { return { widths: code128(t) }; } catch (e) { return { err: (e as Error).message }; } }, [t]);
  const total = bars.widths ? bars.widths.reduce((a, b) => a + b, 0) : 0, Q = 10 * w, W = total * w + Q * 2, H = h + (label ? 26 : 0) + 20;
  let x = Q;
  const rects = bars.widths?.map((bw, k) => { const r = k % 2 === 0 ? <rect key={k} x={x} y={10} width={bw * w} height={h} fill="#000" /> : null; x += bw * w; return r; });
  const png = () => { const svg = svgRef.current; if (!svg) return; const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); c.toBlob((b) => b && save('barcode.png', b, 'image/png')); }; img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`; };
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_140px_140px]">
        <Field label="Text or number"><input className={cn('input font-mono', bars.err && 'ring-2 ring-rose-500')} value={t} onChange={(e) => setT(e.target.value.slice(0, 48))} aria-invalid={!!bars.err} /></Field>
        <Field label={`Height: ${h}`}><input type="range" min={40} max={180} value={h} onChange={(e) => setH(+e.target.value)} className="w-full accent-pink-500" /></Field>
        <Field label={`Bar width: ${w}`}><input type="range" min={1} max={4} value={w} onChange={(e) => setW(+e.target.value)} className="w-full accent-pink-500" /></Field>
      </div>
      {bars.err ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{bars.err}</p> : (
        <div tabIndex={0} role="region" aria-label="Barcode picture" className="relative rounded-xl bg-white ring-1 ring-black/10 p-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-pink-500">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Barcode for ${t}`} className="mx-auto block">
            <rect width={W} height={H} fill="#fff" />{rects}
            {label && <text x={W / 2} y={h + 32} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={16} fill="#000">{t}</text>}
          </svg>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Btn on={label} onClick={() => setLabel(!label)}>Text under the bars</Btn>
        <Btn onClick={png}><Download className="w-3.5 h-3.5" aria-hidden />Save PNG</Btn>
        <Btn onClick={() => svgRef.current && save('barcode.svg', new XMLSerializer().serializeToString(svgRef.current), 'image/svg+xml')}><Download className="w-3.5 h-3.5" aria-hidden />Save SVG</Btn>
      </div>
    </div>
  );
}

type Box = { x: number; y: number; w: number; h: number; kind: 'blur' | 'pixel' | 'black' };
/** Redact a picture: hide faces, names and numbers with blur, pixels or a black box. */
function Redact() {
  const [img, setImg] = useState<HTMLImageElement | null>(null), [boxes, setBoxes] = useState<Box[]>([]), [kind, setKind] = useState<Box['kind']>('pixel');
  const ref = useRef<HTMLCanvasElement>(null), start = useRef<{ x: number; y: number } | null>(null), [draft, setDraft] = useState<Box | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || !img) return;
    const g = c.getContext('2d')!; c.width = img.naturalWidth; c.height = img.naturalHeight;
    g.drawImage(img, 0, 0);
    for (const b of [...boxes, ...(draft ? [draft] : [])]) {
      const x = Math.round(Math.min(b.x, b.x + b.w)), y = Math.round(Math.min(b.y, b.y + b.h)), w = Math.round(Math.abs(b.w)), h = Math.round(Math.abs(b.h));
      if (w < 2 || h < 2) continue;
      if (b.kind === 'black') { g.fillStyle = '#000'; g.fillRect(x, y, w, h); continue; }
      const cell = Math.max(6, Math.round(Math.max(c.width, c.height) / (b.kind === 'pixel' ? 60 : 140)));
      const tmp = document.createElement('canvas'); tmp.width = Math.max(1, Math.ceil(w / cell)); tmp.height = Math.max(1, Math.ceil(h / cell));
      const tg = tmp.getContext('2d')!; tg.drawImage(c, x, y, w, h, 0, 0, tmp.width, tmp.height);
      g.save(); g.imageSmoothingEnabled = b.kind === 'blur'; g.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h); g.restore();
    }
  }, [img, boxes, draft]);
  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(), c = e.currentTarget; return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }; };
  const open = async (f?: File) => { if (!f) return; try { setImg(await loadImage(f)); setBoxes([]); } catch (e) { toast.error((e as Error).message); } };
  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Choose a picture" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-primary btn-sm"><ImagePlus className="w-4 h-4" aria-hidden />{img ? 'Another picture' : 'Open a picture'}</button>
        {(['pixel', 'blur', 'black'] as const).map((k) => <Btn key={k} on={kind === k} onClick={() => setKind(k)}>{{ pixel: 'Pixels', blur: 'Blur', black: 'Black box' }[k]}</Btn>)}
        <Btn onClick={() => setBoxes(boxes.slice(0, -1))}><Undo2 className="w-3.5 h-3.5" aria-hidden />Undo</Btn>
        <Btn onClick={() => ref.current?.toBlob((b) => b && save('redacted.png', b, 'image/png'))}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn>
      </div>
      {img ? (
        <canvas ref={ref} role="img" aria-label={`The picture with ${boxes.length} hidden areas. Drag over a part to hide it.`} className="max-w-full max-h-[600px] mx-auto rounded-xl ring-1 ring-black/10 touch-none cursor-crosshair"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = pt(e); }}
          onPointerMove={(e) => { const s = start.current; if (!s) return; const p = pt(e); setDraft({ x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y, kind }); }}
          onPointerUp={() => { if (draft) setBoxes([...boxes, draft]); setDraft(null); start.current = null; }} />
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-56 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-white/15 grid place-items-center text-sm text-zinc-600 dark:text-zinc-300">Open a screenshot or photo, then drag over what to hide.</button>
      )}
      <p className="text-xs text-zinc-600 dark:text-zinc-300">The saved picture is a new file: what&rsquo;s hidden can&rsquo;t be uncovered. Black boxes are the safest for text.</p>
    </div>
  );
}

/** Slideshow video: pictures into a video with soft fades and an optional title. */
function Slideshow() {
  const [imgs, setImgs] = useState<{ id: string; img: HTMLImageElement; name: string }[]>([]);
  const [secs, setSecs] = useState(2.5), [title, setTitle] = useState(''), [fit, setFit] = useState<'fill' | 'fit'>('fill');
  const [busy, setBusy] = useState(0), [out, setOut] = useState<{ url: string; ext: string } | null>(null);
  const ref = useRef<HTMLCanvasElement>(null), fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);
  const frame = useCallback((t: number) => {
    const draw = (g: CanvasRenderingContext2D, img: HTMLImageElement, alpha: number, zoom: number) => {
      const W = 1280, H = 720, s = (fit === 'fill' ? Math.max : Math.min)(W / img.naturalWidth, H / img.naturalHeight) * zoom, w = img.naturalWidth * s, h = img.naturalHeight * s;
      g.globalAlpha = alpha; g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); g.globalAlpha = 1;
    };
    const g = ref.current?.getContext('2d'); if (!g || !imgs.length) return;
    const k = Math.min(imgs.length - 1, Math.floor(t / secs)), local = t - k * secs, fade = Math.min(0.6, secs / 3);
    g.fillStyle = '#000'; g.fillRect(0, 0, 1280, 720);
    if (k > 0 && local < fade) draw(g, imgs[k - 1].img, 1, 1.06);
    draw(g, imgs[k].img, k > 0 && local < fade ? local / fade : 1, 1 + 0.06 * (local / secs));
    if (title && t < secs) { g.globalAlpha = Math.min(1, (secs - t) / 0.5); g.fillStyle = 'rgba(10,15,43,0.55)'; g.fillRect(0, 560, 1280, 120); g.fillStyle = '#fff'; g.font = '700 54px Urbanist, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(title, 640, 638); g.textAlign = 'start'; g.globalAlpha = 1; }
  }, [imgs, secs, title, fit]);
  // The first picture as a preview (not while a video is being made: that draws its own frames).
  useEffect(() => { if (!busy) frame(0); }, [frame, busy]);
  const record = async () => {
    const c = ref.current; if (!c || !imgs.length || busy) return;
    if (typeof MediaRecorder === 'undefined' || !c.captureStream) return toast.error('This browser can’t make videos here.');
    const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: type || undefined, videoBitsPerSecond: 5_000_000 }), parts: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const done = new Promise<void>((ok) => { rec.onstop = () => ok(); });
    const total = imgs.length * secs, t0 = performance.now();
    setOut(null); rec.start(); setBusy(0.01);
    await new Promise<void>((ok) => { const step = () => { const t = (performance.now() - t0) / 1000; frame(Math.min(t, total - 0.001)); setBusy(Math.max(0.01, t / total)); if (t < total) requestAnimationFrame(step); else ok(); }; requestAnimationFrame(step); });
    rec.stop(); await done; setBusy(0);
    const mime = type.split(';')[0] || 'video/webm';
    setOut({ url: URL.createObjectURL(new Blob(parts, { type: mime })), ext: mime === 'video/mp4' ? 'mp4' : 'webm' });
  };
  const add = async (fs: File[]) => { const out = []; for (const f of fs) { try { out.push({ id: uid(), img: await loadImage(f), name: f.name }); } catch (e) { toast.error((e as Error).message); } } setImgs((x) => [...x, ...out].slice(0, 40)); };
  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label="Choose pictures" onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-primary btn-sm"><ImagePlus className="w-4 h-4" aria-hidden />Add pictures</button>
        <Field label={`Seconds each: ${secs}`}><input type="range" min={1} max={8} step={0.5} value={secs} onChange={(e) => setSecs(+e.target.value)} className="accent-pink-500" /></Field>
        <Field label="Title on the first picture"><input className="input" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 40))} /></Field>
        <Btn on={fit === 'fill'} onClick={() => setFit('fill')}>Fill</Btn><Btn on={fit === 'fit'} onClick={() => setFit('fit')}>Fit</Btn>
      </div>
      {imgs.length > 0 && (
        <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Pictures in order">
          {imgs.map((p, k) => (
            <li key={p.id} className="relative shrink-0">
              {/* A canvas thumbnail would cost more; the object URL is on this device. */}
              <span className="block w-24 h-14 rounded-lg bg-cover bg-center ring-1 ring-black/10" style={{ backgroundImage: `url(${p.img.src})` }} role="img" aria-label={`${k + 1}: ${p.name}`} />
              <span className="absolute top-0.5 start-0.5 rounded bg-black/60 px-1 text-[11px] text-white tabular-nums">{k + 1}</span>
              <span className="absolute top-0.5 end-0.5 flex gap-0.5">
                {k > 0 && <button type="button" onClick={() => setImgs(imgs.map((x, j) => (j === k - 1 ? imgs[k] : j === k ? imgs[k - 1] : x)))} aria-label={`Move ${p.name} earlier`} className="rounded bg-black/60 px-1 text-[11px] text-white">‹</button>}
                <button type="button" onClick={() => setImgs(imgs.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`} className="rounded bg-black/60 px-1 text-[11px] text-white">×</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <canvas ref={ref} width={1280} height={720} role="img" aria-label="Video preview" className="w-full rounded-xl bg-black ring-1 ring-black/10 aspect-video" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void record()} disabled={!imgs.length || !!busy} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Video className="w-4 h-4" aria-hidden />}{busy ? `Making… ${Math.round(busy * 100)}%` : `Make the video (${(imgs.length * secs).toFixed(0)} s)`}</button>
        {out && <a href={out.url} download={`slideshow.${out.ext}`} className="btn-secondary btn-sm"><Download className="w-4 h-4" aria-hidden />Save the video</a>}
        {imgs.length > 0 && <Btn onClick={() => setImgs([])}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Clear</Btn>}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">The video plays as it&rsquo;s made, so keep this tab open until it finishes.</p>
    </div>
  );
}

type Pt = { x: number; y: number; w: number };
const INKS = [['Black', '#111111'], ['Navy', '#171f44'], ['Blue', '#1d4ed8']] as const;
/** Signature pad: sign with a finger, pen or mouse; save it as a see-through PNG. */
function Signature() {
  const ref = useRef<HTMLCanvasElement>(null), strokes = useRef<Pt[][]>([]), cur = useRef<Pt[] | null>(null), last = useRef({ t: 0, x: 0, y: 0 });
  const [ink, setInk] = useState<string>(INKS[0][1]), [count, setCount] = useState(0);
  const paint = useCallback(() => {
    const c = ref.current; if (!c) return; const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height); g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of [...strokes.current, ...(cur.current ? [cur.current] : [])]) {
      if (s.length < 2) { const p = s[0]; if (p) { g.beginPath(); g.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2); g.fill(); } continue; }
      // Smooth curves through the middles of the points; width follows the speed.
      for (let k = 1; k < s.length - 1; k++) {
        const a = s[k - 1], b = s[k], n = s[k + 1];
        g.lineWidth = b.w; g.beginPath(); g.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2); g.quadraticCurveTo(b.x, b.y, (b.x + n.x) / 2, (b.y + n.y) / 2); g.stroke();
      }
    }
  }, [ink]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const size = () => { const dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect(); if (c.width === Math.round(r.width * dpr) && c.height === Math.round(r.height * dpr)) return paint(); c.width = r.width * dpr; c.height = r.height * dpr; paint(); };
    size(); const ro = new ResizeObserver(size); ro.observe(c); return () => ro.disconnect();
  }, [paint]);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
    const dt = Math.max(1, e.timeStamp - last.current.t), v = Math.hypot(x - last.current.x, y - last.current.y) / dt;
    last.current = { t: e.timeStamp, x, y };
    const base = 3.2 * dpr, w = e.pointerType === 'pen' && e.pressure ? base * (0.5 + e.pressure) : Math.max(base * 0.45, Math.min(base * 1.3, base * 1.4 - v * 0.9));
    const prev = cur.current?.[cur.current.length - 1];
    return { x, y, w: prev ? prev.w * 0.6 + w * 0.4 : w };
  };
  const save2 = () => {
    const c = ref.current; if (!c || !strokes.current.length) return;
    const all = strokes.current.flat(), pad = 16, x0 = Math.max(0, Math.min(...all.map((p) => p.x)) - pad), y0 = Math.max(0, Math.min(...all.map((p) => p.y)) - pad);
    const x1 = Math.min(c.width, Math.max(...all.map((p) => p.x)) + pad), y1 = Math.min(c.height, Math.max(...all.map((p) => p.y)) + pad);
    const out = document.createElement('canvas'); out.width = x1 - x0; out.height = y1 - y0;
    out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    out.toBlob((b) => b && save('signature.png', b, 'image/png'));
  };
  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl bg-white ring-1 ring-black/10">
        <canvas ref={ref} className="w-full h-56 touch-none cursor-crosshair rounded-2xl" role="img" aria-label={count ? `Your signature, ${count} strokes` : 'Sign here'}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = { t: e.timeStamp, x: 0, y: 0 }; cur.current = []; const p = pos(e); cur.current = [{ ...p, w: 3.2 * (window.devicePixelRatio || 1) }]; paint(); }}
          onPointerMove={(e) => { if (!cur.current) return; cur.current.push(pos(e)); paint(); }}
          onPointerUp={() => { if (cur.current) { strokes.current.push(cur.current); cur.current = null; setCount(strokes.current.length); paint(); } }} />
        <div className="pointer-events-none absolute inset-x-8 bottom-12 border-b border-zinc-300" aria-hidden />
        <span className="pointer-events-none absolute start-8 bottom-14 text-zinc-400 text-xl" aria-hidden>×</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {INKS.map(([n, v]) => <Btn key={v} on={ink === v} onClick={() => setInk(v)}><span className="w-3 h-3 rounded-full" style={{ background: v }} aria-hidden />{n}</Btn>)}
        <Btn onClick={() => { strokes.current.pop(); setCount(strokes.current.length); paint(); }}><Undo2 className="w-3.5 h-3.5" aria-hidden />Undo</Btn>
        <Btn onClick={() => { strokes.current = []; setCount(0); paint(); }}><Eraser className="w-3.5 h-3.5" aria-hidden />Clear</Btn>
        <Btn onClick={save2}><Download className="w-3.5 h-3.5" aria-hidden />Save PNG (see-through)</Btn>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Add the saved signature to a PDF with Edit a PDF. Nothing leaves this device.</p>
    </div>
  );
}
