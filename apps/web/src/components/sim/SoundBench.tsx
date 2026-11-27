'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Ear, Image as ImageIcon, Pause, Play, RotateCcw, Trash2, Volume2 } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { cn } from '@/lib/utils';
import { mapOf } from '@/lib/lab/colormap';
import { blockId, C_AIR, roomModes, SOUND_PRESETS, SoundSim, spectrumPeaks, type SoundModel } from '@/lib/sim/acoustics';
import { NumField, ui } from './bench-ui';

// Hyperion Simulate → Sound (M551): the acoustics workbench. A floor plan (a room or the open air), walls and furniture
// (each absorbing a share), a source playing a tone or a pulse, a listener. The wave moves live; Loudness shows the
// level everywhere once it has settled; the listener's level; after a pulse, the room's resonances from the
// listener's spectrum beside the textbook's for a plain rectangle. Drag the source (S) and the listener (L).

const KEEP = 'uv-sim-sound';
const read = (): SoundModel => {
  try {
    const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null') as Partial<SoundModel> | null;
    if (!v || !v.source || !v.listener || !Array.isArray(v.blocks)) return SOUND_PRESETS[0].make();
    const num = (x: unknown, d: number, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);
    const width = num(v.width, 6, 1, 100), height = num(v.height, 4, 1, 100);
    return { width, height, edges: v.edges === 'open' ? 'open' : 'room',
      blocks: v.blocks.slice(0, 30).map((b) => ({ id: String(b.id), x: num(b.x, 0, 0, width), y: num(b.y, 0, 0, height), w: num(b.w, 0.2, 0.01, width), h: num(b.h, 1, 0.01, height), absorb: num(b.absorb, 0, 0, 1) })),
      source: { x: num(v.source.x, 1, 0, width), y: num(v.source.y, 1, 0, height), kind: v.source.kind === 'pulse' ? 'pulse' : 'tone', hz: num(v.source.hz, 120, 20, 2000) },
      listener: { x: num(v.listener.x, width - 1, 0, width), y: num(v.listener.y, 1, 0, height) } };
  } catch { return SOUND_PRESETS[0].make(); }
};

export function SoundBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [model, setModelNow] = useState<SoundModel>(read);
  const [view, setView] = useState<'wave' | 'loud'>('wave');
  const [paused, setPaused] = useState(still);
  const [selId, setSelId] = useState<string | null>(null);
  const [facts, setFacts] = useState<{ t: number; db: number; modes: { hz: number }[] }>({ t: 0, db: -Infinity, modes: [] });
  const sim = useRef<SoundSim | null>(null), canvas = useRef<HTMLCanvasElement>(null), keepTimer = useRef(0), drag = useRef<'source' | 'listener' | null>(null);
  const toMM = useRef<(px: number, py: number) => [number, number]>(() => [0, 0]);
  const turbo = useMemo(() => mapOf('turbo', 256)!, []);

  const setModel = (f: (m: SoundModel) => SoundModel) => setModelNow((m) => {
    const next = f(m);
    clearTimeout(keepTimer.current);
    keepTimer.current = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } }, 300);
    return next;
  });

  // A new simulation whenever the study changes; it runs while shown and not paused.
  useEffect(() => { sim.current = new SoundSim(model, 200); }, [model]);
  useEffect(() => {
    let raf = 0, last = 0;
    const draw = () => {
      const s = sim.current, c = canvas.current;
      if (!s || !c) return;
      const box = c.parentElement!, W = box.clientWidth, H = box.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
      if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const sc = Math.min((W - 24) / model.width, (H - 24) / model.height), ox = (W - model.width * sc) / 2, oy = (H + model.height * sc) / 2;
      const X = (x: number) => ox + x * sc, Y = (y: number) => oy - y * sc;
      toMM.current = (px, py) => [(px - ox) / sc, (oy - py) / sc];
      const img = new ImageData(s.nx, s.ny), lv = view === 'loud' ? s.levels() : null;
      let top = 1e-6;
      if (lv) { for (const v of lv) if (Number.isFinite(v)) top = Math.max(top, v); } else for (const v of s.p) top = Math.max(top, Math.abs(v));
      const bg = dark ? [24, 24, 27] : [250, 250, 250];
      for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) {
        const c0 = j * s.nx + i, k = ((s.ny - 1 - j) * s.nx + i) * 4;
        let rgb: number[];
        if (!s.air[c0]) rgb = dark ? [113, 113, 122] : [82, 82, 91];
        else if (lv) { const t = Number.isFinite(lv[c0]) ? Math.max(0, Math.min(1, (lv[c0] - (top - 40)) / 40)) : 0, row = turbo[Math.min(255, Math.floor(t * 255))]; rgb = row.map((x) => x * 255); }
        else { const v = Math.max(-1, Math.min(1, s.p[c0] / (top * 0.6))), a = v >= 0 ? [220, 38, 38] : [37, 99, 235], f = Math.abs(v); rgb = bg.map((b, q) => b + (a[q] - b) * f); }
        img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
      }
      const off = new OffscreenCanvas(s.nx, s.ny);
      off.getContext('2d')!.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(off, X(0), Y(s.ny * s.h), s.nx * s.h * sc, s.ny * s.h * sc);
      g.strokeStyle = model.edges === 'room' ? (dark ? '#e4e4e7' : '#27272a') : (dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)');
      g.setLineDash(model.edges === 'room' ? [] : [6, 4]); g.lineWidth = model.edges === 'room' ? 3 : 1;
      g.strokeRect(X(0), Y(model.height), model.width * sc, model.height * sc); g.setLineDash([]);
      for (const b of model.blocks) if (b.id === selId) { g.strokeStyle = dark ? '#fff' : '#000'; g.lineWidth = 2; g.strokeRect(X(b.x), Y(b.y + b.h), b.w * sc, b.h * sc); }
      const dot = (x: number, y: number, label: string, col: string) => { g.beginPath(); g.arc(X(x), Y(y), 9, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.fillStyle = '#fff'; g.font = '700 11px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, X(x), Y(y)); };
      dot(model.source.x, model.source.y, 'S', '#7c3aed'); dot(model.listener.x, model.listener.y, 'L', '#059669');
    };
    const loop = (now: number) => {
      const s = sim.current;
      if (s && !paused && !document.hidden) {
        // About 1 ms of sound per frame on screen (a slow-motion view): steps per frame from the time step.
        // A clap runs faster (its resonances need about 0.3 s of sound to show).
        s.step(model.source.kind === 'pulse' ? 60 : Math.max(1, Math.min(40, Math.round(4e-4 / s.dt))));
        if (now - last > 250) {
          last = now;
          const modes = model.source.kind === 'pulse' && s.t > 0.3 ? spectrumPeaks(s.trace.slice(-Math.round(0.6 / s.dt)), s.dt, 15, Math.min(200, C_AIR / (8 * s.h)), 6) : [];
          setFacts({ t: s.t, db: s.listenerDb(0.05), modes });
        }
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [model, paused, view, dark, selId, turbo]);

  const sel = model.blocks.find((b) => b.id === selId) ?? null;
  const setBlock = (id: string, f: (b: SoundModel['blocks'][number]) => SoundModel['blocks'][number]) => setModel((m) => ({ ...m, blocks: m.blocks.map((b) => (b.id === id ? f(b) : b)) }));
  const pt = (e: React.PointerEvent) => { const b = canvas.current?.getBoundingClientRect(); return b ? toMM.current(e.clientX - b.left, e.clientY - b.top) : null; };
  const png = () => canvas.current?.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'sound.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  const plain = model.edges === 'room' && !model.blocks.length;
  const { item, on, small, label, select } = ui;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[22rem_1fr]">
      <section className="panel space-y-3 p-3" aria-label="Study">
        <label className={label}>Start from
          <select className={cn(select, 'mt-1 w-full')} value="" onChange={(e) => { const p = SOUND_PRESETS.find((x) => x.id === e.target.value); if (p) { setModel(() => p.make()); setSelId(null); } }}>
            <option value="">Choose a ready-made study…</option>{SOUND_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Width" unit="m" min={1} value={model.width} onChange={(v) => setModel((m) => ({ ...m, width: Math.max(1, Math.min(100, v)) }))} />
          <NumField label="Depth" unit="m" min={1} value={model.height} onChange={(v) => setModel((m) => ({ ...m, height: Math.max(1, Math.min(100, v)) }))} />
        </div>
        <div><span className={label}>Its sides</span>
          <div className="mt-1"><Segmented<SoundModel['edges']> label="Its sides" value={model.edges} onChange={(v) => setModel((m) => ({ ...m, edges: v }))} segments={[{ value: 'room', label: 'Walls (a room)' }, { value: 'open', label: 'Open air' }]} /></div>
        </div>
        <div><span className={label}>The source plays</span>
          <div className="mt-1"><Segmented<SoundModel['source']['kind']> label="The source plays" value={model.source.kind} onChange={(v) => setModel((m) => ({ ...m, source: { ...m.source, kind: v } }))} segments={[{ value: 'tone', label: 'A tone' }, { value: 'pulse', label: 'A clap (pulse)' }]} /></div>
        </div>
        {model.source.kind === 'tone' && <NumField label="Frequency" unit={`Hz, wavelength ${+(C_AIR / model.source.hz).toPrecision(3)} m`} min={20} value={model.source.hz} onChange={(v) => setModel((m) => ({ ...m, source: { ...m.source, hz: Math.max(20, Math.min(2000, v)) } }))} />}
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400"><span className="flex-1">Walls and furniture</span>
            <button type="button" className={ui.add} onClick={() => { const id = blockId(); setModel((m) => ({ ...m, blocks: [...m.blocks, { id, x: m.width / 2 - 0.1, y: 0, w: 0.2, h: m.height / 2, absorb: 0 }] })); setSelId(id); }}>+ Add</button>
          </div>
          <div className="mt-1 space-y-0.5">
            {model.blocks.map((b, i) => <button key={b.id} type="button" className={cn(item, b.id === selId && on)} aria-current={b.id === selId || undefined} onClick={() => setSelId(b.id)}>Block {i + 1}<span className="font-normal text-zinc-500 dark:text-zinc-400">: {b.w.toFixed(1)} × {b.h.toFixed(1)} m, absorbs {Math.round(b.absorb * 100)}%</span></button>)}
          </div>
        </div>
        {sel && (
          <div className="space-y-2 rounded-xl border border-zinc-200 p-2.5 dark:border-white/10">
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Left" unit="m" value={+sel.x.toFixed(2)} onChange={(v) => setBlock(sel.id, (b) => ({ ...b, x: v }))} />
              <NumField label="Bottom" unit="m" value={+sel.y.toFixed(2)} onChange={(v) => setBlock(sel.id, (b) => ({ ...b, y: v }))} />
              <NumField label="Width" unit="m" min={0.01} value={+sel.w.toFixed(2)} onChange={(v) => setBlock(sel.id, (b) => ({ ...b, w: Math.max(0.01, v) }))} />
              <NumField label="Depth" unit="m" min={0.01} value={+sel.h.toFixed(2)} onChange={(v) => setBlock(sel.id, (b) => ({ ...b, h: Math.max(0.01, v) }))} />
            </div>
            <NumField label="Absorbs" unit="0 hard to 1 soft (a sofa ~0.6)" min={0} value={sel.absorb} onChange={(v) => setBlock(sel.id, (b) => ({ ...b, absorb: Math.max(0, Math.min(1, v)) }))} />
            <button type="button" className={small} onClick={() => { setModel((m) => ({ ...m, blocks: m.blocks.filter((b) => b.id !== sel.id) })); setSelId(null); }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Remove</button>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs" data-sound-facts>
          <div><dt className="text-zinc-500 dark:text-zinc-400">Time</dt><dd className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-white">{(facts.t * 1000).toFixed(0)} ms</dd></div>
          <div><dt className="text-zinc-500 dark:text-zinc-400"><Ear className="me-1 inline h-3 w-3" aria-hidden />At the listener</dt><dd className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-white">{Number.isFinite(facts.db) ? `${facts.db.toFixed(1)} dB` : '–'}</dd></div>
        </dl>
        {model.source.kind === 'pulse' && (
          <div className="text-xs">
            <p className={label}>The room’s resonances</p>
            <p className="mt-1 font-mono tabular-nums text-zinc-900 dark:text-white" data-sound-modes>{facts.modes.length ? facts.modes.map((m) => `${m.hz.toFixed(1)} Hz`).join(', ') : 'listening…'}</p>
            {plain && <p className="mt-1 text-zinc-500 dark:text-zinc-400">A plain rectangle by the textbook: {roomModes(model.width, model.height, 5).map((m) => `${m.hz.toFixed(1)}`).join(', ')} Hz.</p>}
          </div>
        )}
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">A floor plan seen from above, for sound at head height. Walls reflect, soft furniture soaks some up, open sides let the sound out. Low notes bend round corners; high ones cast sound shadows. A clap shows the room’s resonances (its boomy notes). Loudness needs the sound to settle first.</p>
      </section>
      <section className="panel flex min-h-[26rem] flex-col overflow-hidden p-0" aria-label="Graphics">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200/80 px-3 py-2 dark:border-white/10">
          <Segmented<'wave' | 'loud'> label="Show" value={view} onChange={setView} segments={[{ value: 'wave', label: 'The wave' }, { value: 'loud', label: 'Loudness (dB)' }]} />
          <button type="button" className={small} onClick={() => setPaused((p) => !p)} aria-pressed={!paused}>{paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}{paused ? 'Play' : 'Pause'}</button>
          <button type="button" className={small} onClick={() => { sim.current = new SoundSim(model, 200); setFacts({ t: 0, db: -Infinity, modes: [] }); }}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Restart</button>
          <button type="button" className={small} onClick={png}><ImageIcon className="h-3.5 w-3.5" aria-hidden />Picture</button>
          <span className="ms-auto inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><Volume2 className="h-3.5 w-3.5" aria-hidden />{view === 'wave' ? 'red pushes, blue pulls' : 'the loudest 40 dB'}</span>
        </div>
        <div className="relative flex-1">
          <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" role="img" aria-label={`Sound in the floor plan; at the listener ${Number.isFinite(facts.db) ? `${facts.db.toFixed(0)} dB` : 'nothing yet'}`}
            onPointerDown={(e) => { const p = pt(e); if (!p) return; const d = (q: { x: number; y: number }) => Math.hypot(q.x - p[0], q.y - p[1]); const near = Math.max(model.width, model.height) / 25;
              drag.current = d(model.source) < near ? 'source' : d(model.listener) < near ? 'listener' : null;
              if (drag.current) e.currentTarget.setPointerCapture(e.pointerId); else setSelId(model.blocks.find((b) => p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h)?.id ?? null); }}
            onPointerMove={(e) => { const k = drag.current, p = k && pt(e); if (!k || !p) return; const x = Math.max(0, Math.min(model.width, p[0])), y = Math.max(0, Math.min(model.height, p[1])); setModel((m) => ({ ...m, [k]: { ...m[k], x, y } })); }}
            onPointerUp={() => { drag.current = null; }} />
        </div>
      </section>
    </div>
  );
}
