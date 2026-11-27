'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Code2, Download, Trash2, Wand2 } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import * as S from '@/lib/lab/scenario';
import * as RN from '@/lib/lab/render';
import * as RB from '@/lib/lab/rosbag';
import { shareFragment } from '@/lib/lab/share';
import { ui } from './bench-ui';
import { PRESETS, specOf } from './scenario-presets';

// Hyperion Simulate → Machines → Labeller (M577, after MathWorks' Ground Truth Labeler): frames from a driving scenario's
// camera or your own pictures, boxes drawn by dragging with a label, selected and removed; automation: labels from the
// scenario's own truth, or boxes filled in between two keyframes; the labels downloaded as JSON or carried into Code.
// Pictures are read in the browser; nothing is uploaded.

interface Box { label: string; x: number; y: number; w: number; h: number; auto?: boolean }
interface Frame { name: string; src: CanvasImageSource | ImageData | null; w: number; h: number; t?: number }
const LABELS0 = [{ name: 'car', colour: '#2563eb' }, { name: 'truck', colour: '#7c3aed' }, { name: 'pedestrian', colour: '#ea580c' }, { name: 'bicycle', colour: '#0891b2' }];
const W0 = 640, H0 = 360;

export function LabelBench() {
  const dark = useDarkMode(), router = useRouter();
  const [source, setSource] = useState<number>(0); // a preset's index, or −1 for your pictures
  const [mine, setMine] = useState<Frame[]>([]);
  const [labels, setLabels] = useState(LABELS0);
  const [label, setLabel] = useState('car');
  const [boxes, setBoxes] = useState<Record<number, Box[]>>({});
  const [note, setNote] = useState('');
  const [k, setK] = useState(0);
  const [sel, setSel] = useState(-1);
  const [newLabel, setNewLabel] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null), drag = useRef<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [, redraw] = useState(0);

  // the scenario's frames: every half second, rendered from the ego car's camera, with their true labels
  const scenario = useMemo(() => {
    if (source < 0) return null;
    const spec = specOf(PRESETS[source].make()), run = S.runScenario({ ...spec, sensors: [] }), every = Math.round(0.5 / spec.dt);
    const ks = run.t.map((_, i) => i).filter((i) => i % every === 0);
    return { run, ks, spec };
  }, [source]);
  const frames: Frame[] = useMemo(() => {
    if (!scenario) return mine;
    return scenario.ks.map((i) => { const im = RN.cameraImage(scenario.run, i, 0, { width: W0, height: H0 }), data = new ImageData(W0, H0); for (let p = 0; p < W0 * H0; p++) { data.data[4 * p] = im.rgb[3 * p]; data.data[4 * p + 1] = im.rgb[3 * p + 1]; data.data[4 * p + 2] = im.rgb[3 * p + 2]; data.data[4 * p + 3] = 255; } return { name: `t = ${scenario.run.t[i].toFixed(1)} s`, src: data, w: W0, h: H0, t: scenario.run.t[i] }; });
  }, [scenario, mine]);
  const n = frames.length, kk = Math.min(k, Math.max(0, n - 1)), frame = frames[kk], here = useMemo(() => boxes[kk] ?? [], [boxes, kk]);
  const colourOf = (l: string) => labels.find((x) => x.name === l)?.colour ?? '#16a34a';

  const draw = useEffectEvent(() => {
    const c = canvas.current;
    if (!c) return;
    const W = frame?.w ?? W0, H = frame?.h ?? H0, scale = Math.min(1, 900 / W), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.style.width = `${W * scale}px`; c.style.height = `${H * scale}px`; c.width = Math.round(W * scale * dpr); c.height = Math.round(H * scale * dpr);
    const g = c.getContext('2d')!; g.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    g.fillStyle = dark ? '#18181b' : '#f4f4f5'; g.fillRect(0, 0, W, H);
    if (frame?.src instanceof ImageData) { const tmp = document.createElement('canvas'); tmp.width = frame.w; tmp.height = frame.h; tmp.getContext('2d')!.putImageData(frame.src, 0, 0); g.drawImage(tmp, 0, 0); }
    else if (frame?.src) g.drawImage(frame.src, 0, 0, W, H);
    here.forEach((b, i) => {
      const col = colourOf(b.label); g.lineWidth = i === sel ? 3 / scale : 2 / scale; g.strokeStyle = col; g.setLineDash(b.auto ? [6 / scale, 4 / scale] : []); g.strokeRect(b.x, b.y, b.w, b.h); g.setLineDash([]);
      g.font = `${12 / scale}px Inter, sans-serif`; const tw = g.measureText(b.label).width + 8 / scale; g.fillStyle = col; g.fillRect(b.x, b.y - 16 / scale, tw, 16 / scale); g.fillStyle = '#ffffff'; g.fillText(b.label, b.x + 4 / scale, b.y - 4 / scale);
    });
    const d = drag.current; if (d) { g.strokeStyle = colourOf(label); g.lineWidth = 2 / scale; g.setLineDash([4 / scale, 3 / scale]); g.strokeRect(Math.min(d.x, d.x2), Math.min(d.y, d.y2), Math.abs(d.x2 - d.x), Math.abs(d.y2 - d.y)); g.setLineDash([]); }
    if (!frame) { g.fillStyle = dark ? '#d4d4d8' : '#52525b'; g.font = '14px Inter, sans-serif'; g.fillText('Open some pictures to label (they stay on this computer).', 24, H / 2); }
  });
  useEffect(() => { draw(); });

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(), W = frame?.w ?? W0; const s = r.width / W; return [(e.clientX - r.left) / s, (e.clientY - r.top) / s] as const; };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!frame) return;
    const [x, y] = at(e), hit = here.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit >= 0) { setSel(hit); return; }
    setSel(-1); drag.current = { x, y, x2: x, y2: y }; e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drag.current) return; const [x, y] = at(e); drag.current = { ...drag.current, x2: x, y2: y }; redraw((v) => v + 1); };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    const b: Box = { label, x: Math.min(d.x, d.x2), y: Math.min(d.y, d.y2), w: Math.abs(d.x2 - d.x), h: Math.abs(d.y2 - d.y) };
    if (b.w > 3 && b.h > 3) setBoxes((all) => ({ ...all, [kk]: [...(all[kk] ?? []), b] }));
    redraw((v) => v + 1);
  };
  const remove = () => { if (sel < 0) return; setBoxes((all) => ({ ...all, [kk]: (all[kk] ?? []).filter((_, i) => i !== sel) })); setSel(-1); };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); } else if (e.key === 'ArrowRight') setK((v) => Math.min(n - 1, v + 1)); else if (e.key === 'ArrowLeft') setK((v) => Math.max(0, v - 1)); };

  // automation
  const fromTruth = () => {
    if (!scenario) return;
    const out: Record<number, Box[]> = {};
    scenario.ks.forEach((i, fi) => { out[fi] = RN.cameraImage(scenario.run, i, 0, { width: W0, height: H0 }).labels.filter((l) => l.visible >= 0.2).map((l) => ({ label: l.cls, x: l.box[0], y: l.box[1], w: l.box[2], h: l.box[3], auto: true })); });
    setBoxes(out); setSel(-1);
  };
  /** Between each pair of frames you labelled, the boxes of each label (in the order drawn) moved linearly. */
  const interpolate = () => {
    const keys = Object.keys(boxes).map(Number).filter((f) => (boxes[f] ?? []).some((b) => !b.auto)).sort((a, b) => a - b);
    if (keys.length < 2) return;
    const out = { ...boxes };
    for (let q = 0; q + 1 < keys.length; q++) {
      const ka = keys[q], kb = keys[q + 1], A = boxes[ka].filter((b) => !b.auto), B = boxes[kb].filter((b) => !b.auto);
      for (let f = ka + 1; f < kb; f++) {
        const made: Box[] = [];
        for (const l of new Set(A.map((b) => b.label))) { const a = A.filter((b) => b.label === l), b = B.filter((x) => x.label === l); for (let i = 0; i < Math.min(a.length, b.length); i++) { const [x, y, w, h] = RN.interpolateBox([a[i].x, a[i].y, a[i].w, a[i].h], [b[i].x, b[i].y, b[i].w, b[i].h], ka, kb, f); made.push({ label: l, x, y, w, h, auto: true }); } }
        out[f] = [...(boxes[f] ?? []).filter((b) => !b.auto), ...made];
      }
    }
    setBoxes(out);
  };
  const openPictures = async (files: FileList | null) => {
    if (!files?.length) return;
    const list: Frame[] = [];
    setNote('');
    for (const f of [...files].slice(0, 500)) {
      // M578: a ROS bag or MCAP file gives its first camera topic's pictures
      if (/\.(bag|mcap)$/i.test(f.name)) {
        try {
          const bag = RB.readBag(new Uint8Array(await f.arrayBuffer())), k = bag.topics.findIndex((t) => /(^|\/)Image$/.test(t.type));
          if (k < 0) { setNote(`${f.name} has no camera (sensor_msgs/Image) topic.`); continue; }
          for (const m of bag.messages.filter((x) => x.topic === k).slice(0, 500 - list.length)) {
            const im = RB.readImage(RB.decodeMessage(bag, m) as Record<string, unknown>), px = new ImageData(im.w, im.h), n = im.w * im.h;
            for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const o = 4 * (y * im.w + x), q = y + x * im.h, sc = im.sixteen ? 1 / 257 : 1; for (let c = 0; c < 3; c++) px.data[o + c] = im.data[q + (im.ch > 1 ? c * n : 0)] * sc; px.data[o + 3] = 255; }
            list.push({ name: `${bag.topics[k].topic} ${(m.t - bag.start).toFixed(2)} s`, src: px, w: im.w, h: im.h, t: m.t - bag.start });
          }
        } catch (e) { setNote(`${f.name}: ${(e as Error).message}`); }
        continue;
      }
      if (!f.type.startsWith('image/')) continue;
      const bmp = await createImageBitmap(f); list.push({ name: f.name, src: bmp, w: bmp.width, h: bmp.height });
    }
    if (!list.length) return;
    setSource(-1); setMine(list); setBoxes({}); setK(0); setSel(-1);
  };
  const exportJson = () => {
    const data = { labelDefinitions: labels.map((l) => l.name), frames: frames.map((f, i) => ({ frame: f.name, ...(f.t !== undefined ? { time: f.t } : {}), boxes: (boxes[i] ?? []).map((b) => ({ label: b.label, box: [b.x, b.y, b.w, b.h].map((v) => +v.toFixed(1)) })) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = 'labels.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openInCode = async () => {
    const lines = frames.map((f, i) => `gt(${i + 1}).Frame = '${f.name.replace(/'/g, "''")}'; gt(${i + 1}).Boxes = [${(boxes[i] ?? []).map((b) => [b.x, b.y, b.w, b.h].map((v) => +v.toFixed(1)).join(' ')).join('; ')}]; gt(${i + 1}).Labels = {${(boxes[i] ?? []).map((b) => `'${b.label}'`).join(' ')}};`);
    const code = scenario ? `% Labels from Simulate → Machines → Labeller (the scenario "${PRESETS[source].name}")\n% The same automatic labels from a scenario in a script: scenarioGroundTruth(s, 'Times', 0:0.5:${scenario.spec.stop})\n${lines.join('\n')}` : `% Labels from Simulate → Machines → Labeller\n${lines.join('\n')}`;
    router.push(`/hyperion#${await shareFragment({ name: 'labels.m', view: 'code', code })}`);
  };
  const counts = labels.map((l) => [l.name, Object.values(boxes).flat().filter((b) => b.label === l.name).length] as const);
  const { label: lab, small } = ui;
  return (
    <div className="flex gap-3" onKeyDown={onKey}>
      <aside className="panel flex w-[17rem] shrink-0 flex-col gap-3 self-start p-4" aria-label="The labels" data-no-motion>
        <label className={lab}>Frames from
          <select className="input mt-1 w-full" value={source} onChange={(e) => { const i = +e.target.value; setSource(i); setBoxes({}); setK(0); setSel(-1); }}>
            {PRESETS.map((p, i) => <option key={p.name} value={i}>The scenario “{p.name}”</option>)}
            {mine.length > 0 && <option value={-1}>Your pictures ({mine.length})</option>}
          </select>
        </label>
        <label className={cn(small, 'cursor-pointer self-start border border-zinc-200 dark:border-white/15')}>Open pictures or a ROS bag…<input type="file" accept="image/*,.bag,.mcap" multiple className="sr-only" onChange={(e) => { void openPictures(e.target.files); e.target.value = ''; }} /></label>
        <fieldset className="space-y-1.5 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          <legend className={lab}>Drag on the picture to draw a</legend>
          <div className="flex flex-wrap gap-1.5">{labels.map((l) => <button key={l.name} type="button" aria-pressed={label === l.name} onClick={() => setLabel(l.name)} className={cn(small, 'border border-zinc-200 dark:border-white/15', label === l.name && ui.on)}><span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.colour }} aria-hidden />{l.name}</button>)}</div>
          <div className="flex gap-1.5"><input value={newLabel} onChange={(e) => setNewLabel(e.target.value.slice(0, 24))} className="input min-w-0 flex-1" placeholder="New label" aria-label="A new label's name" /><button type="button" className={small} disabled={!newLabel.trim() || labels.some((l) => l.name === newLabel.trim())} onClick={() => { const nm = newLabel.trim(); setLabels((ls) => [...ls, { name: nm, colour: ['#16a34a', '#db2777', '#ca8a04', '#0d9488'][ls.length % 4] }]); setLabel(nm); setNewLabel(''); }}>Add</button></div>
        </fieldset>
        <fieldset className="space-y-1.5 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          <legend className={lab}>Automate</legend>
          <button type="button" className={cn(small, 'w-full justify-start')} disabled={!scenario} onClick={fromTruth}><Wand2 className="h-3.5 w-3.5" aria-hidden />Label every frame from the scenario’s truth</button>
          <button type="button" className={cn(small, 'w-full justify-start')} onClick={interpolate}><Wand2 className="h-3.5 w-3.5" aria-hidden />Fill in between the frames you labelled</button>
        </fieldset>
        <div className="space-y-0.5 border-t border-zinc-200/80 pt-3 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300">{counts.map(([nm, c]) => <p key={nm} className="flex justify-between"><span>{nm}</span><span className="font-mono tabular-nums">{c}</span></p>)}</div>
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          <button type="button" className={small} onClick={exportJson} disabled={!n}><Download className="h-3.5 w-3.5" aria-hidden />Labels (.json)</button>
          <button type="button" className={small} onClick={() => void openInCode()} disabled={!n}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button>
        </div>
      </aside>
      <section className="panel flex min-w-0 flex-1 flex-col gap-3 p-3" aria-label="The frame" data-no-motion>
        <div className="flex items-center gap-2">
          <button type="button" className={small} disabled={kk <= 0} onClick={() => setK(kk - 1)} aria-label="Previous frame"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
          <input type="range" min={0} max={Math.max(0, n - 1)} value={kk} onChange={(e) => { setK(+e.target.value); setSel(-1); }} className="min-w-0 flex-1 accent-violet-600" aria-label="Frame" aria-valuetext={frame?.name ?? ''} />
          <button type="button" className={small} disabled={kk >= n - 1} onClick={() => setK(kk + 1)} aria-label="Next frame"><ChevronRight className="h-4 w-4" aria-hidden /></button>
          <span className="w-40 truncate text-end text-xs text-zinc-600 dark:text-zinc-300" translate="no">{frame?.name ?? '–'} · {kk + 1}/{n}</span>
          <button type="button" className={small} disabled={sel < 0} onClick={remove}><Trash2 className="h-3.5 w-3.5" aria-hidden />Remove box</button>
        </div>
        <canvas ref={canvas} tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={up} className="cursor-crosshair touch-none rounded-xl" role="img" aria-label={`${frame?.name ?? 'No frame'}: ${here.length} boxes (${here.map((b) => b.label).join(', ') || 'none'}). Drag to draw a box; Delete removes the selected one; the arrow keys change frames.`} />
        {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{note}</p>}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Dashed boxes were made automatically; solid ones you drew. Your pictures and bags stay on this computer.</p>
      </section>
    </div>
  );
}
