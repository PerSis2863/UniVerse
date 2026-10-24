'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AudioWaveform, Crop, Download, FilePlus2, Loader2, Maximize2, Mic, Pause, Play, Redo2, Scissors, Square, TrendingDown, TrendingUp, Undo2, Volume1, Volume2, VolumeX, Wand2, Waves, X, ZoomIn } from 'lucide-react';
import { confirmDialog } from '@/components/ui/Dialogs';
import { haptic } from '@/lib/haptics';
import { clock, cut, fade, gain, insert, normalize, peaks, reduceNoise, resample, silence, toMono, trim, undoDepth, type Channels, type Range } from '@/lib/audio-edit';
import { encodeWav } from '@/lib/convert-formats';
import { useTick } from '@/lib/use-now';
import { cn } from '@/lib/utils';

// The Studio audio editor (Stage 5 · B9.15; src/lib/audio-edit.ts): open or record a sound, pick a
// part on the waveform, then keep it, cut it out, silence it, fade it, make it louder or quieter,
// even out the volume or turn down background hiss; add more audio at the cursor; save as WAV.
// Everything happens in the browser: the sound never leaves this device until it's saved.

const RATE = 44100;
/** Up to about 18 minutes of mono sound (stereo longer than about 9 minutes is mixed to mono). */
const MAX_SAMPLES = 48_000_000;
const HEIGHT = 168;

async function decode(blob: Blob): Promise<Channels> {
  const ctx = new OfflineAudioContext(1, 1, RATE);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer()).catch(() => { throw new Error('That file isn’t a sound this browser can open.'); });
  let ch: Channels = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, i) => buf.getChannelData(i).slice());
  if (ch.length * buf.length > MAX_SAMPLES && ch.length > 1) { ch = [toMono(ch)]; toast.message('Mixed to mono so the long recording fits.'); }
  if (ch[0].length > MAX_SAMPLES) throw new Error('That’s too long for the editor: up to about 18 minutes.');
  return ch;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Tool({ label, icon: Icon, onClick, disabled, className }: { label: string; icon: typeof Play; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} className={cn('h-10 px-2.5 rounded-xl inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent', className)}>
      <Icon className="w-4 h-4 shrink-0" aria-hidden /><span className="max-lg:sr-only">{label}</span>
    </button>
  );
}

export function AudioEditor({ file, onClose }: { file: File | null; onClose: () => void }) {
  const [ch, setCh] = useState<Channels | null>(null);
  const [name, setName] = useState(() => (file ? file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Sound' : 'Recording'));
  const [undo, setUndo] = useState<Channels[]>([]);
  const [redo, setRedo] = useState<Channels[]>([]);
  const [sel, setSel] = useState<Range | null>(null);
  const [cursor, setCursor] = useState(0);
  const [view, setView] = useState<Range | null>(null);
  const [pos, setPos] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(file ? 'open' : null);
  const [recSince, setRecSince] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [dirty, setDirty] = useState(false);
  const now = useTick(recSince !== null);
  const boxRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const dragRef = useRef<{ anchor: number; x: number; moved: boolean } | null>(null);
  // The cursor when the recording started, so it goes in where the cursor was.
  const recAt = useRef(0);

  const length = ch?.[0]?.length ?? 0;
  const shown = view ?? { start: 0, end: length };
  const hasSel = !!sel && sel.end - sel.start > RATE / 100;
  const playing = pos !== null;

  // The newest versions, for callbacks that run later (a recording that stops, a file that fails).
  const latest = useRef<{ onClose: () => void; add: (blob: Blob, at: number) => Promise<void> }>({ onClose, add: async () => {} });

  // Open the file.
  useEffect(() => {
    if (!file) return;
    let live = true;
    decode(file).then((c) => { if (live) setCh(c); }, (e: Error) => { if (live) { toast.error(e.message); latest.current.onClose(); } }).finally(() => { if (live) setBusy(null); });
    return () => { live = false; };
  }, [file]);

  // Stop sound and microphone when leaving.
  useEffect(() => () => {
    try { srcRef.current?.stop(); } catch { /* already stopped */ }
    srcRef.current = null;
    if (recRef.current?.state === 'recording') recRef.current.stop();
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ch]);

  // The waveform: one peak per pixel of the part shown.
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const cols = Math.max(1, Math.floor(width * dpr));
  const levels = useMemo(() => (ch && width ? peaks(ch.map((c) => c.subarray(shown.start, shown.end)), cols) : null), [ch, width, cols, shown.start, shown.end]);
  useEffect(() => {
    const c = waveRef.current;
    if (!c || !levels) return;
    c.width = cols; c.height = Math.floor(HEIGHT * dpr);
    const g = c.getContext('2d')!;
    const mid = c.height / 2;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(148,163,184,0.35)';
    g.fillRect(0, Math.floor(mid), c.width, 1);
    g.fillStyle = '#253745';
    for (let x = 0; x < levels.length; x++) { const h = Math.max(0.5, levels[x] * (mid - 2)); g.fillRect(x, mid - h, 1, h * 2); }
  }, [levels, cols, dpr]);

  const xToSample = (clientX: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round(shown.start + f * (shown.end - shown.start));
  };
  const pct = (s: number) => `${((s - shown.start) / Math.max(1, shown.end - shown.start)) * 100}%`;

  const ctx = () => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new AudioContext();
    return ctxRef.current;
  };
  const stop = () => {
    const src = srcRef.current;
    srcRef.current = null;
    try { src?.stop(); } catch { /* already stopped */ }
    if (pos !== null) setCursor(Math.round(pos));
    setPos(null);
  };
  const play = async () => {
    if (!ch || !length) return;
    if (playing) { stop(); return; }
    const ac = ctx();
    await ac.resume();
    const from = hasSel ? sel!.start : cursor >= length - 1 ? 0 : cursor;
    const to = hasSel ? sel!.end : length;
    const buf = ac.createBuffer(ch.length, Math.max(1, to - from), RATE);
    ch.forEach((c, k) => buf.getChannelData(k).set(c.subarray(from, to)));
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    const t0 = ac.currentTime;
    src.onended = () => { if (srcRef.current === src) { srcRef.current = null; setPos(null); setCursor(hasSel ? from : 0); } };
    src.start();
    srcRef.current = src;
    const tick = () => { if (srcRef.current !== src) return; setPos(Math.min(to, from + (ac.currentTime - t0) * RATE)); requestAnimationFrame(tick); };
    tick();
  };

  /** An edit: the old sound goes on the undo list. */
  const apply = (fn: (c: Channels) => Channels, after?: { sel?: Range | null; cursor?: number }) => {
    if (!ch) return;
    if (playing) stop();
    const next = fn(ch);
    setUndo((u) => [...u, ch].slice(-undoDepth(ch.length * length)));
    setRedo([]);
    setCh(next);
    setDirty(true);
    const n = next[0]?.length ?? 0;
    if (n !== length) setView(null);
    if (after && 'sel' in after) setSel(after.sel ?? null);
    setCursor(Math.min(n, after?.cursor ?? cursor));
    haptic('tap');
  };
  const back = (from: Channels[], to: (f: (s: Channels[]) => Channels[]) => void, setFrom: (f: (s: Channels[]) => Channels[]) => void) => {
    if (!ch || !from.length) return;
    if (playing) stop();
    const prev = from[from.length - 1];
    setFrom((s) => s.slice(0, -1));
    to((s) => [...s, ch]);
    setCh(prev);
    setView(null);
    setSel(null);
    setCursor((c) => Math.min(prev[0]?.length ?? 0, c));
  };

  /** Sound from a file or the microphone, put in at the cursor (or as the whole sound). */
  const add = async (blob: Blob, at: number) => {
    setBusy('add');
    try {
      const more = await decode(blob);
      if (!ch) { setCh(more); setDirty(true); return; }
      if (ch.length * (length + more[0].length) > MAX_SAMPLES) throw new Error('That would make it too long for the editor.');
      apply((c) => insert(c, at, more), { sel: { start: at, end: at + more[0].length }, cursor: at });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  useEffect(() => { latest.current = { onClose, add }; });

  const record = async () => {
    if (recRef.current?.state === 'recording') { recRef.current.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast.error('Recording isn’t available in this browser.'); return; }
    if (playing) stop();
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { toast.error('The microphone is blocked: allow it in your browser’s site settings.'); return; }
    const rec = new MediaRecorder(stream);
    const parts: Blob[] = [];
    recAt.current = ch ? cursor : 0;
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      setRecSince(null);
      if (parts.length) void latest.current.add(new Blob(parts, { type: rec.mimeType || 'audio/webm' }), recAt.current);
    };
    rec.start(1000);
    recRef.current = rec;
    setRecSince(Date.now());
    haptic('tap');
  };

  const save = (voice: boolean) => {
    if (!ch) return;
    const out = voice ? [resample(toMono(ch), RATE, 22050)] : ch;
    download(new Blob([encodeWav(out, voice ? 22050 : RATE)], { type: 'audio/wav' }), `${name}${voice ? '-voice' : ''}.wav`);
    setDirty(false);
  };
  // MP3 (Stage 5 · Q22): about a tenth of the WAV's size, plays everywhere; made in this browser.
  const saveMp3 = async () => {
    if (!ch) return;
    setBusy('mp3');
    try {
      const { convertMedia } = await import('@/components/docs/convert-engine');
      download(await convertMedia(new Blob([encodeWav(ch, RATE)], { type: 'audio/wav' }), `${name}.wav`, 'mp3'), `${name}.mp3`);
      setDirty(false);
    } catch (e) { toast.error((e as Error).message || 'Couldn’t make the MP3.'); }
    finally { setBusy(null); }
  };

  const close = async () => {
    if (recSince !== null) recRef.current?.stop();
    if (!dirty || await confirmDialog({ title: 'Close the audio editor?', message: 'Unsaved changes are lost: save the sound first to keep it.', confirmLabel: 'Close' })) onClose();
  };

  // Selection by dragging; a tap moves the cursor.
  const onDown = (e: React.PointerEvent) => {
    if (!ch) return;
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    dragRef.current = { anchor: xToSample(e.clientX), x: e.clientX, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
    if (d.moved) { const s = xToSample(e.clientX); setSel({ start: Math.min(d.anchor, s), end: Math.max(d.anchor, s) }); }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    if (playing) stop();
    setSel(null);
    setCursor(xToSample(e.clientX));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!ch) return;
    const step = Math.max(1, Math.round((shown.end - shown.start) / 100)) * (e.altKey ? 10 : 1);
    const go = (to: number, extend: boolean) => {
      to = Math.max(0, Math.min(length, to));
      e.preventDefault();
      if (extend) { const anchor = sel ? (cursor === sel.start ? sel.end : sel.start) : cursor; setSel({ start: Math.min(anchor, to), end: Math.max(anchor, to) }); }
      else setSel(null);
      setCursor(to);
    };
    if (e.key === 'ArrowRight') go(cursor + step, e.shiftKey);
    else if (e.key === 'ArrowLeft') go(cursor - step, e.shiftKey);
    else if (e.key === 'Home') go(0, e.shiftKey);
    else if (e.key === 'End') go(length, e.shiftKey);
    else if (e.key === ' ' || e.key === 'k') { e.preventDefault(); void play(); }
    else if (e.key === 'Escape') setSel(null);
  };

  const secs = (s: number) => s / RATE;
  const setSelSecs = (which: 'start' | 'end', v: string) => {
    const n = Math.round(Number(v) * RATE);
    if (!Number.isFinite(n)) return;
    const cur = sel ?? { start: cursor, end: cursor };
    const next = { ...cur, [which]: Math.max(0, Math.min(length, n)) };
    setSel({ start: Math.min(next.start, next.end), end: Math.max(next.start, next.end) });
  };
  const edge = (dir: 'in' | 'out'): Range => (hasSel ? sel! : dir === 'in' ? { start: 0, end: Math.min(length, RATE * 2) } : { start: Math.max(0, length - RATE * 2), end: length });
  const recording = recSince !== null;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-100 dark:bg-[#11212d]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-white/10 bg-white dark:bg-[#11212d] overflow-x-auto">
        <button type="button" onClick={() => void close()} aria-label="Close the audio editor" className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
        <input value={name} onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]/g, '').slice(0, 60))} aria-label="Sound name" className="text-sm font-semibold bg-transparent text-zinc-900 dark:text-white rounded-md px-1.5 py-1 w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        {!!length && <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">{clock(secs(length))} · {ch!.length === 1 ? 'mono' : 'stereo'}</span>}
        <div className="ms-auto flex items-center gap-1 shrink-0">
          <input ref={addRef} type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void add(f, ch ? cursor : 0); e.target.value = ''; }} />
          <button type="button" onClick={() => addRef.current?.click()} disabled={!!busy || recording} className="btn-secondary btn-sm" title="Adds a sound file at the cursor">{busy === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}{ch ? 'Add audio' : 'Open audio'}</button>
          <button type="button" onClick={() => void record()} disabled={!!busy} className={cn('btn-sm', recording ? 'btn-danger' : 'btn-secondary')} aria-pressed={recording}>
            {recording ? <><Square className="w-3.5 h-3.5" />Stop <span className="tabular-nums">{clock(Math.max(0, (now - recSince!) / 1000))}</span></> : <><Mic className="w-3.5 h-3.5" />{ch ? 'Record here' : 'Record'}</>}
          </button>
          <button type="button" onClick={() => save(true)} disabled={!length || recording} className="btn-secondary btn-sm" title="Mono, 22 kHz: about a quarter of the size, fine for speech">Smaller file</button>
          <button type="button" onClick={() => save(false)} disabled={!length || recording} className="btn-secondary btn-sm">Save WAV</button>
          <button type="button" onClick={() => void saveMp3()} disabled={!length || recording || !!busy} className="btn-primary btn-sm">{busy === 'mp3' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Save MP3</button>
        </div>
      </div>

      {!ch ? (
        <div className="flex-1 grid place-items-center p-6 text-center">
          {busy ? <Loader2 className="w-6 h-6 animate-spin text-zinc-400" aria-label="Opening the sound" /> : (
            <div className="max-w-sm space-y-3">
              <AudioWaveform className="w-10 h-10 mx-auto text-indigo-500" aria-hidden />
              <p className="font-semibold text-zinc-900 dark:text-white">{recording ? 'Recording… press Stop when you’re done.' : 'Record something or open a sound to start.'}</p>
              <p className="text-sm text-zinc-500">Podcasts, voice assignments, interviews: trim, cut, fade and clean them up, then save.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-6">
          <div className="max-w-5xl mx-auto space-y-3">
            <div role="toolbar" aria-label="Edits" className="flex flex-wrap items-center gap-1 rounded-2xl bg-white dark:bg-[#11212d] border border-zinc-200 dark:border-white/10 p-1 shadow-sm">
              <button type="button" onClick={() => void play()} aria-label={playing ? 'Pause' : hasSel ? 'Play the selection' : 'Play'} className="w-10 h-10 rounded-xl grid place-items-center bg-indigo-600 text-white">{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
              <span className="w-px h-6 bg-zinc-200 dark:bg-white/10 mx-1" aria-hidden />
              <Tool label="Keep only this" icon={Crop} disabled={!hasSel} onClick={() => apply((c) => trim(c, sel!), { sel: null, cursor: 0 })} />
              <Tool label="Cut out" icon={Scissors} disabled={!hasSel} onClick={() => apply((c) => cut(c, sel!), { sel: null, cursor: sel!.start })} />
              <Tool label="Silence" icon={VolumeX} disabled={!hasSel} onClick={() => apply((c) => silence(c, sel!))} />
              <span className="w-px h-6 bg-zinc-200 dark:bg-white/10 mx-1" aria-hidden />
              <Tool label="Fade in" icon={TrendingUp} onClick={() => apply((c) => fade(c, edge('in'), 'in'))} />
              <Tool label="Fade out" icon={TrendingDown} onClick={() => apply((c) => fade(c, edge('out'), 'out'))} />
              <Tool label="Louder" icon={Volume2} onClick={() => apply((c) => gain(c, 3, hasSel ? sel! : undefined))} />
              <Tool label="Quieter" icon={Volume1} onClick={() => apply((c) => gain(c, -3, hasSel ? sel! : undefined))} />
              <Tool label="Even out volume" icon={Wand2} onClick={() => apply((c) => normalize(c))} />
              <Tool label="Reduce hiss" icon={Waves} onClick={() => apply((c) => reduceNoise(c, RATE))} />
              <span className="w-px h-6 bg-zinc-200 dark:bg-white/10 mx-1" aria-hidden />
              <Tool label="Undo" icon={Undo2} disabled={!undo.length} onClick={() => back(undo, setRedo, setUndo)} />
              <Tool label="Redo" icon={Redo2} disabled={!redo.length} onClick={() => back(redo, setUndo, setRedo)} />
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#11212d] border border-zinc-200 dark:border-white/10 p-3 shadow-sm">
              <div ref={boxRef} tabIndex={0} role="slider" aria-label="Sound position: arrows move, Shift and arrows select, Space plays"
                aria-valuemin={0} aria-valuemax={Math.round(secs(length) * 10) / 10} aria-valuenow={Math.round(secs(cursor) * 10) / 10}
                aria-valuetext={hasSel ? `${clock(secs(sel!.start))} to ${clock(secs(sel!.end))} selected` : clock(secs(cursor))}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onKeyDown={onKey}
                className="relative rounded-xl bg-zinc-50 dark:bg-white/5 touch-none cursor-text select-none overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" style={{ height: HEIGHT }}>
                <canvas ref={waveRef} className="absolute inset-0 w-full h-full" aria-hidden />
                {hasSel && <div className="absolute inset-y-0 bg-indigo-500/20 border-x-2 border-indigo-500 pointer-events-none" style={{ left: pct(sel!.start), width: `calc(${pct(sel!.end)} - ${pct(sel!.start)})` }} aria-hidden />}
                {(pos ?? cursor) >= shown.start && (pos ?? cursor) <= shown.end && <div className="absolute inset-y-0 w-0.5 bg-rose-500 pointer-events-none" style={{ left: pct(pos ?? cursor) }} aria-hidden />}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500 tabular-nums">
                <span>{clock(secs(shown.start))}</span>
                <span aria-live={playing ? 'off' : 'polite'}>{playing ? clock(secs(pos!)) : hasSel ? `${(secs(sel!.end - sel!.start)).toFixed(1)} s selected` : `Cursor ${clock(secs(cursor))}`}</span>
                <span>{clock(secs(shown.end))}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">From
                <input type="number" min={0} step={0.1} max={Math.round(secs(length) * 10) / 10} aria-label="Selection starts at (seconds)" value={hasSel ? Math.round(secs(sel!.start) * 10) / 10 : ''} placeholder="0.0" onChange={(e) => setSelSecs('start', e.target.value)} className="input w-24 py-1 tabular-nums" />
              </label>
              <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">to
                <input type="number" min={0} step={0.1} max={Math.round(secs(length) * 10) / 10} aria-label="Selection ends at (seconds)" value={hasSel ? Math.round(secs(sel!.end) * 10) / 10 : ''} placeholder={(Math.round(secs(length) * 10) / 10).toFixed(1)} onChange={(e) => setSelSecs('end', e.target.value)} className="input w-24 py-1 tabular-nums" />
              </label>
              <span className="text-zinc-500">seconds</span>
              <button type="button" onClick={() => setSel({ start: 0, end: length })} className="btn-secondary btn-sm">Select all</button>
              {hasSel && <button type="button" onClick={() => setSel(null)} className="btn-secondary btn-sm">Clear</button>}
              <div className="ms-auto flex gap-1">
                <button type="button" onClick={() => setView({ start: sel!.start, end: sel!.end })} disabled={!hasSel} className="btn-secondary btn-sm"><ZoomIn className="w-3.5 h-3.5" />Zoom to selection</button>
                <button type="button" onClick={() => setView(null)} disabled={!view} className="btn-secondary btn-sm"><Maximize2 className="w-3.5 h-3.5" />Show all</button>
              </div>
            </div>
            <p className="text-xs text-zinc-500">Drag on the waveform to pick a part, or tap to move the cursor. With nothing picked, Fade in and Fade out use the first or last 2 seconds, and Louder and Quieter change the whole sound.</p>
          </div>
        </div>
      )}
    </div>
  );
}
