'use client';

import type { ImageSegmenter } from '@mediapipe/tasks-vision';

// Background blur and replace for calls (src/components/call/CallView.tsx). MediaPipe's selfie
// segmenter (Google, Apache 2.0) finds you in each camera frame, on this device; the background is
// blurred or swapped for a picture on a canvas, and the canvas is the camera that's sent. Nothing
// leaves the device. The engine (~12 MB, scripts/copy-mediapipe-assets.mjs) downloads the first
// time someone turns a background on, then comes from the browser's cache.

export type Background = { kind: 'none' } | { kind: 'blur'; strong?: boolean } | { kind: 'image'; id: string };

const KEY = 'uv-call-bg', IMG_KEY = 'uv-call-bg-img';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* full or private */ } };

/** The background chosen last time (used again in the next call). */
export function savedBackground(): Background {
  try {
    const b = JSON.parse(read(KEY) ?? 'null') as Background | null;
    if (b?.kind === 'blur' || (b?.kind === 'image' && typeof b.id === 'string')) return b;
  } catch { /* not set */ }
  return { kind: 'none' };
}
export const saveBackground = (b: Background) => write(KEY, b.kind === 'none' ? null : JSON.stringify(b));

export const backgroundsSupported = () => typeof window !== 'undefined' && typeof WebAssembly !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;

/** Pictures drawn here (nothing to download): soft scenes in the app's colours. css: their thumbnail. */
export const SCENES: { id: string; label: string; css: string; paint: (g: CanvasRenderingContext2D, w: number, h: number) => void }[] = [
  {
    id: 'aurora', label: 'Aurora', css: 'radial-gradient(circle at 20% 20%, #a855f7 0%, transparent 55%), radial-gradient(circle at 80% 70%, #6366f1 0%, transparent 55%), #0f1024',
    paint: (g, w, h) => { g.fillStyle = '#0f1024'; g.fillRect(0, 0, w, h); glow(g, w * 0.2, h * 0.2, w * 0.6, '#a855f7'); glow(g, w * 0.8, h * 0.7, w * 0.6, '#6366f1'); },
  },
  {
    id: 'sunset', label: 'Sunset', css: 'linear-gradient(180deg, #312e81 0%, #be185d 55%, #f59e0b 100%)',
    paint: (g, w, h) => { const l = g.createLinearGradient(0, 0, 0, h); l.addColorStop(0, '#312e81'); l.addColorStop(0.55, '#be185d'); l.addColorStop(1, '#f59e0b'); g.fillStyle = l; g.fillRect(0, 0, w, h); glow(g, w * 0.5, h * 0.95, w * 0.35, '#fde68a'); },
  },
  {
    id: 'ocean', label: 'Ocean', css: 'linear-gradient(160deg, #0ea5e9 0%, #1e3a8a 60%, #0b1026 100%)',
    paint: (g, w, h) => { const l = g.createLinearGradient(0, 0, w, h); l.addColorStop(0, '#0ea5e9'); l.addColorStop(0.6, '#1e3a8a'); l.addColorStop(1, '#0b1026'); g.fillStyle = l; g.fillRect(0, 0, w, h); glow(g, w * 0.15, h * 0.1, w * 0.4, '#67e8f9'); },
  },
  {
    id: 'calm', label: 'Calm', css: 'linear-gradient(135deg, #e0e7ff 0%, #f5f3ff 50%, #fce7f3 100%)',
    paint: (g, w, h) => { const l = g.createLinearGradient(0, 0, w, h); l.addColorStop(0, '#e0e7ff'); l.addColorStop(0.5, '#f5f3ff'); l.addColorStop(1, '#fce7f3'); g.fillStyle = l; g.fillRect(0, 0, w, h); },
  },
];

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, color);
  rg.addColorStop(1, 'transparent');
  g.fillStyle = rg;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
}

/** Your own picture (kept on this device only, made small enough to keep). */
export const customImage = () => read(IMG_KEY);
export async function saveCustomImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    cover(c.getContext('2d')!, img, 1280, 720);
    const data = c.toDataURL('image/jpeg', 0.82);
    write(IMG_KEY, data);
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });

/** Draws an image to fill the canvas, cropping what doesn't fit (like object-fit: cover). */
function cover(g: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
}

/** A picture background at the camera's size. */
async function sceneCanvas(id: string, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const scene = SCENES.find((s) => s.id === id);
  const custom = id === 'custom' ? customImage() : null;
  if (custom) cover(g, await loadImage(custom), w, h);
  else (scene ?? SCENES[0]).paint(g, w, h);
  return c;
}

// ── The segmenter: one per page, made on first use ───────────────────────────────────────────

let segmenter: Promise<ImageSegmenter> | null = null;
function loadSegmenter() {
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    const make = (delegate: 'GPU' | 'CPU') => ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/mediapipe/selfie_segmenter.tflite', delegate },
      runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
    });
    // The graphics card where there is one; otherwise the processor.
    try { return await make('GPU'); } catch { return await make('CPU'); }
  })();
  segmenter.catch(() => { segmenter = null; }); // try again next time
  return segmenter;
}

/**
 * Ticks that keep coming while the tab is in the background (the page's own timers slow to once a
 * second there, which would freeze your video for everyone).
 */
function ticker(fps: number, tick: () => void): () => void {
  try {
    const url = URL.createObjectURL(new Blob(['let t;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}'], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = tick;
    w.postMessage(Math.round(1000 / fps));
    return () => { w.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const t = setInterval(tick, 1000 / fps);
    return () => clearInterval(t);
  }
}

export interface BackgroundEffect {
  /** What to send and show: the camera with its background done. */
  track: MediaStreamTrack;
  /** Another background, without starting over. */
  set(b: Background): void;
  stop(): void;
}

/** The camera with a blurred or replaced background. Throws if this device can't do it. */
export async function applyBackground(raw: MediaStreamTrack, initial: Background): Promise<BackgroundEffect> {
  const seg = await loadSegmenter();
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([raw]);
  await video.play().catch(() => {});
  if (video.readyState < 2) await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }));

  // Smaller and fewer frames on phones without much power.
  const weak = navigator.maxTouchPoints > 0 && (navigator.hardwareConcurrency ?? 8) <= 4;
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const scale = Math.min(1, (weak ? 640 : 1280) / vw);
  const w = Math.round((vw * scale) / 2) * 2, h = Math.round((vh * scale) / 2) * 2;
  const fps = weak ? 15 : 24;

  const canvas = (cw: number, ch: number) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
  // The segmenter looks at a small copy of each frame (its mask comes back at the size it was
  // given, and the model itself works at 256 px): far less to read back and go through.
  const out = canvas(w, h), fg = canvas(w, h), mid = canvas(Math.round(w / 4), Math.round(h / 4)), small = canvas(8, 8), mask = canvas(8, 8);
  const look = canvas(320, Math.max(2, Math.round((320 * h) / w / 2) * 2));
  const g = out.getContext('2d'), fgc = fg.getContext('2d'), midc = mid.getContext('2d'), sc = small.getContext('2d'), mc = mask.getContext('2d'), lc = look.getContext('2d');
  if (!g || !fgc || !midc || !sc || !mc || !lc) throw new Error('No canvas');

  let bg = initial;
  let scene: HTMLCanvasElement | null = null;
  const paintScene = async () => { scene = bg.kind === 'image' ? await sceneCanvas(bg.id, w, h).catch(() => null) : null; };
  await paintScene();

  let maskData: ImageData | null = null;
  let prev: Float32Array | null = null;
  const composite = () => {
    // The background: blurred (shrunk, then grown back smoothly), a picture, or the room as it is.
    if (bg.kind === 'blur') {
      const f = bg.strong ? 28 : 14;
      const sw = Math.max(8, Math.round(w / f)), sh = Math.max(8, Math.round(h / f));
      if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; }
      sc.drawImage(video, 0, 0, sw, sh);
      midc.imageSmoothingQuality = 'high';
      midc.drawImage(small, 0, 0, mid.width, mid.height);
      g.imageSmoothingQuality = 'high';
      g.drawImage(mid, 0, 0, w, h);
    } else if (scene) g.drawImage(scene, 0, 0, w, h);
    else g.drawImage(video, 0, 0, w, h);
    // You, cut out by the mask (grown with smoothing, so the edge is soft). Until the first mask,
    // only the background shows: the room is never sent as it is.
    if (!maskData) return;
    fgc.globalCompositeOperation = 'copy';
    fgc.drawImage(video, 0, 0, w, h);
    fgc.globalCompositeOperation = 'destination-in';
    fgc.imageSmoothingQuality = 'high';
    fgc.drawImage(mask, 0, 0, w, h);
    g.drawImage(fg, 0, 0);
  };

  let last = -1;
  const frame = () => {
    if (video.readyState < 2 || raw.readyState === 'ended') return;
    const ts = performance.now();
    if (ts <= last) return;
    last = ts;
    try {
      lc.drawImage(video, 0, 0, look.width, look.height);
      seg.segmentForVideo(look, ts, (result) => {
        const m = result.confidenceMasks?.[0];
        if (!m) return;
        const conf = m.getAsFloat32Array();
        if (!maskData || maskData.width !== m.width || maskData.height !== m.height) {
          mask.width = m.width; mask.height = m.height;
          maskData = mc.createImageData(m.width, m.height);
          prev = new Float32Array(conf.length);
        }
        const px = maskData.data, p = prev!;
        for (let i = 0; i < conf.length; i++) {
          // A little of the last frame (no flicker at the edges), then a soft threshold.
          const c = conf[i] * 0.7 + p[i] * 0.3;
          p[i] = c;
          px[i * 4 + 3] = c <= 0.3 ? 0 : c >= 0.7 ? 255 : ((c - 0.3) / 0.4) * 255;
        }
        mc.putImageData(maskData, 0, 0);
      });
      composite();
    } catch { /* skip this frame */ }
  };

  composite();
  const stream = out.captureStream(fps);
  const track = stream.getVideoTracks()[0];
  track.contentHint = 'motion';
  const stopTicks = ticker(fps, frame);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    stopTicks();
    track.stop();
    video.pause();
    video.srcObject = null;
  };
  raw.addEventListener('ended', stop, { once: true });
  return { track, set: (b) => { bg = b; void paintScene(); }, stop };
}
