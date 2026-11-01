'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Download, Eraser, ImagePlus, Mic, PaintBucket, Pause, Pencil, Pipette, Play, ShieldCheck, Square, Trash2, Undo2 } from 'lucide-react';
import { COLOUR_BLIND, detectPitch, jpegDetails, noteOf, simulateColourBlind } from '@/lib/more-tools';
import { cn } from '@/lib/utils';
import { Btn, Field, save } from './QuickTools';
import { useKept } from './kept';
import { nf, Segments, Stat } from './bits';

// Collaborate → Create → Design and media, fourth set (M74): a photo booth, an app icon maker, memes,
// a colour-blind view, pixel art, cleaning a photo's hidden details, a metronome, a tuner and focus
// sounds. Camera and microphone stay on this device; nothing is recorded or sent.

export type MediaId = 'booth' | 'icon' | 'meme' | 'colourblind' | 'pixel' | 'cleanphoto' | 'metronome' | 'tuner' | 'focus';

export function MediaTool({ id }: { id: MediaId }) {
  const T = { booth: Booth, icon: Icon, meme: Meme, colourblind: ColourBlind, pixel: Pixel, cleanphoto: CleanPhoto, metronome: Metronome, tuner: Tuner, focus: Focus }[id];
  return <T />;
}

const loadImage = (f: Blob) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('This picture can’t be opened here.')); i.src = URL.createObjectURL(f); });
const savePng = (c: HTMLCanvasElement | null, name: string) => c?.toBlob((b) => b && save(name, b, 'image/png'));
function usePicture() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const input = <input ref={ref} type="file" accept="image/*" className="hidden" aria-label="Choose a picture" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setImg(await loadImage(f)); } catch (x) { toast.error((x as Error).message); } }} />;
  return { img, input, open: () => ref.current?.click() };
}

const FILTERS: [string, string][] = [['None', 'none'], ['Black and white', 'grayscale(1) contrast(1.1)'], ['Sepia', 'sepia(0.85)'], ['Warm', 'sepia(0.3) saturate(1.4) hue-rotate(-10deg)'], ['Cool', 'saturate(1.1) hue-rotate(15deg) brightness(1.05)'], ['Vivid', 'saturate(1.8) contrast(1.15)'], ['Faded', 'contrast(0.85) brightness(1.1) saturate(0.7)'], ['Night', 'brightness(0.8) contrast(1.3) hue-rotate(200deg) saturate(1.2)']];
/** Photo booth: the camera with filters, a 3-2-1 countdown and a strip of shots to save. */
function Booth() {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const [on, setOn] = useState(false), [f, setF] = useState(0), [mirror, setMirror] = useState(true), [count, setCount] = useState(0), [shots, setShots] = useState<string[]>([]);
  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); }, []);
  const kept = useRef<string[]>([]);
  useEffect(() => { kept.current = shots; }, [shots]);
  useEffect(() => () => kept.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const start = async () => {
    try { const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); stream.current = s; if (video.current) { video.current.srcObject = s; await video.current.play(); } setOn(true); }
    catch { toast.error('The camera isn’t available. Allow it in the browser’s settings.'); }
  };
  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setOn(false); };
  const snap = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d')!; if ('filter' in g) g.filter = FILTERS[f][1];
    if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(v, 0, 0);
    c.toBlob((b) => b && setShots((s) => [URL.createObjectURL(b), ...s].slice(0, 12)), 'image/jpeg', 0.92);
  };
  const timed = () => { let n = 3; setCount(n); const t = setInterval(() => { n--; setCount(n); if (n <= 0) { clearInterval(t); snap(); } }, 1000); };
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-black aspect-video">
        <video ref={video} playsInline muted className="w-full h-full object-cover" style={{ filter: FILTERS[f][1], transform: mirror ? 'scaleX(-1)' : undefined }} aria-label="Camera" />
        {!on && <button type="button" onClick={() => void start()} className="absolute inset-0 grid place-items-center text-white"><span className="btn-primary"><Camera className="w-4 h-4" aria-hidden />Turn on the camera</span></button>}
        {count > 0 && <span className="absolute inset-0 grid place-items-center text-8xl font-bold text-white drop-shadow-lg" aria-live="assertive">{count}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">{FILTERS.map(([n], k) => <Btn key={n} on={f === k} onClick={() => setF(k)}>{n}</Btn>)}</div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={snap} disabled={!on} className="btn-primary btn-sm"><Camera className="w-4 h-4" aria-hidden />Take a photo</button>
        <Btn onClick={timed}>3-2-1</Btn>
        <Btn on={mirror} onClick={() => setMirror(!mirror)}>Mirror</Btn>
        {on && <Btn onClick={stop}><Square className="w-3.5 h-3.5" aria-hidden />Turn off</Btn>}
      </div>
      {shots.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Your photos">
          {shots.map((u, k) => <li key={u} className="relative shrink-0"><span className="block w-32 h-20 rounded-lg bg-cover bg-center ring-1 ring-black/10" style={{ backgroundImage: `url(${u})` }} role="img" aria-label={`Photo ${k + 1}`} /><a href={u} download={`photo-${k + 1}.jpg`} className="absolute bottom-1 end-1 rounded-full bg-black/60 p-1.5 text-white" aria-label={`Save photo ${k + 1}`}><Download className="w-3.5 h-3.5" aria-hidden /></a></li>)}
        </ul>
      )}
    </div>
  );
}

const SIZES = [512, 192, 180, 64, 32];
/** App icon maker: a letter or emoji on a colour, at the sizes phones and browsers need. */
function Icon() {
  const [v, setV] = useKept('uv-app-icon', { text: 'U', a: '#533ff6', b: '#ec74ce', ink: '#ffffff', shape: 'round' as 'square' | 'round' | 'circle', size: 58 });
  const draw = useCallback((c: HTMLCanvasElement, px: number) => {
    c.width = px; c.height = px; const g = c.getContext('2d')!, r = v.shape === 'circle' ? px / 2 : v.shape === 'round' ? px * 0.22 : 0;
    g.clearRect(0, 0, px, px); const grad = g.createLinearGradient(0, 0, px, px); grad.addColorStop(0, v.a); grad.addColorStop(1, v.b);
    g.fillStyle = grad; g.beginPath(); g.roundRect(0, 0, px, px, r); g.fill();
    g.fillStyle = v.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${(px * v.size) / 100}px Urbanist, system-ui, sans-serif`;
    g.fillText(v.text.slice(0, 3), px / 2, px * 0.53);
  }, [v]);
  const big = useRef<HTMLCanvasElement>(null), small = useRef<(HTMLCanvasElement | null)[]>([]);
  useEffect(() => { if (big.current) draw(big.current, 512); small.current.forEach((c, k) => c && draw(c, SIZES[k])); }, [draw]);
  const dl = (px: number) => { const c = document.createElement('canvas'); draw(c, px); savePng(c, `icon-${px}.png`); };
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_240px]">
      <div className="space-y-3">
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <Field label="Letters or emoji"><input className="input text-lg" value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} /></Field>
          <Field label="Colour 1"><input type="color" className="input h-11 p-1" value={v.a} onChange={(e) => setV({ ...v, a: e.target.value })} /></Field>
          <Field label="Colour 2"><input type="color" className="input h-11 p-1" value={v.b} onChange={(e) => setV({ ...v, b: e.target.value })} /></Field>
          <Field label="Letter colour"><input type="color" className="input h-11 p-1" value={v.ink} onChange={(e) => setV({ ...v, ink: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segments label="Shape" value={v.shape} onChange={(shape) => setV({ ...v, shape })} options={[['square', 'Square'], ['round', 'Rounded'], ['circle', 'Circle']] as const} />
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">Letter size<input type="range" min={20} max={90} value={v.size} onChange={(e) => setV({ ...v, size: +e.target.value })} className="accent-pink-500" /></label>
        </div>
        <div className="flex flex-wrap gap-2">{SIZES.map((px) => <Btn key={px} onClick={() => dl(px)}><Download className="w-3.5 h-3.5" aria-hidden />{px} px</Btn>)}</div>
        <div className="flex items-end gap-3">{SIZES.slice(1).map((px, k) => <canvas key={px} ref={(el) => { small.current[k + 1] = el; }} style={{ width: Math.min(px, 96), height: Math.min(px, 96) }} role="img" aria-label={`${px} pixel preview`} />)}</div>
      </div>
      <canvas ref={big} className="w-full max-w-[240px] aspect-square" role="img" aria-label="Icon preview" />
    </div>
  );
}

/** Meme maker: words at the top and bottom of a picture. */
function Meme() {
  const pic = usePicture();
  const [top, setTop] = useState('When the code works'), [bottom, setBottom] = useState('on the first try'), [size, setSize] = useState(9);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const img = pic.img, W = img ? Math.min(1600, img.naturalWidth) : 1080, H = img ? Math.round((W / img.naturalWidth) * img.naturalHeight) : 1080;
    c.width = W; c.height = H; const g = c.getContext('2d')!;
    if (img) g.drawImage(img, 0, 0, W, H); else { const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#171f44'); gr.addColorStop(1, '#533ff6'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    const fs = (W * size) / 100; g.font = `900 ${fs}px Impact, 'Arial Black', system-ui, sans-serif`; g.textAlign = 'center'; g.lineJoin = 'round';
    g.lineWidth = fs / 7; g.strokeStyle = '#000'; g.fillStyle = '#fff';
    const wrap = (t: string) => { const words = t.toUpperCase().split(/\s+/), lines: string[] = []; let l = ''; for (const w of words) { const x = l ? `${l} ${w}` : w; if (g.measureText(x).width > W * 0.92 && l) { lines.push(l); l = w; } else l = x; } if (l) lines.push(l); return lines; };
    wrap(top).forEach((l, k) => { const y = fs * 1.05 * (k + 1); g.strokeText(l, W / 2, y); g.fillText(l, W / 2, y); });
    const bl = wrap(bottom); bl.forEach((l, k) => { const y = H - fs * 0.35 - fs * 1.05 * (bl.length - 1 - k); g.strokeText(l, W / 2, y); g.fillText(l, W / 2, y); });
  }, [pic.img, top, bottom, size]);
  return (
    <div className="space-y-3">
      {pic.input}
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" onClick={pic.open} className="btn-primary btn-sm"><ImagePlus className="w-4 h-4" aria-hidden />{pic.img ? 'Another picture' : 'Choose a picture'}</button>
        <Field label="Top"><input className="input" value={top} onChange={(e) => setTop(e.target.value)} /></Field>
        <Field label="Bottom"><input className="input" value={bottom} onChange={(e) => setBottom(e.target.value)} /></Field>
        <Field label="Size"><input type="range" min={5} max={15} value={size} onChange={(e) => setSize(+e.target.value)} className="accent-pink-500" /></Field>
      </div>
      <canvas ref={ref} role="img" aria-label={`Meme: ${top} / ${bottom}`} className="w-full max-h-[560px] object-contain rounded-xl ring-1 ring-black/10" />
      <Btn onClick={() => savePng(ref.current, 'meme.png')}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn>
    </div>
  );
}

/** Colour-blind view: see a picture, chart or design the way people with colour blindness do. */
function ColourBlind() {
  const pic = usePicture();
  const [kind, setKind] = useState(Object.keys(COLOUR_BLIND)[1]);
  const a = useRef<HTMLCanvasElement>(null), b = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = pic.img; if (!img || !a.current || !b.current) return;
    const s = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight)), W = Math.round(img.naturalWidth * s), H = Math.round(img.naturalHeight * s);
    for (const c of [a.current, b.current]) { c.width = W; c.height = H; c.getContext('2d')!.drawImage(img, 0, 0, W, H); }
    const g = b.current.getContext('2d')!, d = g.getImageData(0, 0, W, H);
    simulateColourBlind(d.data, COLOUR_BLIND[kind]); g.putImageData(d, 0, 0);
  }, [pic.img, kind]);
  return (
    <div className="space-y-3">
      {pic.input}
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" onClick={pic.open} className="btn-primary btn-sm"><ImagePlus className="w-4 h-4" aria-hidden />{pic.img ? 'Another picture' : 'Choose a picture'}</button>
        <Field label="See it as"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.keys(COLOUR_BLIND).map((k) => <option key={k}>{k}</option>)}</select></Field>
        {pic.img && <Btn onClick={() => savePng(b.current, 'colour-blind-view.png')}><Download className="w-3.5 h-3.5" aria-hidden />Save the view</Btn>}
      </div>
      {pic.img ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <figure><canvas ref={a} className="w-full rounded-xl ring-1 ring-black/10" role="img" aria-label="Original" /><figcaption className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Original</figcaption></figure>
          <figure><canvas ref={b} className="w-full rounded-xl ring-1 ring-black/10" role="img" aria-label={kind} /><figcaption className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{kind}</figcaption></figure>
        </div>
      ) : <button type="button" onClick={pic.open} className="w-full h-48 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-white/15 text-sm text-zinc-600 dark:text-zinc-300">Choose a chart, poster or slide to check that its colours still make sense.</button>}
      <p className="text-xs text-zinc-600 dark:text-zinc-300">About 1 in 12 men and 1 in 200 women see colours differently. Don&rsquo;t let colour be the only way to tell things apart.</p>
    </div>
  );
}

const PALETTE = ['#000000', '#ffffff', '#7f7f7f', '#c3c3c3', '#e11d48', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#533ff6', '#a855f7', '#ec74ce', '#92400e', '#065f46', '#1e3a8a', '#171f44'];
/** Pixel art: draw on a grid with a palette, fill, pick and undo; save it sharp and big. */
function Pixel() {
  const [p, setP] = useKept('uv-pixel-art', () => ({ n: 16, px: Array<string>(256).fill('') }));
  const [col, setCol] = useState('#533ff6'), [tool, setTool] = useState<'pen' | 'erase' | 'fill' | 'pick'>('pen'), [undo, setUndo] = useState<string[][]>([]), [mirror, setMirror] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null), down = useRef(false);
  useEffect(() => {
    const c = ref.current; if (!c) return; const S = 512; c.width = S; c.height = S; const g = c.getContext('2d')!, s = S / p.n;
    for (let i = 0; i < p.n * p.n; i++) { const x = i % p.n, y = Math.floor(i / p.n); g.fillStyle = p.px[i] || ((x + y) % 2 ? '#e5e7eb' : '#f8fafc'); g.fillRect(x * s, y * s, s, s); }
    g.strokeStyle = 'rgba(0,0,0,0.06)'; for (let k = 1; k < p.n; k++) { g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s, S); g.moveTo(0, k * s); g.lineTo(S, k * s); g.stroke(); }
  }, [p]);
  const cell = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); const x = Math.floor(((e.clientX - r.left) / r.width) * p.n), y = Math.floor(((e.clientY - r.top) / r.height) * p.n); return x >= 0 && y >= 0 && x < p.n && y < p.n ? y * p.n + x : -1; };
  const paint = (i: number, first: boolean) => {
    if (i < 0) return;
    if (tool === 'pick') { if (p.px[i]) { setCol(p.px[i]); setTool('pen'); } return; }
    const px = [...p.px];
    if (first) setUndo((u) => [...u.slice(-30), p.px]);
    if (tool === 'fill') {
      const from = px[i], to = col; if (from === to) return;
      const stack = [i];
      while (stack.length) { const k = stack.pop()!; if (px[k] !== from) continue; px[k] = to; const x = k % p.n, y = Math.floor(k / p.n); if (x > 0) stack.push(k - 1); if (x < p.n - 1) stack.push(k + 1); if (y > 0) stack.push(k - p.n); if (y < p.n - 1) stack.push(k + p.n); }
    } else {
      const v = tool === 'erase' ? '' : col; px[i] = v;
      if (mirror) px[Math.floor(i / p.n) * p.n + (p.n - 1 - (i % p.n))] = v;
    }
    setP({ ...p, px });
  };
  const exportPng = () => { const c = document.createElement('canvas'), s = Math.max(1, Math.floor(1024 / p.n)); c.width = c.height = p.n * s; const g = c.getContext('2d')!; p.px.forEach((v, i) => { if (v) { g.fillStyle = v; g.fillRect((i % p.n) * s, Math.floor(i / p.n) * s, s, s); } }); savePng(c, 'pixel-art.png'); };
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_220px]">
      <canvas ref={ref} className="w-full max-w-[512px] aspect-square rounded-xl ring-1 ring-black/10 touch-none cursor-crosshair [image-rendering:pixelated]" role="img" aria-label={`Pixel art, ${p.n} by ${p.n}`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); down.current = true; paint(cell(e), true); }}
        onPointerMove={(e) => { if (down.current && (tool === 'pen' || tool === 'erase')) paint(cell(e), false); }}
        onPointerUp={() => { down.current = false; }} />
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tool">
          {([['pen', Pencil, 'Draw'], ['erase', Eraser, 'Rub out'], ['fill', PaintBucket, 'Fill'], ['pick', Pipette, 'Pick a colour']] as const).map(([k, I, l]) => <Btn key={k} on={tool === k} onClick={() => setTool(k)}><I className="w-3.5 h-3.5" aria-hidden />{l}</Btn>)}
        </div>
        <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label="Colour">
          {PALETTE.map((c) => <button key={c} type="button" role="radio" aria-checked={col === c} aria-label={c} onClick={() => { setCol(c); if (tool === 'erase' || tool === 'pick') setTool('pen'); }} className={cn('aspect-square rounded-md ring-1 ring-black/15 transition-transform', col === c && 'ring-2 ring-pink-600 scale-110')} style={{ background: c }} />)}
        </div>
        <Field label="Any colour"><input type="color" className="input h-10 p-1" value={col} onChange={(e) => setCol(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-1.5">
          <Btn on={mirror} onClick={() => setMirror(!mirror)}>Mirror</Btn>
          <Btn onClick={() => { const u = undo[undo.length - 1]; if (u) { setP({ ...p, px: u }); setUndo(undo.slice(0, -1)); } }}><Undo2 className="w-3.5 h-3.5" aria-hidden />Undo</Btn>
          <Btn onClick={() => { if (window.confirm('Clear the drawing?')) { setUndo([...undo, p.px]); setP({ ...p, px: Array<string>(p.n * p.n).fill('') }); } }}><Trash2 className="w-3.5 h-3.5" aria-hidden />Clear</Btn>
        </div>
        <Field label="Grid"><select className="input" value={p.n} onChange={(e) => { const n = +e.target.value; if (n !== p.n && window.confirm('A new grid size starts a new drawing. Go ahead?')) { setUndo([]); setP({ n, px: Array<string>(n * n).fill('') }); } }}>{[8, 16, 24, 32].map((n) => <option key={n} value={n}>{n} × {n}</option>)}</select></Field>
        <button type="button" onClick={exportPng} className="btn-primary btn-sm"><Download className="w-4 h-4" aria-hidden />Save PNG (1024 px)</button>
      </div>
    </div>
  );
}

/** Remove a photo's hidden details (camera, place it was taken) before sharing it. */
function CleanPhoto() {
  const [info, setInfo] = useState<{ name: string; type: string; size: number; w: number; h: number; exif: boolean; gps: boolean; f: File } | null>(null);
  const [out, setOut] = useState<{ url: string; size: number; name: string } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);
  const open = async (f?: File) => {
    if (!f) return;
    try { const img = await loadImage(f), bytes = new Uint8Array(await f.slice(0, 256 * 1024).arrayBuffer()); setInfo({ name: f.name, type: f.type || 'unknown', size: f.size, w: img.naturalWidth, h: img.naturalHeight, ...jpegDetails(bytes), f }); setOut(null); }
    catch (e) { toast.error((e as Error).message); }
  };
  const clean = async () => {
    if (!info) return;
    const img = await loadImage(info.f), c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d')!.drawImage(img, 0, 0);
    const png = info.type === 'image/png', type = png ? 'image/png' : 'image/jpeg';
    c.toBlob((b) => { if (!b) return; setOut({ url: URL.createObjectURL(b), size: b.size, name: `${info.name.replace(/\.[^.]+$/, '')}-clean.${png ? 'png' : 'jpg'}` }); }, type, 0.92);
  };
  const kb = (n: number) => (n > 1e6 ? `${nf(n / 1e6, 1)} MB` : `${nf(n / 1e3, 0)} KB`);
  return (
    <div className="space-y-3">
      <input ref={ref} type="file" accept="image/*" className="hidden" aria-label="Choose a photo" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" onClick={() => ref.current?.click()} className="btn-primary btn-sm"><ImagePlus className="w-4 h-4" aria-hidden />{info ? 'Another photo' : 'Choose a photo'}</button>
      {info && (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"><Stat k="Size" v={kb(info.size)} /><Stat k="Pixels" v={`${info.w} × ${info.h}`} /><Stat k="Camera details" v={info.exif ? 'Yes' : 'None found'} /><Stat k="Where it was taken" v={info.gps ? 'Yes: hidden inside' : 'None found'} /></dl>
          {info.gps && <p role="alert" className="rounded-xl bg-amber-100 dark:bg-amber-400/15 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">This photo carries the place it was taken. Anyone who gets the file can read it: save a clean copy before sharing.</p>}
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" onClick={() => void clean()} className="btn-secondary btn-sm"><ShieldCheck className="w-4 h-4" aria-hidden />Make a clean copy</button>
            {out && <a href={out.url} download={out.name} className="btn-primary btn-sm"><Download className="w-4 h-4" aria-hidden />Save it ({kb(out.size)})</a>}
          </div>
        </>
      )}
      <p className="text-xs text-zinc-600 dark:text-zinc-300">The clean copy is redrawn from the pixels only: camera, date and location details are left behind. It stays on this device.</p>
    </div>
  );
}

/** Metronome: steady beats with the first of each bar stronger; tap to set the speed. */
function Metronome() {
  const [bpm, setBpm] = useKept('uv-metro-bpm', 90), [beats, setBeats] = useKept('uv-metro-beats', 4), [on, setOn] = useState(false), [beat, setBeat] = useState(-1);
  const taps = useRef<number[]>([]), live = useRef({ bpm, beats });
  useEffect(() => { live.current = { bpm, beats }; }, [bpm, beats]);
  useEffect(() => {
    if (!on) return;
    const ctx = new AudioContext(); let next = ctx.currentTime + 0.06, n = 0; const marks: [number, number][] = [];
    const timer = setInterval(() => {
      while (next < ctx.currentTime + 0.12) {
        const o = ctx.createOscillator(), g = ctx.createGain(), first = n % live.current.beats === 0;
        o.frequency.value = first ? 1500 : 1000; g.gain.setValueAtTime(0.0001, next); g.gain.exponentialRampToValueAtTime(first ? 0.6 : 0.35, next + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, next + 0.06);
        o.connect(g).connect(ctx.destination); o.start(next); o.stop(next + 0.07);
        marks.push([next, n % live.current.beats]); n++; next += 60 / live.current.bpm;
      }
    }, 25);
    let raf = 0;
    const draw = () => { while (marks.length && marks[0][0] <= ctx.currentTime) setBeat(marks.shift()![1]); raf = requestAnimationFrame(draw); };
    raf = requestAnimationFrame(draw);
    return () => { clearInterval(timer); cancelAnimationFrame(raf); void ctx.close(); setBeat(-1); };
  }, [on]);
  const tap = () => { const t = performance.now(); taps.current = [...taps.current.filter((x) => t - x < 3000), t]; if (taps.current.length >= 2) { const d = (taps.current[taps.current.length - 1] - taps.current[0]) / (taps.current.length - 1); setBpm(Math.max(30, Math.min(240, Math.round(60000 / d)))); } };
  return (
    <div className="space-y-4 text-center">
      <p className="font-mono text-6xl font-bold text-zinc-900 dark:text-white tabular-nums">{bpm}<span className="text-lg font-sans font-normal text-zinc-600 dark:text-zinc-300"> beats a minute</span></p>
      <div className="flex justify-center gap-3" aria-hidden>{Array.from({ length: beats }, (_, k) => <span key={k} className={cn('w-6 h-6 rounded-full transition-[transform,background-color] duration-75', beat === k ? (k === 0 ? 'bg-pink-500 scale-125' : 'bg-indigo-500 dark:bg-aqua-300 scale-110') : 'bg-zinc-200 dark:bg-white/10')} />)}</div>
      <input type="range" min={30} max={240} value={bpm} onChange={(e) => setBpm(+e.target.value)} className="w-full max-w-md accent-pink-500" aria-label="Beats a minute" />
      <div className="flex flex-wrap justify-center gap-2 items-center">
        <button type="button" onClick={() => setOn(!on)} className="btn-primary">{on ? <Pause className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}{on ? 'Stop' : 'Start'}</button>
        <button type="button" onClick={tap} className="btn-secondary">Tap the speed</button>
        <select className="input w-auto!" aria-label="Beats in a bar" value={beats} onChange={(e) => setBeats(+e.target.value)}>{[2, 3, 4, 5, 6, 7].map((b) => <option key={b} value={b}>{b} beats a bar</option>)}</select>
      </div>
    </div>
  );
}

/** Tuner: sing or play a note and see how close it is. */
function Tuner() {
  const [on, setOn] = useState(false), [hz, setHz] = useState<number | null>(null);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 4096; ctx.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(an.fftSize); let raf = 0, last = 0;
      const tick = (t: number) => { if (t - last > 90) { last = t; an.getFloatTimeDomainData(buf); setHz(detectPitch(buf, ctx.sampleRate)); } raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
      stop.current = () => { cancelAnimationFrame(raf); s.getTracks().forEach((x) => x.stop()); void ctx.close(); setOn(false); setHz(null); };
      setOn(true);
    } catch { toast.error('The microphone isn’t available. Allow it in the browser’s settings.'); }
  };
  const tone = () => { const ctx = new AudioContext(), o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 440; g.gain.value = 0.15; o.connect(g).connect(ctx.destination); o.start(); g.gain.setTargetAtTime(0, ctx.currentTime + 1.2, 0.1); o.stop(ctx.currentTime + 1.6); o.onended = () => void ctx.close(); };
  const n = hz ? noteOf(hz) : null, good = n && Math.abs(n.cents) <= 5;
  return (
    <div className="space-y-4 text-center">
      <p className={cn('text-7xl font-bold', good ? 'text-emerald-600 dark:text-emerald-300' : 'text-zinc-900 dark:text-white')} role="status">{n ? <>{n.note}<sub className="text-2xl">{n.octave}</sub></> : '—'}</p>
      <div className="relative mx-auto max-w-md h-10" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-rose-400 via-emerald-400 to-rose-400" />
        <div className="absolute top-0 h-full w-1.5 rounded bg-zinc-900 dark:bg-white transition-[left] duration-150 ease-out" style={{ left: `calc(${50 + (n ? Math.max(-50, Math.min(50, n.cents)) : 0)}% - 3px)` }} />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-300 font-mono tabular-nums">{n ? `${nf(hz!, 1)} Hz · ${n.cents > 0 ? '+' : ''}${n.cents} cents ${good ? '· in tune' : n.cents > 0 ? '· a little high' : '· a little low'}` : on ? 'Listening… play or sing a note' : 'Off'}</p>
      <div className="flex justify-center gap-2">
        {on ? <button type="button" onClick={() => stop.current()} className="btn-secondary"><Square className="w-4 h-4" aria-hidden />Stop</button> : <button type="button" onClick={() => void start()} className="btn-primary"><Mic className="w-4 h-4" aria-hidden />Start listening</button>}
        <button type="button" onClick={tone} className="btn-secondary">Play A (440 Hz)</button>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Only the pitch is measured, on this device; nothing is recorded.</p>
    </div>
  );
}

const NOISES = [['white', 'White: hiss, masks voices'], ['pink', 'Pink: softer, like rain'], ['brown', 'Brown: deep, like a waterfall']] as const;
/** Focus sounds: gentle noise to cover chatter while you work, with a timer. */
function Focus() {
  const [kind, setKind] = useState<'white' | 'pink' | 'brown'>('brown'), [vol, setVol] = useKept('uv-focus-vol', 40), [on, setOn] = useState(false), [mins, setMins] = useState(0), [ends, setEnds] = useState(0);
  const nodes = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null), volRef = useRef(vol);
  useEffect(() => { volRef.current = vol; if (nodes.current) nodes.current.gain.gain.setTargetAtTime((vol / 100) * 0.5, nodes.current.ctx.currentTime, 0.1); }, [vol]);
  useEffect(() => { if (!on || !ends) return; const t = setTimeout(() => { setOn(false); }, Math.max(0, ends - Date.now())); return () => clearTimeout(t); }, [on, ends]);
  useEffect(() => {
    if (!on) return;
    const ctx = new AudioContext(), len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.35;
        else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      }
    }
    const src = ctx.createBufferSource(), gain = ctx.createGain(); src.buffer = buf; src.loop = true; gain.gain.value = 0;
    src.connect(gain).connect(ctx.destination); src.start(); gain.gain.setTargetAtTime((volRef.current / 100) * 0.5, ctx.currentTime, 0.4);
    nodes.current = { ctx, gain };
    return () => { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => void ctx.close(), 800); nodes.current = null; };
  }, [on, kind]);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">{NOISES.map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn('rounded-2xl border-2 p-4 text-start transition-[border-color,transform] active:scale-[0.98]', kind === k ? 'border-pink-500 bg-pink-500/10' : 'border-zinc-200 dark:border-white/10')}><span className="block font-bold text-zinc-900 dark:text-white capitalize">{k}</span><span className="text-xs text-zinc-600 dark:text-zinc-300">{l.split(': ')[1]}</span></button>)}</div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { setOn(!on); setEnds(!on && mins ? Date.now() + mins * 60000 : 0); }} className="btn-primary">{on ? <Pause className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}{on ? 'Stop' : 'Play'}</button>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">Volume<input type="range" min={0} max={100} value={vol} onChange={(e) => setVol(+e.target.value)} className="accent-pink-500" /></label>
        <select className="input w-auto!" aria-label="Stop after" value={mins} onChange={(e) => setMins(+e.target.value)}><option value={0}>Keep playing</option>{[15, 25, 45, 60, 90].map((m) => <option key={m} value={m}>Stop after {m} min</option>)}</select>
        {on && ends > 0 && <span className="text-sm text-zinc-600 dark:text-zinc-300">Stops at {new Date(ends).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Made by the browser as you listen; keep the volume low.</p>
    </div>
  );
}
