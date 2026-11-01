'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download, Square, Video } from 'lucide-react';
import { cleanText, columnStats, diffLines, palette, parseTable, tableAs, textStats, type Clean, type Harmony } from '@/lib/quick-tools';
import { markdownToHtml } from '@/lib/convert-formats';
import { encodeQr, qrPath } from '@/lib/qr';
import { cn } from '@/lib/utils';

// Collaborate → Create's small tools (M68, the owner: "15 more features… notes, word, pdf, sheets,
// presentation, canva, editing… vs code… and some more small features"). Each runs in the browser:
// nothing is sent anywhere. Logic in src/lib/quick-tools.ts (tested).

export type QuickId = 'words' | 'clean' | 'compare' | 'table' | 'colours' | 'gradient' | 'json' | 'regex' | 'markdown' | 'encode' | 'qr' | 'record';

export const area = 'input w-full min-h-[180px] font-mono text-sm leading-relaxed resize-y';
export const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success('Copied'); } catch { toast.error('Copy didn’t work here: select the text instead.'); } };
export const save = (name: string, data: BlobPart, type: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
export const Btn = ({ children, onClick, on }: { children: React.ReactNode; onClick: () => void; on?: boolean }) => (
  <button type="button" onClick={onClick} aria-pressed={on} className={cn('btn-secondary btn-sm', on && 'ring-2 ring-pink-500')}>{children}</button>
);
export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{label}</span><span className="mt-1 block">{children}</span></label>;
export const Out = ({ text, name }: { text: string; name?: string }) => (
  <div className="flex gap-2"><Btn onClick={() => void copy(text)}><Copy className="w-3.5 h-3.5" aria-hidden />Copy</Btn>{name && <Btn onClick={() => save(name, text, 'text/plain')}><Download className="w-3.5 h-3.5" aria-hidden />Download</Btn>}</div>
);

export function QuickTool({ id }: { id: QuickId }) {
  switch (id) {
    case 'words': return <Words />;
    case 'clean': return <CleanUp />;
    case 'compare': return <Compare />;
    case 'table': return <Table />;
    case 'colours': return <Colours />;
    case 'gradient': return <Gradient />;
    case 'json': return <Json />;
    case 'regex': return <Regex />;
    case 'markdown': return <Markdown />;
    case 'encode': return <Encode />;
    case 'qr': return <Qr />;
    case 'record': return <Recorder />;
  }
}

/** Word count and reading time (like Word's word count). */
function Words() {
  const [t, setT] = useState('');
  const s = useMemo(() => textStats(t), [t]);
  const mins = (m: number) => (m < 1 ? `${Math.max(0, Math.round(m * 60))} s` : `${Math.round(m)} min`);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <Field label="Your text"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} placeholder="Paste or type here" /></Field>
      <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-2 content-start text-sm">
        {[['Words', s.words], ['Characters', s.chars], ['Without spaces', s.charsNoSpaces], ['Sentences', s.sentences], ['Paragraphs', s.paragraphs], ['Reading', mins(s.readMin)], ['Speaking', mins(s.speakMin)]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2"><dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="font-mono tabular-nums text-zinc-900 dark:text-white">{typeof v === 'number' ? v.toLocaleString() : v}</dd></div>
        ))}
      </dl>
      {s.top.length > 0 && <p className="text-xs text-zinc-700 dark:text-zinc-200">Most used: {s.top.map(([w, n]) => `${w} (${n})`).join(', ')}</p>}
      </div>
    </div>
  );
}

/** Change case, tidy spaces, sort or de-duplicate lines. */
function CleanUp() {
  const [t, setT] = useState('');
  const ops: [Clean, string][] = [['upper', 'UPPER'], ['lower', 'lower'], ['title', 'Title Case'], ['sentence', 'Sentence case'], ['spaces', 'Tidy spaces'], ['blank', 'Remove empty lines'], ['dedupe', 'Remove repeats'], ['sort', 'Sort lines'], ['reverse', 'Reverse lines']];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">{ops.map(([op, l]) => <Btn key={op} onClick={() => setT((x) => cleanText(x, op))}>{l}</Btn>)}</div>
      <Field label="Text"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} placeholder="Paste text, then press a button" /></Field>
      <Out text={t} name="text.txt" />
    </div>
  );
}

/** Compare two versions line by line. */
function Compare() {
  const [a, setA] = useState(''), [b, setB] = useState('');
  const d = useMemo(() => (a || b ? diffLines(a, b) : []), [a, b]);
  const changed = d.filter((x) => x.op !== ' ').length;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Before"><textarea className={area} value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <Field label="After"><textarea className={area} value={b} onChange={(e) => setB(e.target.value)} /></Field>
      </div>
      {d.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 overflow-x-auto">
          <p className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">{changed ? `${changed} line${changed === 1 ? '' : 's'} changed` : 'The same'}</p>
          <pre className="text-sm font-mono">{d.map((x, i) => <div key={i} className={cn('px-3', x.op === '+' && 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200', x.op === '-' && 'bg-rose-500/15 text-rose-800 dark:text-rose-200 line-through')}>{x.op} {x.text}</div>)}</pre>
        </div>
      )}
    </div>
  );
}

/** Paste a table from a spreadsheet: totals per column, and CSV, JSON or Markdown. */
function Table() {
  const [t, setT] = useState('');
  const [to, setTo] = useState<'csv' | 'json' | 'markdown'>('csv');
  const rows = useMemo(() => parseTable(t), [t]);
  const stats = useMemo(() => columnStats(rows), [rows]);
  const out = useMemo(() => tableAs(rows, to), [rows, to]);
  const f = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <div className="space-y-3">
      <Field label="A table (copied from a spreadsheet, or CSV)"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} placeholder={'name\tscore\nAsha\t12'} /></Field>
      {stats.length > 0 && (
        <div className="overflow-x-auto"><table className="text-sm"><thead><tr className="text-start text-xs text-zinc-500 dark:text-zinc-400"><th className="pe-4 text-start">Column</th><th className="pe-4 text-end">Sum</th><th className="pe-4 text-end">Average</th><th className="pe-4 text-end">Smallest</th><th className="text-end">Largest</th></tr></thead>
          <tbody>{stats.map((s) => <tr key={s.name} className="font-mono tabular-nums"><td className="pe-4 font-sans">{s.name}</td><td className="pe-4 text-end">{f(s.sum)}</td><td className="pe-4 text-end">{f(s.avg)}</td><td className="pe-4 text-end">{f(s.min)}</td><td className="text-end">{f(s.max)}</td></tr>)}</tbody></table></div>
      )}
      <div className="flex flex-wrap gap-2">{(['csv', 'json', 'markdown'] as const).map((k) => <Btn key={k} on={to === k} onClick={() => setTo(k)}>{k.toUpperCase()}</Btn>)}</div>
      <textarea readOnly aria-label="Converted table" className={area} value={out} />
      <Out text={out} name={`table.${to === 'markdown' ? 'md' : to}`} />
    </div>
  );
}

/** Five colours that go together (like Canva's palettes), from a hue or a photo. */
function Colours() {
  const [hue, setHue] = useState(330);
  const [kind, setKind] = useState<Harmony>('analogous');
  const cols = palette(hue, kind);
  const fromPhoto = (file?: File) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d')!; g.drawImage(img, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data; let r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4; r /= n; gg /= n; b /= n;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), dd = mx - mn || 1;
      const h = mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
      setHue(Math.round(((h * 60) + 360) % 360)); URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['analogous', 'complementary', 'triadic', 'shades'] as Harmony[]).map((k) => <Btn key={k} on={kind === k} onClick={() => setKind(k)}>{k[0].toUpperCase() + k.slice(1)}</Btn>)}
        <label className="btn-secondary btn-sm cursor-pointer">From a photo<input type="file" accept="image/*" className="sr-only" onChange={(e) => fromPhoto(e.target.files?.[0])} /></label>
      </div>
      <Field label={`Starting colour (hue ${hue}°)`}><input type="range" min={0} max={359} value={hue} onChange={(e) => setHue(+e.target.value)} className="w-full accent-pink-500" /></Field>
      <ul className="grid grid-cols-5 gap-2">{cols.map((c) => <li key={c}><button type="button" onClick={() => void copy(c)} className="w-full rounded-xl overflow-hidden ring-1 ring-black/10 text-start"><span className="block h-20" style={{ background: c }} /><span className="block px-2 py-1 font-mono text-xs text-zinc-700 dark:text-zinc-200">{c}</span></button></li>)}</ul>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Tap a colour to copy it.</p>
    </div>
  );
}

/** A gradient for slides and designs, with its CSS. */
function Gradient() {
  const [a, setA] = useState('#fe81d1'), [b, setB] = useState('#74ffed'), [deg, setDeg] = useState(135);
  const css = `linear-gradient(${deg}deg, ${a}, ${b})`;
  const png = () => { const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d')!; const r = (deg - 90) * Math.PI / 180, dx = Math.cos(r) * 960, dy = Math.sin(r) * 540; const gr = g.createLinearGradient(960 - dx, 540 - dy, 960 + dx, 540 + dy); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, 1920, 1080); c.toBlob((bl) => bl && save('gradient.png', bl, 'image/png')); };
  return (
    <div className="space-y-3">
      <div className="h-40 rounded-2xl ring-1 ring-black/10" style={{ background: css }} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><input type="color" value={a} onChange={(e) => setA(e.target.value)} className="h-10 w-16" /></Field>
        <Field label="To"><input type="color" value={b} onChange={(e) => setB(e.target.value)} className="h-10 w-16" /></Field>
        <Field label={`Angle ${deg}°`}><input type="range" min={0} max={360} value={deg} onChange={(e) => setDeg(+e.target.value)} className="w-48 accent-pink-500" /></Field>
      </div>
      <code className="block rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm">background: {css};</code>
      <div className="flex gap-2"><Btn onClick={() => void copy(`background: ${css};`)}><Copy className="w-3.5 h-3.5" aria-hidden />Copy CSS</Btn><Btn onClick={png}><Download className="w-3.5 h-3.5" aria-hidden />Slide background (PNG)</Btn></div>
    </div>
  );
}

/** Tidy and check JSON (like a code editor's formatter). */
function Json() {
  const [t, setT] = useState('');
  let err = '';
  try { if (t.trim()) JSON.parse(t); } catch (e) { err = (e as Error).message; }
  return (
    <div className="space-y-3">
      <textarea aria-label="JSON" className={area} value={t} onChange={(e) => setT(e.target.value)} placeholder='{"hello": "world"}' spellCheck={false} />
      <p role="status" className={cn('text-sm', err ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300')}>{!t.trim() ? '' : err ? `Not valid: ${err}` : 'Valid JSON'}</p>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => { try { setT(JSON.stringify(JSON.parse(t), null, 2)); } catch { /* shown above */ } }}>Format</Btn>
        <Btn onClick={() => { try { setT(JSON.stringify(JSON.parse(t))); } catch { /* shown above */ } }}>Make one line</Btn>
        <Btn onClick={() => void copy(t)}><Copy className="w-3.5 h-3.5" aria-hidden />Copy</Btn>
      </div>
    </div>
  );
}

/** Try a regular expression on a text, with every match marked. */
function Regex() {
  const [src, setSrc] = useState('\\b\\w+@\\w+\\.\\w+\\b'), [flags, setFlags] = useState('g'), [t, setT] = useState('Write to asha@example.com or lee@school.org');
  let re: RegExp | null = null, err = '';
  try { re = new RegExp(src, flags.includes('g') ? flags : `${flags}g`); } catch (e) { err = (e as Error).message; }
  const parts: { s: string; hit: boolean }[] = [];
  let count = 0;
  if (re && src) {
    let last = 0;
    for (const m of t.matchAll(re)) { if (m.index === undefined || !m[0]) continue; parts.push({ s: t.slice(last, m.index), hit: false }, { s: m[0], hit: true }); last = m.index + m[0].length; if (++count > 500) break; }
    parts.push({ s: t.slice(last), hit: false });
  } else parts.push({ s: t, hit: false });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <Field label="Pattern"><input className="input font-mono" value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} /></Field>
        <Field label="Flags"><input className="input font-mono" value={flags} onChange={(e) => setFlags(e.target.value.replace(/[^gimsuy]/g, ''))} /></Field>
      </div>
      <Field label="Text"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">{err ? `Pattern problem: ${err}` : `${count} match${count === 1 ? '' : 'es'}`}</p>
      <pre className="whitespace-pre-wrap rounded-xl bg-zinc-100 dark:bg-white/[0.06] p-3 text-sm font-mono">{parts.map((p, i) => (p.hit ? <mark key={i} className="rounded bg-pink-300/70 text-zinc-900">{p.s}</mark> : <span key={i}>{p.s}</span>))}</pre>
    </div>
  );
}

/** Write Markdown, see it as a page (in a sandbox: nothing in it can run). */
function Markdown() {
  const [t, setT] = useState('# A title\n\nSome **bold** words and a list:\n\n- one\n- two');
  const html = useMemo(() => markdownToHtml(t), [t]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Markdown"><textarea className={cn(area, 'min-h-[260px]')} value={t} onChange={(e) => setT(e.target.value)} /></Field>
        <div><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Preview</span>
          <iframe title="Preview" sandbox="" className="mt-1 w-full min-h-[260px] rounded-xl bg-white ring-1 ring-black/10" srcDoc={`<style>body{font:15px/1.6 system-ui,sans-serif;margin:16px;color:#141320}code,pre{background:#f1f3f5;border-radius:6px;padding:2px 4px}</style>${html}`} /></div>
      </div>
      <div className="flex gap-2"><Btn onClick={() => void copy(html)}><Copy className="w-3.5 h-3.5" aria-hidden />Copy HTML</Btn><Btn onClick={() => save('page.md', t, 'text/markdown')}><Download className="w-3.5 h-3.5" aria-hidden />Download .md</Btn></div>
    </div>
  );
}

/** Base64 and web address (URL) encoding, both ways. */
function Encode() {
  const [t, setT] = useState(''), [out, setOut] = useState(''), [err, setErr] = useState('');
  const run = (f: (s: string) => string) => { try { setOut(f(t)); setErr(''); } catch { setErr('That text can’t be decoded that way.'); } };
  const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0)));
  return (
    <div className="space-y-3">
      <Field label="Text"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2"><Btn onClick={() => run(b64)}>To Base64</Btn><Btn onClick={() => run(unb64)}>From Base64</Btn><Btn onClick={() => run(encodeURIComponent)}>To URL</Btn><Btn onClick={() => run(decodeURIComponent)}>From URL</Btn></div>
      {err && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{err}</p>}
      <textarea readOnly aria-label="Result" className={area} value={out} />
      <Out text={out} />
    </div>
  );
}

/** A QR code for any link or text, as a picture to download. */
function Qr() {
  const [t, setT] = useState('https://universeimpact.com');
  const m = useMemo(() => { try { return t ? encodeQr(t) : null; } catch { return null; } }, [t]);
  const svg = m ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.length + 8} ${m.length + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${qrPath(m)}" fill="#141320"/></svg>` : '';
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_220px] items-start">
      <div className="space-y-3">
        <Field label="Link or text"><input className="input" value={t} onChange={(e) => setT(e.target.value)} maxLength={1000} /></Field>
        {!m && t && <p className="text-sm text-rose-600 dark:text-rose-300">Too long for a QR code: make it shorter.</p>}
        {m && <Btn onClick={() => save('qr-code.svg', svg, 'image/svg+xml')}><Download className="w-3.5 h-3.5" aria-hidden />Download (SVG)</Btn>}
      </div>
      {/* Our own drawing (only a path of squares), so it's safe to place as it is. */}
      {m && <div role="img" aria-label={`QR code for ${t}`} className="w-full overflow-hidden rounded-xl ring-1 ring-black/10 [&>svg]:block [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  );
}

/** Record the screen (a window, a tab or everything) with its sound, to a video file. */
function Recorder() {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => { if (!rec) return; const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, [rec]);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      const r = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach((tr) => tr.stop()); save(`screen-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.webm`, new Blob(chunks.current, { type: 'video/webm' }), 'video/webm'); setRec(null); };
      stream.getVideoTracks()[0].addEventListener('ended', () => { if (r.state !== 'inactive') r.stop(); });
      r.start(1000); setSecs(0); setRec(r);
    } catch { toast.error('Recording didn’t start (it needs your permission, on a computer).'); }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Record a lesson, a demo or a bug. The video stays on this device until you share it; edit it in Edit a video.</p>
      {rec ? <button type="button" onClick={() => rec.stop()} className="btn-primary inline-flex items-center gap-2"><Square className="w-4 h-4" aria-hidden />Stop · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</button>
        : <button type="button" onClick={() => void start()} className="btn-primary inline-flex items-center gap-2"><Video className="w-4 h-4" aria-hidden />Start recording</button>}
    </div>
  );
}
