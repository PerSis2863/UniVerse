'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Captions, Copy, Download, Film, FilePlus2, Loader2, Music, Pause, Play, Redo2, Scissors, Trash2, Type, Undo2, Upload, X } from 'lucide-react';
import { confirmDialog } from '@/components/ui/Dialogs';
import { Segmented } from '@/components/ui/Segmented';
import { clock } from '@/lib/audio-edit';
import { haptic } from '@/lib/haptics';
import { IMAGE_SECONDS, OUTPUTS, clipBegins, clipLength, fitRect, locate, moveClip, overlaysAt, parseCaptions, pickFormat, retrim, splitAt, toVtt, totalLength, wrapText, type Clip, type OutputId, type Overlay, type Place } from '@/lib/video-edit';
import { cn } from '@/lib/utils';

// The Studio video editor (Stage 5 · B9.15; src/lib/video-edit.ts): clips from videos and pictures
// played one after another (trim, split, reorder, duplicate, each clip's own volume), text and
// captions on top at set times (or from an .srt / .vtt file), music underneath that fades out at
// the end, in landscape, vertical or square. The preview is drawn on a canvas, and exporting
// records that same canvas with its sound (MediaRecorder), so what you see is what you get. It
// runs in real time and nothing is uploaded, so no big download is needed.

type Source = { id: string; name: string; kind: 'video' | 'image'; url: string; el: HTMLVideoElement | HTMLImageElement; w: number; h: number; duration: number; thumb: string };
type MusicTrack = { name: string; url: string; el: HTMLAudioElement; volume: number; fadeOut: boolean };
type Panel = 'clip' | 'text' | 'music' | 'video';
type Snapshot = { clips: Clip[]; overlays: Overlay[] };

const MAX_CLIPS = 40;
const MAX_SECONDS = 15 * 60;
const SIZES = [{ id: 's', label: 'Small', v: 0.045 }, { id: 'm', label: 'Medium', v: 0.065 }, { id: 'l', label: 'Large', v: 0.1 }] as const;
const COLORS = ['#ffffff', '#facc15', '#22d3ee', '#f472b6', '#111827'];
let seq = 0;
const nid = () => `v${Date.now().toString(36)}${(seq++).toString(36)}`;
/** Moves a video or sound to a time (media elements are outside React). */
const jump = (el: HTMLMediaElement, t: number) => { el.currentTime = t; };
const once = (el: EventTarget, ev: string) => new Promise<void>((res) => el.addEventListener(ev, () => res(), { once: true }));

/** Videos made by MediaRecorder often say they're endlessly long until you jump to the end. */
async function realDuration(v: HTMLVideoElement) {
  if (Number.isFinite(v.duration)) return v.duration;
  v.currentTime = 1e7;
  await once(v, 'seeked');
  const d = v.duration;
  v.currentTime = 0;
  return Number.isFinite(d) ? d : 0;
}

async function loadSource(f: File): Promise<Source> {
  const url = URL.createObjectURL(f);
  const name = f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Clip';
  const thumbOf = (el: CanvasImageSource, w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 90;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, 160, 90);
    const r = fitRect(w, h, 160, 90, 'fill');
    g.drawImage(el, r.x, r.y, r.w, r.h);
    return c.toDataURL('image/jpeg', 0.6);
  };
  try {
    if (f.type.startsWith('image/')) {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { id: nid(), name, kind: 'image', url, el: img, w: img.naturalWidth, h: img.naturalHeight, duration: Infinity, thumb: thumbOf(img, img.naturalWidth, img.naturalHeight) };
    }
    const v = document.createElement('video');
    v.preload = 'auto'; v.playsInline = true; v.src = url;
    await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error()); });
    const duration = await realDuration(v);
    if (!duration || !v.videoWidth) throw new Error();
    v.currentTime = Math.min(0.5, duration / 2);
    await once(v, 'seeked');
    return { id: nid(), name, kind: 'video', url, el: v, w: v.videoWidth, h: v.videoHeight, duration, thumb: thumbOf(v, v.videoWidth, v.videoHeight) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`“${f.name}” isn’t a video or picture this browser can open.`);
  }
}

function drawOverlay(g: CanvasRenderingContext2D, o: Overlay, w: number, h: number) {
  const px = Math.round(o.size * h);
  g.font = `600 ${px}px Inter, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = wrapText(o.text, w * 0.86, (s) => g.measureText(s).width);
  const lh = px * 1.25, block = lines.length * lh;
  const cy = o.place === 'top' ? h * 0.07 + block / 2 : o.place === 'middle' ? h / 2 : h * 0.93 - block / 2;
  if (o.box) {
    const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + px;
    g.fillStyle = 'rgba(0,0,0,0.62)';
    g.beginPath();
    g.roundRect(w / 2 - bw / 2, cy - block / 2 - px * 0.25, bw, block + px * 0.5, px * 0.3);
    g.fill();
  } else {
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.lineWidth = Math.max(2, px * 0.12);
    g.lineJoin = 'round';
    lines.forEach((l, i) => g.strokeText(l, w / 2, cy - block / 2 + lh * (i + 0.5)));
  }
  g.fillStyle = o.color;
  lines.forEach((l, i) => g.fillText(l, w / 2, cy - block / 2 + lh * (i + 0.5)));
}

function NumberBox({ label, value, onChange, min = 0, max, step = 0.1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">{label}
      <input type="number" min={min} max={max} step={step} value={Math.round(value * 10) / 10} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }} className="input py-1.5 tabular-nums" />
    </label>
  );
}

export function VideoEditor({ files, onClose }: { files: File[]; onClose: () => void }) {
  const [sources, setSources] = useState<Record<string, Source>>({});
  const [clips, setClips] = useState<Clip[]>([]);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [undo, setUndo] = useState<Snapshot[]>([]);
  const [redo, setRedo] = useState<Snapshot[]>([]);
  const [music, setMusic] = useState<MusicTrack | null>(null);
  const [name, setName] = useState(() => files[0]?.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'My video');
  const [output, setOutput] = useState<OutputId>('landscape');
  const [fit, setFit] = useState<'fit' | 'fill'>('fit');
  const [panel, setPanel] = useState<Panel>('clip');
  const [selected, setSelected] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<string | null>('open');
  const [exporting, setExporting] = useState<{ progress: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<HTMLInputElement>(null);
  const capRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const cur = useRef<{ index: number; begins: number; t0: number; pending: boolean } | null>(null);
  const onEnd = useRef<(() => void) | null>(null);
  const audio = useRef<{ ctx: AudioContext; monitor: GainNode; master: GainNode; rec: MediaStreamAudioDestinationNode; gains: Map<HTMLMediaElement, GainNode> } | null>(null);
  const recorder = useRef<{ rec: MediaRecorder; cancelled: boolean } | null>(null);
  const out = OUTPUTS.find((o) => o.id === output)!;
  const total = totalLength(clips);
  const sel = clips.find((c) => c.id === selected) ?? null;
  const selIndex = sel ? clips.indexOf(sel) : -1;

  // The newest state for the drawing loop, which runs outside React.
  const S = useRef({ clips, overlays, sources, out, fit, music, total });
  useEffect(() => { S.current = { clips, overlays, sources, out, fit, music, total }; });

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Open the files.
  useEffect(() => {
    let live = true;
    (async () => {
      const loaded: Source[] = [];
      for (const f of files.slice(0, MAX_CLIPS)) {
        try { loaded.push(await loadSource(f)); } catch (e) { toast.error((e as Error).message); }
      }
      if (!live) { loaded.forEach((s) => URL.revokeObjectURL(s.url)); return; }
      if (!loaded.length) { onCloseRef.current(); return; }
      setSources(Object.fromEntries(loaded.map((s) => [s.id, s])));
      const first = loaded.map((s): Clip => ({ id: nid(), source: s.id, kind: s.kind, duration: s.duration, start: 0, end: s.kind === 'image' ? IMAGE_SECONDS : s.duration, volume: 1 }));
      setClips(first);
      setSelected(first[0]?.id ?? null);
      setBusy(null);
    })();
    return () => { live = false; };
  }, [files]);
  // Let go of everything when leaving.
  const sourcesRef = useRef(sources);
  useEffect(() => { sourcesRef.current = sources; }, [sources]);
  useEffect(() => () => {
    playingRef.current = false;
    for (const s of Object.values(sourcesRef.current)) { if (s.el instanceof HTMLVideoElement) s.el.pause(); URL.revokeObjectURL(s.url); }
    const m = S.current.music;
    if (m) { m.el.pause(); URL.revokeObjectURL(m.url); }
    void audio.current?.ctx.close().catch(() => {});
    audio.current = null;
  }, []);

  /** Draws the finished video at a time, with what the source elements show now. */
  const draw = useCallback((t: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const st = S.current, g = c.getContext('2d')!;
    const hit = locate(st.clips, t);
    const src = hit && st.sources[hit.clip.source];
    const sized = c.width === st.out.w && c.height === st.out.h;
    // While a video is still moving to its spot, keep the last frame rather than flash black.
    if (sized && src?.el instanceof HTMLVideoElement && (src.el.readyState < 2 || src.el.seeking)) return;
    if (!sized) { c.width = st.out.w; c.height = st.out.h; }
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    if (src && (src.kind === 'image' || (src.el as HTMLVideoElement).readyState >= 2)) {
      const r = fitRect(src.w, src.h, c.width, c.height, st.fit);
      g.drawImage(src.el, r.x, r.y, r.w, r.h);
    }
    for (const o of overlaysAt(st.overlays, t)) drawOverlay(g, o, c.width, c.height);
  }, []);

  /** Shows a time while paused: moves the video there first if needed. */
  const paint = useCallback((t: number) => {
    const st = S.current, hit = locate(st.clips, t), src = hit && st.sources[hit.clip.source];
    if (src?.el instanceof HTMLVideoElement && Math.abs(src.el.currentTime - hit!.at) > 0.04) {
      const v = src.el;
      jump(v, hit!.at);
      void once(v, 'seeked').then(() => { if (!playingRef.current) draw(timeRef.current); });
    }
    draw(t);
  }, [draw]);

  // Redraw when anything changes while paused.
  useEffect(() => { if (!playingRef.current) paint(timeRef.current); }, [clips, overlays, sources, output, fit, paint]);

  const graph = () => {
    if (!audio.current) {
      const ctx = new AudioContext();
      const master = ctx.createGain(), monitor = ctx.createGain(), rec = ctx.createMediaStreamDestination();
      master.connect(monitor); monitor.connect(ctx.destination); master.connect(rec);
      audio.current = { ctx, master, monitor, rec, gains: new Map() };
    }
    const a = audio.current;
    const els: HTMLMediaElement[] = [...Object.values(S.current.sources).map((s) => s.el).filter((e): e is HTMLVideoElement => e instanceof HTMLVideoElement), ...(S.current.music ? [S.current.music.el] : [])];
    for (const el of els) {
      if (a.gains.has(el)) continue;
      const gn = a.ctx.createGain();
      a.ctx.createMediaElementSource(el).connect(gn);
      gn.connect(a.master);
      a.gains.set(el, gn);
    }
    return a;
  };

  const pauseAll = () => {
    for (const s of Object.values(S.current.sources)) if (s.el instanceof HTMLVideoElement) s.el.pause();
    S.current.music?.el.pause();
  };
  const stop = useCallback(() => {
    playingRef.current = false;
    cur.current = null;
    setPlaying(false);
    for (const s of Object.values(S.current.sources)) if (s.el instanceof HTMLVideoElement) s.el.pause();
    S.current.music?.el.pause();
  }, []);

  const startClip = async (index: number, at: number) => {
    const st = S.current, clip = st.clips[index], src = st.sources[clip.source];
    const begins = clipBegins(st.clips, index);
    cur.current = { index, begins, t0: performance.now() - (at - clip.start) * 1000, pending: true };
    pauseAll();
    if (st.music && playingRef.current) { const m = st.music.el; if (begins + (at - clip.start) < m.duration) void m.play().catch(() => {}); }
    if (src?.el instanceof HTMLVideoElement) {
      const v = src.el;
      audio.current?.gains.get(v)?.gain.setValueAtTime(clip.volume, audio.current.ctx.currentTime);
      if (Math.abs(v.currentTime - at) > 0.04) { jump(v, at); await once(v, 'seeked'); }
      if (!playingRef.current) return;
      await v.play().catch(() => {});
    }
    if (cur.current?.index === index) { cur.current.pending = false; cur.current.t0 = performance.now() - (at - clip.start) * 1000; }
  };

  const loop = (now: number) => {
    if (!playingRef.current || !cur.current) return;
    const st = S.current, c = cur.current, clip = st.clips[c.index];
    if (!clip) { finish(); return; }
    let t = timeRef.current;
    if (!c.pending) {
      const src = st.sources[clip.source];
      if (src?.el instanceof HTMLVideoElement) {
        const v = src.el;
        t = c.begins + (v.currentTime - clip.start);
        if (v.currentTime >= clip.end - 0.02 || v.ended) { v.pause(); advance(c.index + 1); }
      } else {
        t = c.begins + (now - c.t0) / 1000;
        if (t >= c.begins + clipLength(clip)) advance(c.index + 1);
      }
    }
    t = Math.min(st.total, Math.max(0, t));
    timeRef.current = t;
    draw(t);
    setTime(t);
    if (exportingRef.current) setExporting({ progress: st.total ? t / st.total : 0 });
    // Music: its volume, fading over the last 2 seconds.
    if (st.music && audio.current) {
      const gn = audio.current.gains.get(st.music.el);
      const fade = st.music.fadeOut ? Math.max(0, Math.min(1, (st.total - t) / 2)) : 1;
      gn?.gain.setValueAtTime(st.music.volume * fade, audio.current.ctx.currentTime);
    }
    requestAnimationFrame(loop);
  };
  const advance = (i: number) => {
    if (i >= S.current.clips.length) { finish(); return; }
    void startClip(i, S.current.clips[i].start);
  };
  const finish = () => {
    stop();
    timeRef.current = S.current.total;
    setTime(S.current.total);
    const done = onEnd.current;
    onEnd.current = null;
    done?.();
  };
  const exportingRef = useRef(false);

  const play = async (then?: () => void) => {
    const st = S.current;
    if (!st.clips.length) return;
    if (playingRef.current) { stop(); return; }
    const a = graph();
    await a.ctx.resume();
    let t = timeRef.current;
    if (t >= st.total - 0.05) t = 0;
    timeRef.current = t;
    onEnd.current = then ?? null;
    playingRef.current = true;
    setPlaying(true);
    const hit = locate(st.clips, t)!;
    if (st.music) jump(st.music.el, Math.min(t, st.music.el.duration || 0));
    await startClip(hit.index, hit.at);
    requestAnimationFrame(loop);
  };

  const seek = (t: number) => {
    if (playingRef.current) stop();
    t = Math.max(0, Math.min(total, t));
    timeRef.current = t;
    setTime(t);
    paint(t);
  };

  /** A change to clips or text that undo can take back. */
  const commit = (next: Partial<Snapshot>) => {
    setUndo((u) => [...u, { clips, overlays }].slice(-50));
    setRedo([]);
    if (next.clips) setClips(next.clips);
    if (next.overlays) setOverlays(next.overlays);
    setDirty(true);
  };
  const step = (from: Snapshot[], setFrom: typeof setUndo, setTo: typeof setUndo) => {
    const prev = from[from.length - 1];
    if (!prev) return;
    if (playingRef.current) stop();
    setFrom((s) => s.slice(0, -1));
    setTo((s) => [...s, { clips, overlays }]);
    setClips(prev.clips);
    setOverlays(prev.overlays);
    if (!prev.clips.some((c) => c.id === selected)) setSelected(prev.clips[0]?.id ?? null);
  };

  const addFiles = async (list: File[]) => {
    if (clips.length + list.length > MAX_CLIPS) { toast.error(`Up to ${MAX_CLIPS} clips.`); return; }
    setBusy('add');
    const added: Source[] = [];
    for (const f of list) { try { added.push(await loadSource(f)); } catch (e) { toast.error((e as Error).message); } }
    setBusy(null);
    if (!added.length) return;
    setSources((s) => ({ ...s, ...Object.fromEntries(added.map((x) => [x.id, x])) }));
    const more = added.map((s): Clip => ({ id: nid(), source: s.id, kind: s.kind, duration: s.duration, start: 0, end: s.kind === 'image' ? IMAGE_SECONDS : s.duration, volume: 1 }));
    // In after the chosen clip, or at the end.
    const at = selIndex >= 0 ? selIndex + 1 : clips.length;
    commit({ clips: [...clips.slice(0, at), ...more, ...clips.slice(at)] });
    setSelected(more[0].id);
    if (audio.current) graph();
  };

  const addMusic = async (f: File) => {
    const url = URL.createObjectURL(f);
    const el = new Audio();
    el.src = url; el.preload = 'auto';
    try { await new Promise<void>((res, rej) => { el.onloadedmetadata = () => res(); el.onerror = () => rej(new Error()); }); }
    catch { URL.revokeObjectURL(url); toast.error(`“${f.name}” isn’t a sound this browser can play.`); return; }
    if (music) { music.el.pause(); URL.revokeObjectURL(music.url); }
    setMusic({ name: f.name.replace(/\.[^.]+$/, '').slice(0, 60), url, el, volume: 0.5, fadeOut: true });
    setDirty(true);
    setPanel('music');
  };
  // A new music element joins the sound graph if it exists.
  useEffect(() => { if (music && audio.current && !audio.current.gains.has(music.el)) graph(); });

  const updateClip = (c: Clip) => commit({ clips: clips.map((x) => (x.id === c.id ? c : x)) });
  const hereInSel = () => { const hit = locate(clips, time); return hit && hit.clip.id === sel?.id ? hit.at : null; };

  const addText = (caption: boolean) => {
    const o: Overlay = { id: nid(), text: caption ? 'Caption' : 'Your text', from: Math.round(time * 10) / 10, to: Math.min(Math.max(total, 0.5), Math.round((time + 3) * 10) / 10), place: caption ? 'bottom' : 'middle', size: caption ? 0.05 : 0.08, color: '#ffffff', box: caption };
    commit({ overlays: [...overlays, o] });
    setPanel('text');
  };
  const setOverlay = (id: string, patch: Partial<Overlay>) => { setOverlays((os) => os.map((o) => (o.id === id ? { ...o, ...patch } : o))); setDirty(true); };
  const importCaptions = async (f: File) => {
    const found = parseCaptions(await f.text());
    if (!found.length) { toast.error('No captions found in that file (.srt or .vtt).'); return; }
    commit({ overlays: [...overlays, ...found.map((c): Overlay => ({ id: nid(), ...c, place: 'bottom', size: 0.05, color: '#ffffff', box: true }))] });
    toast.success(`${found.length} caption${found.length === 1 ? '' : 's'} added.`);
  };

  const download = (blob: Blob, file: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const exportVideo = async () => {
    if (!clips.length || exporting) return;
    if (total > MAX_SECONDS) { toast.error('Videos up to 15 minutes can be exported.'); return; }
    const fmt = typeof MediaRecorder === 'undefined' ? null : pickFormat((t) => MediaRecorder.isTypeSupported(t));
    const canvas = canvasRef.current;
    if (!fmt || !canvas?.captureStream) { toast.error('This browser can’t make videos. Try Chrome, Edge, Firefox or Safari.'); return; }
    if (playingRef.current) stop();
    const a = graph();
    await a.ctx.resume();
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...a.rec.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: fmt.type, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 160_000 });
    const parts: Blob[] = [];
    const job = { rec, cancelled: false };
    recorder.current = job;
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      a.monitor.gain.value = 1;
      exportingRef.current = false;
      recorder.current = null;
      setExporting(null);
      if (job.cancelled || !parts.length) return;
      download(new Blob(parts, { type: fmt.type.split(';')[0] }), `${name || 'video'}.${fmt.ext}`);
      setDirty(false);
      toast.success('Your video is ready.');
    };
    a.monitor.gain.value = 0; // quiet while it records
    exportingRef.current = true;
    setExporting({ progress: 0 });
    timeRef.current = 0;
    paint(0);
    await new Promise((r) => setTimeout(r, 250));
    rec.start(1000);
    await play(() => setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 300));
  };
  const cancelExport = () => {
    const job = recorder.current;
    if (!job) return;
    job.cancelled = true;
    onEnd.current = null;
    stop();
    if (job.rec.state === 'recording') job.rec.stop();
  };

  const close = async () => {
    if (exporting) cancelExport();
    if (!dirty || await confirmDialog({ title: 'Close the video editor?', message: 'Your edits aren’t kept: export the video first to keep it.', confirmLabel: 'Close' })) onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); if (!exporting) void play(); }
  };

  const sorted = [...overlays].sort((a, b) => a.from - b.from);
  const tabs: { value: Panel; label: string }[] = [{ value: 'clip', label: 'Clip' }, { value: 'text', label: 'Text' }, { value: 'music', label: 'Music' }, { value: 'video', label: 'Video' }];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-100 dark:bg-[#0b0f1e]" onKeyDown={onKey}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121830] overflow-x-auto">
        <button type="button" onClick={() => void close()} aria-label="Close the video editor" className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
        <input value={name} onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]/g, '').slice(0, 60))} aria-label="Video name" className="text-sm font-semibold bg-transparent text-zinc-900 dark:text-white rounded-md px-1.5 py-1 w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">{clock(total)} · {clips.length} clip{clips.length === 1 ? '' : 's'}</span>
        <div className="ms-auto flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => step(undo, setUndo, setRedo)} disabled={!undo.length || !!exporting} aria-label="Undo" title="Undo" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 disabled:opacity-30"><Undo2 className="w-4 h-4" /></button>
          <button type="button" onClick={() => step(redo, setRedo, setUndo)} disabled={!redo.length || !!exporting} aria-label="Redo" title="Redo" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 disabled:opacity-30"><Redo2 className="w-4 h-4" /></button>
          <input ref={addRef} type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void addFiles(fs); }} />
          <button type="button" onClick={() => addRef.current?.click()} disabled={!!busy || !!exporting} className="btn-secondary btn-sm">{busy === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}Add clips</button>
          <button type="button" onClick={() => void exportVideo()} disabled={!clips.length || !!exporting || !!busy} className="btn-primary btn-sm"><Download className="w-3.5 h-3.5" />Export video</button>
        </div>
      </div>

      {busy === 'open' ? (
        <div className="flex-1 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" aria-label="Opening the clips" /></div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-3 md:p-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-3 min-w-0">
              <div className="rounded-2xl bg-black overflow-hidden" style={{ height: 'min(56vh, 520px)' }}>
                <canvas ref={canvasRef} width={out.w} height={out.h} role="img" aria-label={`Preview at ${clock(time)}`} className="w-full h-full object-contain" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 p-2 shadow-sm">
                <button type="button" onClick={() => void play()} disabled={!clips.length || !!exporting} aria-label={playing ? 'Pause' : 'Play'} className="w-10 h-10 shrink-0 rounded-xl grid place-items-center bg-indigo-600 text-white disabled:opacity-40">{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
                <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300 w-12 text-end shrink-0">{clock(time)}</span>
                <input type="range" min={0} max={Math.max(0.1, total)} step={0.05} value={Math.min(time, total)} onChange={(e) => seek(Number(e.target.value))} disabled={!!exporting} aria-label="Playhead" aria-valuetext={`${clock(time)} of ${clock(total)}`} className="flex-1 min-w-0 accent-indigo-600" />
                <span className="text-xs tabular-nums text-zinc-500 w-12 shrink-0">{clock(total)}</span>
                <button type="button" onClick={() => { const next = splitAt(clips, time, nid); if (next === clips) { toast.message('Move the playhead inside a clip, away from its ends.'); return; } commit({ clips: next }); haptic('tap'); }} disabled={!clips.length || !!exporting} title="Split the clip at the playhead" className="btn-secondary btn-sm shrink-0"><Scissors className="w-3.5 h-3.5" /><span className="max-sm:sr-only">Split</span></button>
              </div>
              <ol aria-label="Clips in order" className="flex gap-1.5 overflow-x-auto pb-1">
                {clips.map((c, i) => {
                  const s = sources[c.source];
                  return (
                    <li key={c.id} className="shrink-0" style={{ width: Math.max(72, Math.min(240, clipLength(c) * 14)) }}>
                      <button type="button" onClick={() => { setSelected(c.id); setPanel('clip'); seek(clipBegins(clips, i) + 0.001); }} aria-pressed={c.id === selected} aria-label={`Clip ${i + 1}: ${s?.name ?? ''}, ${clipLength(c).toFixed(1)} seconds`}
                        className={cn('relative block w-full h-16 rounded-xl overflow-hidden border-2 bg-zinc-800 bg-cover bg-center', c.id === selected ? 'border-indigo-500' : 'border-transparent')} style={s ? { backgroundImage: `url(${s.thumb})` } : undefined}>
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 text-start truncate tabular-nums">{i + 1} · {clipLength(c).toFixed(1)} s</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <aside className="rounded-2xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 p-3 shadow-sm space-y-3 self-start" aria-label="Edit">
              <Segmented<Panel> segments={tabs} value={panel} onChange={setPanel} label="Edit" className="w-full" />

              {panel === 'clip' && (sel ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{sources[sel.source]?.name} <span className="font-normal text-zinc-500">· clip {selIndex + 1}</span></p>
                  {sel.kind === 'video' ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <NumberBox label="Starts at (s)" value={sel.start} max={sel.duration} onChange={(v) => updateClip(retrim(sel, v, sel.end))} />
                        <NumberBox label="Ends at (s)" value={sel.end} max={sel.duration} onChange={(v) => updateClip(retrim(sel, sel.start, v))} />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" disabled={hereInSel() === null} onClick={() => updateClip(retrim(sel, hereInSel()!, sel.end))} className="btn-secondary btn-sm flex-1">Start here</button>
                        <button type="button" disabled={hereInSel() === null} onClick={() => updateClip(retrim(sel, sel.start, hereInSel()!))} className="btn-secondary btn-sm flex-1">End here</button>
                      </div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">Clip sound: {Math.round(sel.volume * 100)}%
                        <input type="range" min={0} max={1} step={0.05} value={sel.volume} onChange={(e) => updateClip({ ...sel, volume: Number(e.target.value) })} className="w-full accent-indigo-600" />
                      </label>
                      <p className="text-[11px] text-zinc-500">The source is {clock(sel.duration)} long. “Start here” and “End here” use the playhead.</p>
                    </>
                  ) : (
                    <NumberBox label="Shows for (s)" value={clipLength(sel)} min={0.2} max={600} onChange={(v) => updateClip(retrim(sel, 0, v))} />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => commit({ clips: moveClip(clips, selIndex, selIndex - 1) })} disabled={selIndex <= 0} className="btn-secondary btn-sm"><ArrowLeft className="w-3.5 h-3.5" />Earlier</button>
                    <button type="button" onClick={() => commit({ clips: moveClip(clips, selIndex, selIndex + 1) })} disabled={selIndex >= clips.length - 1} className="btn-secondary btn-sm">Later<ArrowRight className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => { const copy = { ...sel, id: nid() }; commit({ clips: [...clips.slice(0, selIndex + 1), copy, ...clips.slice(selIndex + 1)] }); setSelected(copy.id); }} disabled={clips.length >= MAX_CLIPS} className="btn-secondary btn-sm"><Copy className="w-3.5 h-3.5" />Duplicate</button>
                    <button type="button" onClick={() => { const next = clips.filter((c) => c.id !== sel.id); commit({ clips: next }); setSelected(next[Math.min(selIndex, next.length - 1)]?.id ?? null); }} className="btn-secondary btn-sm text-rose-600"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                  </div>
                </div>
              ) : <p className="text-sm text-zinc-500">Choose a clip below the preview, or add clips.</p>)}

              {panel === 'text' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => addText(false)} disabled={!clips.length} className="btn-secondary btn-sm"><Type className="w-3.5 h-3.5" />Add text</button>
                    <button type="button" onClick={() => addText(true)} disabled={!clips.length} className="btn-secondary btn-sm"><Captions className="w-3.5 h-3.5" />Add caption</button>
                    <input ref={capRef} type="file" accept=".srt,.vtt,text/vtt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importCaptions(f); }} />
                    <button type="button" onClick={() => capRef.current?.click()} className="btn-secondary btn-sm"><Upload className="w-3.5 h-3.5" />Captions file</button>
                    <button type="button" onClick={() => download(new Blob([toVtt(overlays)], { type: 'text/vtt' }), `${name || 'video'}.vtt`)} disabled={!overlays.length} className="btn-secondary btn-sm"><Download className="w-3.5 h-3.5" />Save .vtt</button>
                  </div>
                  {!sorted.length && <p className="text-sm text-zinc-500">Text appears at the playhead for 3 seconds; change its times below. A captions file (.srt or .vtt) adds them all at once.</p>}
                  <ul className="space-y-2 max-h-[28rem] overflow-y-auto">
                    {sorted.map((o, i) => (
                      <li key={o.id} className={cn('rounded-xl border p-2 space-y-2', time >= o.from && time < o.to ? 'border-indigo-400' : 'border-zinc-200 dark:border-white/10')}>
                        <textarea value={o.text} onChange={(e) => setOverlay(o.id, { text: e.target.value.slice(0, 300) })} rows={2} aria-label={`Text ${i + 1}`} className="input py-1.5 text-sm resize-none" />
                        <div className="grid grid-cols-2 gap-2">
                          <NumberBox label="From (s)" value={o.from} max={total} onChange={(v) => setOverlay(o.id, { from: Math.max(0, Math.min(v, o.to - 0.1)) })} />
                          <NumberBox label="To (s)" value={o.to} max={Math.max(total, o.to)} onChange={(v) => setOverlay(o.id, { to: Math.max(o.from + 0.1, v) })} />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select value={o.place} onChange={(e) => setOverlay(o.id, { place: e.target.value as Place })} aria-label={`Where text ${i + 1} goes`} className="input py-1 text-xs w-auto">
                            <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
                          </select>
                          <select value={SIZES.reduce((best, s) => (Math.abs(s.v - o.size) < Math.abs(best.v - o.size) ? s : best)).id} onChange={(e) => setOverlay(o.id, { size: SIZES.find((s) => s.id === e.target.value)!.v })} aria-label={`Size of text ${i + 1}`} className="input py-1 text-xs w-auto">
                            {SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                          </select>
                          {COLORS.map((c) => <button key={c} type="button" onClick={() => setOverlay(o.id, { color: c })} aria-label={`Colour ${c}`} aria-pressed={o.color === c} className={cn('w-6 h-6 rounded-full border border-zinc-300', o.color === c && 'ring-2 ring-indigo-500 ring-offset-1')} style={{ background: c }} />)}
                          <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300"><input type="checkbox" checked={o.box} onChange={(e) => setOverlay(o.id, { box: e.target.checked })} />Box</label>
                          <span className="ms-auto flex gap-1">
                            <button type="button" onClick={() => seek(o.from)} aria-label={`Go to text ${i + 1}`} className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Play className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => commit({ overlays: overlays.filter((x) => x.id !== o.id) })} aria-label={`Delete text ${i + 1}`} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-zinc-100 dark:hover:bg-white/10"><Trash2 className="w-3.5 h-3.5" /></button>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {panel === 'music' && (
                <div className="space-y-3">
                  <input ref={musicRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addMusic(f); }} />
                  {music ? (
                    <>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate flex items-center gap-1.5"><Music className="w-4 h-4 text-indigo-500 shrink-0" aria-hidden />{music.name}</p>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">Music volume: {Math.round(music.volume * 100)}%
                        <input type="range" min={0} max={1} step={0.05} value={music.volume} onChange={(e) => setMusic({ ...music, volume: Number(e.target.value) })} className="w-full accent-indigo-600" />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={music.fadeOut} onChange={(e) => setMusic({ ...music, fadeOut: e.target.checked })} />Fade out at the end</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => musicRef.current?.click()} className="btn-secondary btn-sm flex-1">Change</button>
                        <button type="button" onClick={() => { music.el.pause(); URL.revokeObjectURL(music.url); setMusic(null); }} className="btn-secondary btn-sm flex-1 text-rose-600">Remove</button>
                      </div>
                      <p className="text-[11px] text-zinc-500">The music starts with the video. Turn a clip’s own sound down in its Clip settings.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-zinc-500">Music plays under the whole video, from the start.</p>
                      <button type="button" onClick={() => musicRef.current?.click()} className="btn-secondary btn-sm w-full"><Music className="w-3.5 h-3.5" />Add music</button>
                    </>
                  )}
                </div>
              )}

              {panel === 'video' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Shape</p>
                  <Segmented segments={OUTPUTS.map((o) => ({ value: o.id, label: o.name }))} value={output} onChange={(v) => { setOutput(v); setDirty(true); }} label="Video shape" className="w-full" />
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Clips that are a different shape</p>
                  <Segmented segments={[{ value: 'fit' as const, label: 'Show all' }, { value: 'fill' as const, label: 'Fill' }]} value={fit} onChange={(v) => { setFit(v); setDirty(true); }} label="Clips that are a different shape" className="w-full" />
                  <p className="text-[11px] text-zinc-500">{out.w} × {out.h}. Exporting plays the video through once (it takes as long as the video), so keep this tab open. Chrome and Safari save MP4; other browsers save WebM.</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      )}

      {exporting && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="export-title" className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#121830] p-5 space-y-3">
            <h2 id="export-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Film className="w-4 h-4 text-indigo-500" aria-hidden />Making your video…</h2>
            <div role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(exporting.progress * 100)} className="h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
              <div className="h-full bg-indigo-600 transition-[width]" style={{ width: `${Math.round(exporting.progress * 100)}%` }} />
            </div>
            <p className="text-sm text-zinc-500 tabular-nums">{clock(exporting.progress * total)} of {clock(total)}. Keep this tab open and in front until it’s done.</p>
            <button type="button" onClick={cancelExport} className="btn-secondary btn-sm w-full">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
