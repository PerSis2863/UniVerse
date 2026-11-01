'use client';

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Btn, Field, area, save } from './QuickTools';

// Collaborate → Create's picture tools (M71, Canva-like): each draws on one canvas in the browser and
// saves a PNG. Photos never leave the device.

export type ImageId = 'resize' | 'quote' | 'collage' | 'avatar' | 'beautify' | 'codeimg' | 'watermark';

export function ImageTool({ id }: { id: ImageId }) {
  const T = { resize: Resize, quote: Quote, collage: Collage, avatar: Avatar, beautify: Beautify, codeimg: CodeImage, watermark: Watermark }[id];
  return <T />;
}

const loadImg = (f: File) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(f); });
/** A canvas drawn by `paint` whenever its inputs change, with a Save button. */
function Canvas({ w, h, paint, name, label }: { w: number; h: number; paint: (g: CanvasRenderingContext2D) => void; name: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Redrawn after each render of the tool (they only render when one of its settings changes).
  useEffect(() => { const c = ref.current; if (!c) return; c.width = w; c.height = h; const g = c.getContext('2d')!; g.clearRect(0, 0, w, h); paint(g); });
  return (
    <div className="space-y-2">
      <canvas ref={ref} role="img" aria-label={label} className="max-h-[420px] max-w-full mx-auto block rounded-xl ring-1 ring-black/10 bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] [background-size:16px_16px]" />
      <Btn onClick={() => ref.current?.toBlob((b) => b && save(name, b, 'image/png'))}><Download className="w-3.5 h-3.5" aria-hidden />Save PNG</Btn>
    </div>
  );
}
const Pick = ({ label, multiple, onPick }: { label: string; multiple?: boolean; onPick: (f: File[]) => void }) => (
  <label className="btn-secondary btn-sm cursor-pointer w-fit">{label}<input type="file" accept="image/*" multiple={multiple} className="sr-only" onChange={(e) => onPick([...(e.target.files ?? [])])} /></label>
);
/** Draw an image to cover a box (cropped from the middle). */
const cover = (g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const k = Math.max(w / img.width, h / img.height), sw = w / k, sh = h / k;
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
};
/** Words broken into lines that fit a width. */
const lines = (g: CanvasRenderingContext2D, t: string, max: number) => t.split('\n').flatMap((p) => { const out: string[] = []; let cur = ''; for (const w of p.split(' ')) { if (cur && g.measureText(`${cur} ${w}`).width > max) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; } out.push(cur); return out; });

const SIZES: [string, number, number][] = [['Instagram post', 1080, 1080], ['Story / Reel', 1080, 1920], ['YouTube thumbnail', 1280, 720], ['LinkedIn post', 1200, 627], ['Profile photo', 400, 400], ['Slide (16:9)', 1920, 1080], ['A4 (print)', 2480, 3508]];
/** A photo resized and cropped for a social post, a thumbnail or print. */
function Resize() {
  const [img, setImg] = useState<HTMLImageElement | null>(null), [s, setS] = useState(0), [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const [, w, h] = SIZES[s];
  return (
    <div className="space-y-3">
      <Pick label="Choose a photo" onPick={(f) => f[0] && void loadImg(f[0]).then(setImg)} />
      <div className="flex flex-wrap gap-2">{SIZES.map(([n], i) => <Btn key={n} on={i === s} onClick={() => setS(i)}>{n}</Btn>)}</div>
      <div className="flex gap-2"><Btn on={fit === 'cover'} onClick={() => setFit('cover')}>Fill (crop)</Btn><Btn on={fit === 'contain'} onClick={() => setFit('contain')}>Fit (bars)</Btn></div>
      {img && <Canvas w={w} h={h} name={`photo-${w}x${h}.png`} label={`The photo at ${w} by ${h}`} paint={(g) => {
        if (fit === 'cover') return cover(g, img, 0, 0, w, h);
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); const k = Math.min(w / img.width, h / img.height); g.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
      }} />}
    </div>
  );
}

const LOOKS: [string, string, string, string][] = [['Night', '#171f44', '#2b3568', '#ffffff'], ['Pink', '#fe81d1', '#c13a92', '#141320'], ['Aqua', '#74ffed', '#2bb3a3', '#141320'], ['Paper', '#f7f3ea', '#e9e0cc', '#141320'], ['Violet', '#533ff6', '#2a1d8f', '#ffffff']];
/** A quote or announcement card for posts and slides. */
function Quote() {
  const [t, setT] = useState('Education is the most powerful weapon which you can use to change the world.'), [by, setBy] = useState('Nelson Mandela'), [look, setLook] = useState(0), [story, setStory] = useState(false);
  const [, a, b, ink] = LOOKS[look], W = 1080, H = story ? 1920 : 1080;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3">
        <Field label="Words"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
        <Field label="Who said it (optional)"><input className="input" value={by} onChange={(e) => setBy(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-2">{LOOKS.map(([n], i) => <Btn key={n} on={i === look} onClick={() => setLook(i)}>{n}</Btn>)}<Btn on={story} onClick={() => setStory(!story)}>Tall (story)</Btn></div>
      </div>
      <Canvas w={W} h={H} name="card.png" label="The card" paint={(g) => {
        const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = ink; g.globalAlpha = 0.25; g.font = 'bold 260px Georgia, serif'; g.fillText('“', 70, 300); g.globalAlpha = 1;
        let size = 72; g.font = `600 ${size}px system-ui, sans-serif`; let ls = lines(g, t, W - 200);
        while (ls.length * size * 1.25 > H * 0.6 && size > 28) { size -= 4; g.font = `600 ${size}px system-ui, sans-serif`; ls = lines(g, t, W - 200); }
        const top = (H - ls.length * size * 1.25) / 2;
        ls.forEach((l, i) => g.fillText(l, 100, top + (i + 1) * size * 1.25));
        if (by) { g.font = '500 40px system-ui, sans-serif'; g.globalAlpha = 0.8; g.fillText(`— ${by}`, 100, top + ls.length * size * 1.25 + 90); g.globalAlpha = 1; }
      }} />
    </div>
  );
}

/** Two to six photos in one picture. */
function Collage() {
  const [imgs, setImgs] = useState<HTMLImageElement[]>([]), [gap, setGap] = useState(16), [round, setRound] = useState(true);
  const n = imgs.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols), W = 1500, H = Math.round((W / cols) * rows);
  return (
    <div className="space-y-3">
      <Pick label="Choose 2 to 6 photos" multiple onPick={(f) => void Promise.all(f.slice(0, 6).map(loadImg)).then(setImgs)} />
      <div className="flex flex-wrap items-end gap-3"><Field label={`Space between ${gap}px`}><input type="range" min={0} max={60} value={gap} onChange={(e) => setGap(+e.target.value)} className="accent-pink-500" /></Field><Btn on={round} onClick={() => setRound(!round)}>Round corners</Btn></div>
      {n > 0 && <Canvas w={W} h={H} name="collage.png" label={`A collage of ${n} photos`} paint={(g) => {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
        const cw = (W - gap * (cols + 1)) / cols, ch = (H - gap * (rows + 1)) / rows;
        imgs.forEach((im, i) => { const x = gap + (i % cols) * (cw + gap), y = gap + Math.floor(i / cols) * (ch + gap); g.save(); g.beginPath(); g.roundRect(x, y, cw, ch, round ? 24 : 0); g.clip(); cover(g, im, x, y, cw, ch); g.restore(); });
      }} />}
    </div>
  );
}

/** A round profile picture with an optional ring. */
function Avatar() {
  const [img, setImg] = useState<HTMLImageElement | null>(null), [ring, setRing] = useState('#fe81d1'), [zoom, setZoom] = useState(1);
  return (
    <div className="space-y-3">
      <Pick label="Choose a photo" onPick={(f) => f[0] && void loadImg(f[0]).then(setImg)} />
      <div className="flex flex-wrap items-end gap-3"><Field label="Ring"><input type="color" value={ring} onChange={(e) => setRing(e.target.value)} className="h-10 w-12" /></Field><Field label={`Zoom ${zoom.toFixed(1)}×`}><input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(+e.target.value)} className="accent-pink-500" /></Field></div>
      {img && <Canvas w={800} h={800} name="profile.png" label="A round profile picture" paint={(g) => {
        g.save(); g.beginPath(); g.arc(400, 400, 370, 0, Math.PI * 2); g.clip();
        const s = 740 * zoom; cover(g, img, 400 - s / 2, 400 - s / 2, s, s); g.restore();
        g.lineWidth = 30; g.strokeStyle = ring; g.beginPath(); g.arc(400, 400, 385, 0, Math.PI * 2); g.stroke();
      }} />}
    </div>
  );
}

/** A screenshot on a gradient with a window frame and a shadow (for slides and posts). */
function Beautify() {
  const [img, setImg] = useState<HTMLImageElement | null>(null), [look, setLook] = useState(0), [pad, setPad] = useState(80);
  const [, a, b] = LOOKS[look];
  const W = img ? img.width + pad * 2 : 1200, H = img ? img.height + pad * 2 + 40 : 700;
  return (
    <div className="space-y-3">
      <Pick label="Choose a screenshot" onPick={(f) => f[0] && void loadImg(f[0]).then(setImg)} />
      <div className="flex flex-wrap items-end gap-2">{LOOKS.map(([n], i) => <Btn key={n} on={i === look} onClick={() => setLook(i)}>{n}</Btn>)}<Field label={`Space ${pad}px`}><input type="range" min={20} max={200} value={pad} onChange={(e) => setPad(+e.target.value)} className="accent-pink-500" /></Field></div>
      {img && <Canvas w={W} h={H} name="screenshot.png" label="The framed screenshot" paint={(g) => {
        const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        const x = pad, y = pad, w = img.width, h = img.height + 40;
        g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 50; g.shadowOffsetY = 20; g.fillStyle = '#fff'; g.beginPath(); g.roundRect(x, y, w, h, 16); g.fill(); g.restore();
        g.save(); g.beginPath(); g.roundRect(x, y, w, h, 16); g.clip(); g.fillStyle = '#eef0f5'; g.fillRect(x, y, w, 40);
        ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(x + 24 + i * 22, y + 20, 7, 0, Math.PI * 2); g.fill(); });
        g.drawImage(img, x, y + 40); g.restore();
      }} />}
    </div>
  );
}

/** Code as a picture (like a code editor's window), for slides and posts. */
function CodeImage() {
  const [t, setT] = useState('function hello(name) {\n  return `Hello, ${name}!`;\n}'), [title, setTitle] = useState('hello.js'), [look, setLook] = useState(0);
  const [, a, b] = LOOKS[look];
  const ls = t.replace(/\t/g, '  ').split('\n').slice(0, 60), W = Math.min(2000, Math.max(900, Math.max(...ls.map((l) => l.length)) * 17 + 220)), H = ls.length * 34 + 240;
  const KW = /\b(const|let|var|function|return|if|else|for|while|import|from|export|class|new|async|await|def|print|public|static|void|int|true|false|null|None)\b/g;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <Field label="Code"><textarea className={cn(area, 'min-h-[220px]')} value={t} onChange={(e) => setT(e.target.value)} spellCheck={false} /></Field>
        <Field label="File name"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-2">{LOOKS.map(([n], i) => <Btn key={n} on={i === look} onClick={() => setLook(i)}>{n}</Btn>)}</div>
      </div>
      <Canvas w={W} h={H} name="code.png" label="The code as a picture" paint={(g) => {
        const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.save(); g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 40; g.shadowOffsetY = 16; g.fillStyle = '#141320'; g.beginPath(); g.roundRect(60, 60, W - 120, H - 120, 18); g.fill(); g.restore();
        ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(96 + i * 24, 96, 8, 0, Math.PI * 2); g.fill(); });
        g.fillStyle = '#9aa3bd'; g.font = '20px ui-monospace, monospace'; g.textAlign = 'center'; g.fillText(title, W / 2, 103); g.textAlign = 'start';
        g.font = '26px ui-monospace, SFMono-Regular, monospace';
        ls.forEach((l, i) => {
          const y = 170 + i * 34; let x = 100;
          // Strings pink, comments grey, keywords aqua, the rest white.
          const parts = l.split(/(".*?"|'.*?'|`.*?`|\/\/.*$|#.*$)/);
          for (const p of parts) {
            if (!p) continue;
            if (/^["'`]/.test(p)) { g.fillStyle = '#fe81d1'; g.fillText(p, x, y); x += g.measureText(p).width; continue; }
            if (/^(\/\/|#)/.test(p)) { g.fillStyle = '#7d849c'; g.fillText(p, x, y); x += g.measureText(p).width; continue; }
            for (const w of p.split(/(\b)/)) { g.fillStyle = KW.test(w) ? '#74ffed' : '#eef3ff'; KW.lastIndex = 0; g.fillText(w, x, y); x += g.measureText(w).width; }
          }
        });
      }} />
    </div>
  );
}

/** Your name or a mark across a photo, so it isn't reused without credit. */
function Watermark() {
  const [img, setImg] = useState<HTMLImageElement | null>(null), [t, setT] = useState('© UniVerse'), [tile, setTile] = useState(true), [op, setOp] = useState(0.25);
  return (
    <div className="space-y-3">
      <Pick label="Choose a photo" onPick={(f) => f[0] && void loadImg(f[0]).then(setImg)} />
      <div className="flex flex-wrap items-end gap-3"><Field label="Mark"><input className="input" value={t} onChange={(e) => setT(e.target.value)} /></Field><Field label={`Strength ${Math.round(op * 100)}%`}><input type="range" min={0.05} max={0.8} step={0.05} value={op} onChange={(e) => setOp(+e.target.value)} className="accent-pink-500" /></Field><Btn on={tile} onClick={() => setTile(!tile)}>Repeat across</Btn></div>
      {img && <Canvas w={img.width} h={img.height} name="watermarked.png" label="The photo with its mark" paint={(g) => {
        g.drawImage(img, 0, 0); const s = Math.max(18, Math.round(img.width / 22)); g.font = `700 ${s}px system-ui, sans-serif`; g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = Math.max(1, s / 14); g.globalAlpha = op;
        if (!tile) { const w = g.measureText(t).width; g.strokeText(t, img.width - w - s, img.height - s); g.fillText(t, img.width - w - s, img.height - s); return; }
        g.translate(img.width / 2, img.height / 2); g.rotate(-Math.PI / 6); const step = g.measureText(t).width + s * 3, D = Math.hypot(img.width, img.height);
        for (let y = -D; y < D; y += s * 4) for (let x = -D; x < D; x += step) { g.strokeText(t, x, y); g.fillText(t, x, y); }
      }} />}
    </div>
  );
}
