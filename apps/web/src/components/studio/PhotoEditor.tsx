'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowUpRight, Brush, Circle, Copy, Crop, Download, Eraser, Eye, EyeOff, FlipHorizontal2, FlipVertical2, FolderOpen, ImagePlus, Layers, Loader2, Minus,
  MousePointer2, PaintBucket, Plus, Redo2, RotateCcw, RotateCw, Save, Scissors, SlidersHorizontal, Sparkles, Square, SquareDashed, Trash2, Type, Undo2, Wand2, X,
} from 'lucide-react';
import { confirmDialog } from '@/components/ui/Dialogs';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { FILTERS, MAX_SIDE, NO_ADJUST, SLIDERS, exportName, fitScale, ratioDrag, ratioRect, rectFrom, sharpen, hits, type Adjust, type Rect } from '@/lib/studio';
import {
  BLENDS, FONTS, FONT_NAMES, blankCanvas, canvasFromFile, cloneCanvas, cutLayer, deserialize, drawDoc, exportBlob, keepLocal, layerMatrix, measureText, newId, rasterLayer,
  removeBackground, serialize, type Doc, type Layer, type ShapeProps, type TextProps,
} from './studio-canvas';
import { SimpleBar, SimplePanel, type SimpleApi, type Task } from './PhotoSimple';

// The Studio photo editor (Stage 5 · B9.15), like a small Photoshop: layers (pictures, painting,
// text and shapes) with opacity and blend modes; move, brush, eraser, text, shapes, crop and select;
// adjustments and one-tap filters per layer, sharpen and background removal; undo and redo; export
// as PNG, JPG or WebP, and project files to keep editing. All of it runs in the browser.
// It opens in simple mode (PhotoSimple.tsx: crop, turn, adjust, looks, text, draw, background);
// "All tools" switches to the full editor, and the choice is remembered on this device.

type Tool = 'move' | 'brush' | 'eraser' | 'text' | 'shape' | 'crop' | 'select';
type Panel = 'layers' | 'adjust' | 'tool';
const TOOLS: { id: Tool; label: string; icon: typeof Brush; keys: string }[] = [
  { id: 'move', label: 'Move', icon: MousePointer2, keys: 'V' },
  { id: 'brush', label: 'Brush', icon: Brush, keys: 'B' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, keys: 'E' },
  { id: 'text', label: 'Text', icon: Type, keys: 'T' },
  { id: 'shape', label: 'Shapes', icon: Square, keys: 'U' },
  { id: 'select', label: 'Select', icon: SquareDashed, keys: 'M' },
  { id: 'crop', label: 'Crop', icon: Crop, keys: 'C' },
];
const HISTORY = 20;
const MODE_KEY = 'studio-photo-mode';
const swatches = ['#000000', '#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#0ea5e9', '#253745', '#6b5560', '#6b5560'];

export function PhotoEditor({ initial, onClose }: { initial: Doc; onClose: () => void }) {
  const [doc, setDoc] = useState<Doc>(initial);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initial.layers.at(-1)?.id ?? null);
  const [tool, setTool] = useState<Tool>('move');
  const [panel, setPanel] = useState<Panel>('layers');
  const [brush, setBrush] = useState({ size: 24, color: '#253745', opacity: 1 });
  const [shape, setShape] = useState<ShapeProps>({ type: 'rect', fill: null, stroke: '#253745', width: 8, radius: 12 });
  const [drag, setDrag] = useState<Rect | null>(null); // the crop or selection rectangle being drawn or kept
  const [busy, setBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [simple, setSimple] = useState(() => { try { return localStorage.getItem(MODE_KEY) !== 'all'; } catch { return true; } });
  const [task, setTask] = useState<Task | null>(null);
  const [ratio, setRatio] = useState<number | null>(null); // the simple crop's shape
  const [drawId, setDrawId] = useState<string | null>(null); // the simple mode's drawing layer: its eraser only takes away drawing
  const [thumb, setThumb] = useState<string | null>(null); // a small copy of the photo for the looks
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const before = useRef<Doc | null>(null); // the picture as it was when a drag began (one undo step per drag)
  const stroke = useRef<{ layer: string; last: { x: number; y: number } } | null>(null);
  const start = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const cropMove = useRef(false); // dragging the crop frame rather than drawing a new one
  const run = useRef<{ key: string; doc: Doc } | null>(null);
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; });

  const active = doc.layers.find((l) => l.id === activeId) ?? null;
  // The picture the simple jobs work on: the chosen picture, or the first one (never the drawing).
  const isPhoto = (l: Layer) => l.kind === 'raster' && l.visible && l.id !== drawId;
  const photo = active && isPhoto(active) ? active : doc.layers.find(isPhoto) ?? null;
  // In simple mode a picture filling the whole canvas stays put, so a tap on the photo never shifts it.
  const fixed = (l: Layer, d: Doc) => simple && l.kind === 'raster' && l.rotation === 0 && l.x <= 0 && l.y <= 0 && l.x + l.w >= d.w && l.y + l.h >= d.h;

  // ── History ──
  const commit = useCallback((next: Doc, from?: Doc) => {
    const prev = from ?? docRef.current;
    setPast((p) => [...p.slice(-(HISTORY - 1)), prev]);
    setFuture([]);
    setDoc(next);
  }, []);
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setFuture((f) => [docRef.current, ...f].slice(0, HISTORY));
      setDoc(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p, docRef.current].slice(-HISTORY));
      setDoc(f[0]);
      return f.slice(1);
    });
  }, []);
  const patchLayer = (id: string, patch: Partial<Layer>, live = false) => {
    const next = { ...docRef.current, layers: docRef.current.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
    if (live) setDoc(next); else commit(next);
  };
  // Changes to one thing in a row (dragging a size slider or a colour picker) make one undo step.
  const commitRun = (key: string, next: Doc) => {
    const r = run.current;
    if (r && r.key === key && r.doc === docRef.current) setDoc(next); else commit(next);
    run.current = { key, doc: next };
    docRef.current = next;
  };

  // ── Drawing the picture ──
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const raf = requestAnimationFrame(() => {
      if (c.width !== doc.w || c.height !== doc.h) { c.width = doc.w; c.height = doc.h; }
      drawDoc(c.getContext('2d')!, doc);
    });
    return () => cancelAnimationFrame(raf);
  }, [doc]);

  // Kept on this device (a couple of seconds after the last change), to carry on after a reload.
  useEffect(() => {
    const t = setTimeout(() => { void keepLocal(serialize(doc)); }, 2500);
    return () => clearTimeout(t);
  }, [doc]);

  // ── Opening pictures ──
  const addPicture = useCallback(async (file: Blob, name = 'Picture') => {
    setBusy('open');
    try {
      const c = await canvasFromFile(file);
      const d = docRef.current;
      const s = fitScale(c.width, c.height, d.w, d.h);
      const w = Math.round(c.width * s), h = Math.round(c.height * s);
      const l = rasterLayer(name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Picture', c, { x: Math.round((d.w - w) / 2), y: Math.round((d.h - h) / 2), w, h });
      commit({ ...d, layers: [...d.layers, l] });
      setActiveId(l.id);
      setTool('move');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }, [commit]);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); void addPicture(f, 'Pasted'); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addPicture]);

  // ── Keyboard: undo / redo, tools, delete ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod) return;
      const t = simple ? null : TOOLS.find((x) => x.keys.toLowerCase() === e.key.toLowerCase());
      if (t) { setTool(t.id); setDrag(null); }
      if (e.key === 'Escape') setDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, simple]);

  // ── Pointer on the canvas ──
  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * doc.w, y: ((e.clientY - r.top) / r.height) * doc.h };
  };
  const paintTo = (l: Layer, from: { x: number; y: number }, to: { x: number; y: number }, erase: boolean) => {
    const c = l.canvas!;
    const ctx = c.getContext('2d')!;
    ctx.save();
    ctx.setTransform(layerMatrix(l, c.width, c.height));
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.globalAlpha = erase ? 1 : brush.opacity;
    ctx.strokeStyle = brush.color;
    ctx.lineWidth = brush.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y);
    ctx.stroke();
    ctx.restore();
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* the pointer already went away */ }
    const p = point(e);
    const d = docRef.current;
    before.current = d;
    if (tool === 'move') {
      // Pick the top layer under the pointer (or keep the chosen one when clicking inside it),
      // preferring ones that can move over a photo that stays put.
      const movable = (l: Layer) => l.visible && hits(p, l) && !fixed(l, d);
      const top = active && movable(active) ? active : [...d.layers].reverse().find(movable) ?? [...d.layers].reverse().find((l) => l.visible && hits(p, l)) ?? null;
      if (top) {
        setActiveId(top.id);
        if (!fixed(top, d)) start.current = { x: p.x, y: p.y, ox: top.x, oy: top.y };
        if (simple && !task && top.kind === 'text') setTask('text');
      }
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      let target = active;
      if (simple) {
        // Simple mode draws on one drawing layer over the photo.
        target = d.layers.find((l) => l.id === drawId) ?? null;
        if (!target && tool === 'eraser') { toast('Nothing drawn yet.'); return; }
      } else if (tool === 'eraser' && (!target || target.kind !== 'raster')) { toast('Choose a picture or painting layer to erase.'); return; }
      // Painting goes on the chosen picture layer, or a new paint layer over everything.
      if (!target || target.kind !== 'raster') {
        target = rasterLayer(simple ? 'Drawing' : 'Paint', blankCanvas(d.w, d.h), { x: 0, y: 0, w: d.w, h: d.h });
        const next = { ...d, layers: [...d.layers, target] };
        setDoc(next);
        docRef.current = next;
        setActiveId(target.id);
        if (simple) setDrawId(target.id);
      }
      // A copy of its pixels, so undo keeps the old ones.
      const copy = { ...target, canvas: cloneCanvas(target.canvas!) };
      const next = { ...docRef.current, layers: docRef.current.layers.map((l) => (l.id === copy.id ? copy : l)) };
      paintTo(copy, p, p, tool === 'eraser');
      setDoc(next);
      docRef.current = next;
      stroke.current = { layer: copy.id, last: p };
      return;
    }
    if (tool === 'text') {
      const t: TextProps = { value: 'Your text', size: Math.round(Math.max(24, d.w / 18)), color: brush.color, font: FONTS[0], bold: true, italic: false, align: 'left', outline: null };
      const l = textLayer(t, p.x, p.y - measureText(t).h / 2);
      commit({ ...d, layers: [...d.layers, l] });
      setActiveId(l.id);
      setTool('move');
      setPanel('tool');
      return;
    }
    // Shapes, crop and select drag out a rectangle; dragging inside a crop frame moves it.
    cropMove.current = tool === 'crop' && !!drag && (drag.w < d.w || drag.h < d.h) && p.x >= drag.x && p.x <= drag.x + drag.w && p.y >= drag.y && p.y <= drag.y + drag.h;
    if (cropMove.current && drag) { start.current = { x: p.x, y: p.y, ox: drag.x, oy: drag.y }; return; }
    start.current = { x: p.x, y: p.y, ox: 0, oy: 0 };
    setDrag({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!before.current) return;
    const p = point(e);
    if (tool === 'move' && start.current && active) {
      patchLayer(active.id, { x: Math.round(start.current.ox + p.x - start.current.x), y: Math.round(start.current.oy + p.y - start.current.y) }, true);
      return;
    }
    if ((tool === 'brush' || tool === 'eraser') && stroke.current) {
      const l = docRef.current.layers.find((x) => x.id === stroke.current!.layer);
      if (!l) return;
      paintTo(l, stroke.current.last, p, tool === 'eraser');
      stroke.current.last = p;
      setDoc({ ...docRef.current });
      return;
    }
    if (start.current && cropMove.current && drag) {
      const s = start.current;
      setDrag({ ...drag, x: Math.round(Math.min(Math.max(0, s.ox + p.x - s.x), doc.w - drag.w)), y: Math.round(Math.min(Math.max(0, s.oy + p.y - s.y), doc.h - drag.h)) });
      return;
    }
    if (start.current && tool === 'crop' && simple && ratio) {
      setDrag(ratioDrag(start.current.x, start.current.y, p.x, p.y, ratio, doc.w, doc.h));
      return;
    }
    if (start.current && (tool === 'shape' || tool === 'crop' || tool === 'select')) {
      const shift = e.shiftKey && tool === 'shape' && shape.type !== 'line' && shape.type !== 'arrow';
      const dx = p.x - start.current.x, dy = p.y - start.current.y;
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      const end = shift ? { x: start.current.x + Math.sign(dx || 1) * side, y: start.current.y + Math.sign(dy || 1) * side } : p;
      setDrag(rectFrom(start.current.x, start.current.y, end.x, end.y, tool === 'shape' ? Infinity : doc.w, tool === 'shape' ? Infinity : doc.h));
    }
  };
  const onUp = () => {
    const from = before.current;
    before.current = null;
    if (!from) return;
    if (tool === 'move' && start.current) {
      start.current = null;
      if (docRef.current !== from) commit(docRef.current, from);
      return;
    }
    if ((tool === 'brush' || tool === 'eraser') && stroke.current) {
      stroke.current = null;
      commit({ ...docRef.current }, from);
      return;
    }
    start.current = null;
    cropMove.current = false;
    if (tool === 'shape' && drag) {
      const isLine = shape.type === 'line' || shape.type === 'arrow';
      const w = Math.max(isLine ? 40 : 8, drag.w), h = isLine ? Math.max(shape.width * 6 + 20, 24) : Math.max(8, drag.h);
      const l: Layer = { id: newId(), name: shape.type === 'rect' ? 'Rectangle' : shape.type === 'ellipse' ? 'Ellipse' : shape.type === 'line' ? 'Line' : 'Arrow', kind: 'shape', visible: true, opacity: 1, blend: 'source-over', adjust: { ...NO_ADJUST }, shape: { ...shape }, x: drag.x, y: isLine ? Math.round(drag.y + drag.h / 2 - h / 2) : drag.y, w, h, rotation: 0, flipX: false, flipY: false };
      commit({ ...docRef.current, layers: [...docRef.current.layers, l] }, from);
      setActiveId(l.id);
      setDrag(null);
    }
    // Crop and select keep their rectangle until applied.
    if ((tool === 'crop' || tool === 'select') && drag && (drag.w < 4 || drag.h < 4)) setDrag(null);
  };

  // ── Actions ──
  const applyCrop = () => {
    if (!drag || drag.w < 4 || drag.h < 4) return;
    const d = docRef.current;
    commit({ ...d, w: drag.w, h: drag.h, layers: d.layers.map((l) => ({ ...l, x: l.x - drag.x, y: l.y - drag.y })) });
    setDrag(null);
    setTool('move');
    haptic('success');
  };
  const onSelection = (what: 'delete' | 'fill' | 'copy') => {
    if (!drag || !active) { toast('Choose a layer first.'); return; }
    const d = docRef.current;
    if (what === 'copy') {
      const l = rasterLayer(`${active.name} (cut)`, cutLayer(active, drag), { ...drag });
      commit({ ...d, layers: [...d.layers, l] });
      setActiveId(l.id);
      setDrag(null);
      return;
    }
    if (active.kind !== 'raster') { toast('Deleting or filling works on picture and painting layers.'); return; }
    const copy = { ...active, canvas: cloneCanvas(active.canvas!) };
    const ctx = copy.canvas!.getContext('2d')!;
    ctx.setTransform(layerMatrix(copy, copy.canvas!.width, copy.canvas!.height));
    if (what === 'delete') ctx.clearRect(drag.x, drag.y, drag.w, drag.h);
    else { ctx.fillStyle = brush.color; ctx.fillRect(drag.x, drag.y, drag.w, drag.h); }
    commit({ ...d, layers: d.layers.map((l) => (l.id === copy.id ? copy : l)) });
  };
  const layerOp = async (op: 'up' | 'down' | 'duplicate' | 'delete' | 'sharpen' | 'cutout' | 'fit' | 'flipX' | 'flipY' | 'center', on: Layer | null = active) => {
    const d = docRef.current;
    const active = on; // the chosen layer, or the photo the simple jobs work on
    if (!active) return;
    const i = d.layers.findIndex((l) => l.id === active.id);
    const layers = [...d.layers];
    if (op === 'up' && i < layers.length - 1) [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]];
    else if (op === 'down' && i > 0) [layers[i], layers[i - 1]] = [layers[i - 1], layers[i]];
    else if (op === 'duplicate') { const c = { ...active, id: newId(), name: `${active.name} copy`, x: active.x + 20, y: active.y + 20, canvas: active.canvas ? cloneCanvas(active.canvas) : undefined }; layers.splice(i + 1, 0, c); commit({ ...d, layers }); setActiveId(c.id); return; }
    else if (op === 'delete') { layers.splice(i, 1); commit({ ...d, layers }); setActiveId(layers[Math.min(i, layers.length - 1)]?.id ?? null); return; }
    else if (op === 'flipX' || op === 'flipY') { patchLayer(active.id, op === 'flipX' ? { flipX: !active.flipX } : { flipY: !active.flipY }); return; }
    else if (op === 'center') { patchLayer(active.id, { x: Math.round((d.w - active.w) / 2), y: Math.round((d.h - active.h) / 2) }); return; }
    else if (op === 'fit') {
      const s = Math.min(d.w / active.w, d.h / active.h);
      const w = Math.round(active.w * s), h = Math.round(active.h * s);
      patchLayer(active.id, { w, h, x: Math.round((d.w - w) / 2), y: Math.round((d.h - h) / 2), rotation: 0 });
      return;
    } else if (op === 'sharpen' && active.canvas) {
      const c = cloneCanvas(active.canvas), ctx = c.getContext('2d')!;
      const img = ctx.getImageData(0, 0, c.width, c.height);
      img.data.set(sharpen(img.data, c.width, c.height, 0.5));
      ctx.putImageData(img, 0, 0);
      patchLayer(active.id, { canvas: c });
      return;
    } else if (op === 'cutout' && active.canvas) {
      setBusy('cutout');
      try { patchLayer(active.id, { canvas: await removeBackground(active.canvas) }); haptic('success'); toast.success('Background removed', { description: 'It works best on photos of people. Undo if it isn’t right.' }); }
      catch (e) { toast.error((e as Error).message || 'Couldn’t remove the background.'); }
      finally { setBusy(null); }
      return;
    } else return;
    commit({ ...d, layers });
  };
  const docOp = (op: 'rotateL' | 'rotateR' | 'flipX' | 'flipY') => {
    const d = docRef.current;
    if (op === 'flipX' || op === 'flipY') {
      commit({ ...d, layers: d.layers.map((l) => (op === 'flipX' ? { ...l, x: d.w - l.x - l.w, flipX: !l.flipX, rotation: -l.rotation } : { ...l, y: d.h - l.y - l.h, flipY: !l.flipY, rotation: -l.rotation })) });
      return;
    }
    // A quarter turn of the whole picture: the canvas swaps sides and every layer turns around its centre's new place.
    const cw = op === 'rotateR';
    commit({
      ...d, w: d.h, h: d.w,
      layers: d.layers.map((l) => {
        const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
        const nx = cw ? d.h - cy : cy, ny = cw ? cx : d.w - cx;
        return { ...l, x: Math.round(nx - l.w / 2), y: Math.round(ny - l.h / 2), rotation: ((l.rotation + (cw ? 90 : -90) + 540) % 360) - 180 };
      }),
    });
  };
  const addLayer = () => {
    const d = docRef.current;
    const l = rasterLayer('Paint', blankCanvas(d.w, d.h), { x: 0, y: 0, w: d.w, h: d.h });
    commit({ ...d, layers: [...d.layers, l] });
    setActiveId(l.id);
  };
  const setAdjust = (patch: Partial<Adjust>, live = false) => active && patchLayer(active.id, { adjust: { ...active.adjust, ...patch } }, live);
  const setText = (patch: Partial<TextProps>) => {
    if (!active?.text) return;
    const t = { ...active.text, ...patch };
    const m = measureText(t);
    const d = docRef.current;
    commitRun(`text ${active.id} ${Object.keys(patch).join()}`, { ...d, layers: d.layers.map((l) => (l.id === active.id ? { ...l, text: t, w: m.w, h: m.h } : l)) });
  };
  const saveProject = () => {
    const blob = new Blob([serialize(docRef.current)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportName(docRef.current.name, 'png').replace(/\.png$/, '.studio.json');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast.success('Project saved', { description: 'Open it here later to keep editing.' });
  };
  const openProject = async (f: File | undefined) => {
    if (!f) return;
    try {
      const d = await deserialize(await f.text());
      commit(d);
      setActiveId(d.layers.at(-1)?.id ?? null);
    } catch (e) { toast.error((e as Error).message || 'Couldn’t open that project.'); }
    if (projectRef.current) projectRef.current.value = '';
  };

  // ── Simple mode ──
  const switchMode = (on: boolean) => {
    setSimple(on);
    setTask(null);
    setTool('move');
    setDrag(null);
    setPanel('layers');
    try { localStorage.setItem(MODE_KEY, on ? 'simple' : 'all'); } catch { /* storage blocked: the choice just isn't remembered */ }
  };
  const openTask = (t: Task) => {
    const d = docRef.current;
    setTask(t);
    setTool(t === 'crop' ? 'crop' : t === 'draw' ? 'brush' : 'move');
    setDrag(t === 'crop' && ratio ? ratioRect(d.w, d.h, ratio) : null);
    if ((t === 'adjust' || t === 'looks' || t === 'background') && photo) setActiveId(photo.id);
    if (t === 'looks') setThumb(photo?.canvas ? smallCopy(photo.canvas) : null);
  };
  const done = () => {
    // Done keeps the chosen part, as in a phone's photo editor.
    if (task === 'crop' && drag && drag.w >= 4 && drag.h >= 4 && (drag.w < doc.w || drag.h < doc.h)) applyCrop();
    setTask(null);
    setTool('move');
    setDrag(null);
  };
  // A shaped crop's size: a percentage of the biggest frame of that shape.
  const biggest = ratio ? ratioRect(doc.w, doc.h, ratio) : null;
  const cropSize = biggest ? (drag ? Math.min(100, Math.round((drag.w / biggest.w) * 100)) : 100) : null;
  const setCropSize = (pct: number) => {
    if (!biggest) return;
    const w = Math.max(4, Math.round((biggest.w * pct) / 100)), h = Math.max(4, Math.round((biggest.h * pct) / 100));
    const cx = drag ? drag.x + drag.w / 2 : doc.w / 2, cy = drag ? drag.y + drag.h / 2 : doc.h / 2;
    setDrag({ w, h, x: Math.round(Math.min(Math.max(0, cx - w / 2), doc.w - w)), y: Math.round(Math.min(Math.max(0, cy - h / 2), doc.h - h)) });
  };
  const addText = () => {
    const d = docRef.current;
    const t: TextProps = { value: 'Your text', size: Math.round(Math.max(24, Math.min(d.w, d.h) / 9)), color: '#ffffff', font: FONTS[0], bold: true, italic: false, align: 'center', outline: '#000000' };
    const m = measureText(t);
    // Each new text a line lower than the last, so they don't land on top of each other.
    const n = d.layers.filter((l) => l.kind === 'text').length % 3;
    const l = textLayer(t, (d.w - m.w) / 2, Math.min(d.h - m.h, (d.h - m.h) / 2 + n * m.h * 1.2));
    commit({ ...d, layers: [...d.layers, l] });
    setActiveId(l.id);
  };
  const api: SimpleApi = {
    doc, photo, active, done,
    ratio, setRatio: (r) => { setRatio(r); setDrag(r ? ratioRect(doc.w, doc.h, r) : null); }, drag, applyCrop, cropSize, setCropSize,
    turn: docOp,
    setAdjust: (patch, live = false) => { if (photo) patchLayer(photo.id, { adjust: { ...photo.adjust, ...patch } }, live); },
    slideStart: () => { if (!before.current) before.current = docRef.current; },
    slideEnd: () => { const from = before.current; before.current = null; if (from && from !== docRef.current) commit(docRef.current, from); },
    sharpen: () => void layerOp('sharpen', photo), thumb,
    addText, setText, removeActive: () => void layerOp('delete'),
    brush, setBrush, eraser: tool === 'eraser', setEraser: (on) => setTool(on ? 'eraser' : 'brush'),
    cutout: () => void layerOp('cutout', photo), busy, setBackground: (c) => commitRun('background', { ...docRef.current, background: c }),
    addPhoto: () => fileRef.current?.click(),
  };

  // The rectangle of the chosen layer and of a drag, in screen terms (percentages of the picture).
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const box = active && tool === 'move' && !fixed(active, doc) ? active : null;
  // The picture's height: the screen less the bars around it (less the open job's panel in simple mode).
  const room = simple ? (task ? '60dvh - 15rem' : '100dvh - 20rem') : '100dvh - 15rem';

  const close = (
    <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Close the editor?', message: 'Your picture is kept on this device: carry on from the Tools page. Save it to keep a copy.', confirmLabel: 'Close' })) onClose(); }} aria-label="Close the editor" className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
  );
  const history = (
    <>
      <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (⌘Z)" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-30"><Undo2 className="w-4 h-4" /></button>
      <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (⇧⌘Z)" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-30"><Redo2 className="w-4 h-4" /></button>
    </>
  );
  const fileInput = <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label="Add a picture" onChange={(e) => { for (const f of [...(e.target.files ?? [])].slice(0, 5)) void addPicture(f, f.name); if (fileRef.current) fileRef.current.value = ''; }} />;
  const exportSheet = exporting && <ExportSheet doc={doc} title={simple ? 'Save your picture' : 'Export'} onName={(name) => setDoc({ ...docRef.current, name })} onClose={() => setExporting(false)} />;
  const picture = (
    <div ref={areaRef} className={cn('flex-1 min-w-0 grid place-items-center p-3 sm:p-6 overflow-auto', simple ? 'min-h-[30dvh]' : 'order-1 md:order-2 min-h-[45vh]')}
      onDragOver={(e) => { if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); for (const f of [...e.dataTransfer.files].filter((x) => x.type.startsWith('image/')).slice(0, 5)) void addPicture(f, f.name); }}>
      <div className="relative shadow-2xl" style={{ aspectRatio: `${doc.w} / ${doc.h}`, width: `min(100%, calc((${room}) * ${doc.w / doc.h}))`, maxWidth: doc.w }}>
        <div className="absolute inset-0 studio-checker" aria-hidden />
        <canvas ref={canvasRef} width={doc.w} height={doc.h} role="img" aria-label={`${doc.name}: ${doc.layers.length} layer${doc.layers.length === 1 ? '' : 's'}`}
          className={cn('relative block w-full h-full touch-none', tool === 'move' ? 'cursor-move' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair')}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        {box && (
          <div className="absolute pointer-events-none border-2 border-indigo-500" style={{ left: pct(box.x, doc.w), top: pct(box.y, doc.h), width: pct(box.w, doc.w), height: pct(box.h, doc.h), transform: `rotate(${box.rotation}deg)` }} aria-hidden />
        )}
        {drag && (
          <div className={cn('absolute pointer-events-none', tool === 'crop' ? 'border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]' : 'border-2 border-dashed border-indigo-400 bg-indigo-400/10')} style={{ left: pct(drag.x, doc.w), top: pct(drag.y, doc.h), width: pct(drag.w, doc.w), height: pct(drag.h, doc.h) }} aria-hidden />
        )}
      </div>
      {!doc.layers.length && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 text-center">{simple ? 'Add a photo, or start with text or drawing.' : 'Add a picture, paste one, drop one here, or start drawing.'}</p>}
    </div>
  );

  if (simple) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-zinc-100 dark:bg-[#06141b]">
        <div className="flex items-center gap-1 px-2 sm:px-3 py-2 border-b border-zinc-200 dark:border-white/10 bg-white dark:bg-[#11212d]">
          {close}
          <p className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-white px-1">{doc.name}</p>
          <div className="flex items-center gap-0.5 ms-auto shrink-0">
            {history}
            <button type="button" onClick={() => switchMode(false)} title="Layers, shapes, selections and more" className="btn-ghost btn-sm ms-1"><Layers className="w-4 h-4" />All tools</button>
            <button type="button" onClick={() => setExporting(true)} className="btn-primary btn-sm ms-1"><Download className="w-3.5 h-3.5" />Save</button>
          </div>
        </div>
        {fileInput}
        {picture}
        {task ? <SimplePanel task={task} api={api} /> : <SimpleBar onTask={openTask} onAddPhoto={api.addPhoto} busy={busy === 'open'} />}
        {exportSheet}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-100 dark:bg-[#06141b]">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-white/10 bg-white dark:bg-[#11212d] overflow-x-auto">
        {close}
        <input value={doc.name} onChange={(e) => setDoc({ ...doc, name: e.target.value.slice(0, 60) })} aria-label="Picture name" className="min-w-0 w-36 sm:w-48 bg-transparent text-sm font-semibold text-zinc-900 dark:text-white px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 focus:bg-zinc-100 dark:focus:bg-white/10 outline-none" />
        <span className="text-[11px] text-zinc-500 tabular-nums shrink-0 hidden sm:inline">{doc.w} × {doc.h}</span>
        <div className="flex items-center gap-0.5 ms-auto shrink-0">
          {history}
          <span className="w-px h-5 bg-zinc-200 dark:bg-white/10 mx-1" aria-hidden />
          <button type="button" onClick={() => docOp('rotateL')} aria-label="Turn the picture left" title="Turn left" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button>
          <button type="button" onClick={() => docOp('rotateR')} aria-label="Turn the picture right" title="Turn right" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"><RotateCw className="w-4 h-4" /></button>
          <button type="button" onClick={() => docOp('flipX')} aria-label="Flip the picture" title="Flip" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"><FlipHorizontal2 className="w-4 h-4" /></button>
          <span className="w-px h-5 bg-zinc-200 dark:bg-white/10 mx-1" aria-hidden />
          <input ref={projectRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void openProject(e.target.files?.[0])} />
          <button type="button" onClick={() => projectRef.current?.click()} aria-label="Open a project" title="Open a project" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"><FolderOpen className="w-4 h-4" /></button>
          <button type="button" onClick={saveProject} aria-label="Save the project" title="Save the project (to edit later)" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"><Save className="w-4 h-4" /></button>
          <button type="button" onClick={() => switchMode(true)} title="The simple editor" className="btn-ghost btn-sm ms-1">Simple</button>
          <button type="button" onClick={() => setExporting(true)} className="btn-primary btn-sm ms-1"><Download className="w-3.5 h-3.5" />Export</button>
        </div>
      </div>
      {fileInput}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Tools */}
        <div role="toolbar" aria-label="Tools" className="order-2 md:order-1 flex md:flex-col gap-1 p-1.5 bg-white dark:bg-[#11212d] border-t md:border-t-0 md:border-e border-zinc-200 dark:border-white/10 overflow-x-auto">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" onClick={() => { setTool(t.id); setDrag(null); if (t.id !== 'move') setPanel('tool'); }} aria-pressed={tool === t.id} aria-label={t.label} title={`${t.label} (${t.keys})`}
              className={cn('w-11 h-11 shrink-0 rounded-xl grid place-items-center transition-colors', tool === t.id ? 'bg-indigo-500 text-white' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10')}>
              <t.icon className="w-5 h-5" />
            </button>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Add a picture" title="Add a picture (or paste one)" className="w-11 h-11 shrink-0 rounded-xl grid place-items-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 md:mt-2">
            {busy === 'open' ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
          </button>
        </div>

        {picture}

        {/* Panels */}
        <aside className="order-3 md:w-80 shrink-0 flex flex-col max-h-[45vh] md:max-h-none bg-white dark:bg-[#11212d] border-t md:border-t-0 md:border-s border-zinc-200 dark:border-white/10">
          <div className="flex p-1.5 gap-1 border-b border-zinc-200 dark:border-white/10" role="tablist" aria-label="Panels">
            {([['layers', 'Layers', Layers], ['adjust', 'Adjust', SlidersHorizontal], ['tool', 'Options', Wand2]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)} className={cn('flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold', panel === id ? 'bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white' : 'text-zinc-500')}>
                <Icon className="w-3.5 h-3.5" aria-hidden />{label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3" role="tabpanel">
            {panel === 'layers' && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{doc.layers.length} layer{doc.layers.length === 1 ? '' : 's'}</p>
                  <button type="button" onClick={addLayer} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Paint layer</button>
                </div>
                <ul className="space-y-1">
                  {[...doc.layers].reverse().map((l) => (
                    <li key={l.id} className={cn('flex items-center gap-2 rounded-xl px-2 py-1.5 border', l.id === activeId ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-transparent hover:bg-zinc-100 dark:hover:bg-white/5')}>
                      <button type="button" onClick={() => patchLayer(l.id, { visible: !l.visible })} aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} className="p-1 text-zinc-500">{l.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                      <button type="button" onClick={() => setActiveId(l.id)} className="flex-1 min-w-0 text-start text-sm truncate text-zinc-800 dark:text-zinc-100">
                        {l.kind === 'text' ? <Type className="inline w-3 h-3 me-1 -mt-0.5 text-zinc-400" aria-hidden /> : l.kind === 'shape' ? <Square className="inline w-3 h-3 me-1 -mt-0.5 text-zinc-400" aria-hidden /> : null}{l.name}
                      </button>
                    </li>
                  ))}
                </ul>
                {active && (
                  <div className="space-y-2.5 pt-2 border-t border-zinc-200 dark:border-white/10">
                    <input value={active.name} onChange={(e) => patchLayer(active.id, { name: e.target.value.slice(0, 40) }, true)} aria-label="Layer name" className="input text-sm" />
                    <label className="block text-xs text-zinc-500">Opacity {Math.round(active.opacity * 100)}%
                      <input type="range" min={0} max={100} value={Math.round(active.opacity * 100)} onChange={(e) => patchLayer(active.id, { opacity: Number(e.target.value) / 100 }, true)} onPointerUp={() => commit(docRef.current, before.current ?? undefined)} className="w-full accent-indigo-500" />
                    </label>
                    <label className="block text-xs text-zinc-500">Blend
                      <select value={active.blend} onChange={(e) => patchLayer(active.id, { blend: e.target.value as Layer['blend'] })} className="input text-sm mt-1">{BLENDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</select>
                    </label>
                    <label className="block text-xs text-zinc-500">Turn {Math.round(active.rotation)}°
                      <input type="range" min={-180} max={180} value={Math.round(active.rotation)} onChange={(e) => patchLayer(active.id, { rotation: Number(e.target.value) }, true)} className="w-full accent-indigo-500" />
                    </label>
                    <label className="block text-xs text-zinc-500">Size {Math.round(active.w)} × {Math.round(active.h)}
                      <input type="range" min={5} max={300} value={Math.round((active.w / (active.canvas?.width ?? active.w)) * 100)} onChange={(e) => {
                        if (active.kind === 'text') return;
                        const base = active.canvas ? { w: active.canvas.width, h: active.canvas.height } : { w: active.w, h: active.h };
                        const s = Number(e.target.value) / 100;
                        const w = Math.max(4, Math.round(base.w * s)), h = Math.max(4, Math.round(base.h * s));
                        patchLayer(active.id, { w, h, x: Math.round(active.x + (active.w - w) / 2), y: Math.round(active.y + (active.h - h) / 2) }, true);
                      }} disabled={active.kind !== 'raster'} className="w-full accent-indigo-500 disabled:opacity-40" />
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {([['up', 'Bring forward', Plus], ['down', 'Send back', Minus], ['duplicate', 'Duplicate', Copy], ['delete', 'Delete', Trash2], ['flipX', 'Flip across', FlipHorizontal2], ['flipY', 'Flip up and down', FlipVertical2], ['center', 'Centre', Circle], ['fit', 'Fit to canvas', Crop]] as const).map(([op, label, Icon]) => (
                        <button key={op} type="button" onClick={() => void layerOp(op)} aria-label={label} title={label} className="h-9 rounded-lg grid place-items-center text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10"><Icon className="w-4 h-4" /></button>
                      ))}
                    </div>
                    {active.kind === 'raster' && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <button type="button" onClick={() => void layerOp('cutout')} disabled={busy === 'cutout'} className="btn-secondary btn-sm">{busy === 'cutout' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}Remove background</button>
                        <button type="button" onClick={() => void layerOp('sharpen')} className="btn-secondary btn-sm"><Sparkles className="w-3.5 h-3.5" />Sharpen</button>
                      </div>
                    )}
                  </div>
                )}
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-500 pt-2 border-t border-zinc-200 dark:border-white/10">
                  Background
                  <span className="flex items-center gap-1.5">
                    <button type="button" onClick={() => commit({ ...doc, background: null })} aria-pressed={!doc.background} className={cn('px-2 py-1 rounded-md text-[11px] font-semibold', !doc.background ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/10')}>See-through</button>
                    <input type="color" value={doc.background ?? '#ffffff'} onChange={(e) => setDoc({ ...doc, background: e.target.value })} onBlur={() => commit(docRef.current, before.current ?? undefined)} aria-label="Background colour" className="w-8 h-8 rounded-md border border-zinc-200 dark:border-white/10 bg-transparent" />
                  </span>
                </label>
              </>
            )}

            {panel === 'adjust' && (!active ? <p className="text-sm text-zinc-500">Choose a layer to adjust it.</p> : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Looks for “{active.name}”</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {FILTERS.map((f) => (
                    <button key={f.id} type="button" onClick={() => setAdjust({ ...NO_ADJUST, ...f.adjust })} className="rounded-lg border border-zinc-200 dark:border-white/10 px-2 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-indigo-400">{f.name}</button>
                  ))}
                </div>
                {SLIDERS.map((s) => (
                  <label key={s.key} className="block text-xs text-zinc-500">
                    <span className="flex justify-between"><span>{s.label}</span><span className="tabular-nums">{active.adjust[s.key]}</span></span>
                    <input type="range" min={s.min} max={s.max} value={active.adjust[s.key]} onPointerDown={() => { before.current = docRef.current; }} onChange={(e) => setAdjust({ [s.key]: Number(e.target.value) }, true)} onPointerUp={() => { if (before.current) commit(docRef.current, before.current); before.current = null; }} onKeyUp={() => commit(docRef.current)} className="w-full accent-indigo-500" />
                  </label>
                ))}
                <button type="button" onClick={() => setAdjust({ ...NO_ADJUST })} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Reset adjustments</button>
              </>
            ))}

            {panel === 'tool' && (
              <ToolOptions tool={tool} brush={brush} setBrush={setBrush} shape={shape} setShape={setShape} active={active} setText={setText} drag={drag} applyCrop={applyCrop} cancelDrag={() => setDrag(null)} onSelection={onSelection} />
            )}
          </div>
        </aside>
      </div>
      {exportSheet}
    </div>
  );
}

function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {swatches.map((c) => <button key={c} type="button" onClick={() => onChange(c)} aria-label={`${label} ${c}`} aria-pressed={value === c} className={cn('w-6 h-6 rounded-full border border-zinc-300 dark:border-white/20', value === c && 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-white dark:ring-offset-[#11212d]')} style={{ background: c }} />)}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label}: any colour`} className="w-7 h-7 rounded-md border border-zinc-200 dark:border-white/10 bg-transparent" />
    </div>
  );
}

function ToolOptions({ tool, brush, setBrush, shape, setShape, active, setText, drag, applyCrop, cancelDrag, onSelection }: {
  tool: Tool; brush: { size: number; color: string; opacity: number }; setBrush: (b: { size: number; color: string; opacity: number }) => void;
  shape: ShapeProps; setShape: (s: ShapeProps) => void; active: Layer | null; setText: (p: Partial<TextProps>) => void;
  drag: Rect | null; applyCrop: () => void; cancelDrag: () => void; onSelection: (what: 'delete' | 'fill' | 'copy') => void;
}) {
  if (active?.kind === 'text' && active.text && (tool === 'move' || tool === 'text')) {
    const t = active.text;
    return (
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Text</p>
        <textarea value={t.value} onChange={(e) => setText({ value: e.target.value.slice(0, 500) })} rows={3} aria-label="Text" className="input text-sm" />
        <select value={t.font} onChange={(e) => setText({ font: e.target.value })} aria-label="Font" className="input text-sm">{FONTS.map((f, i) => <option key={f} value={f}>{FONT_NAMES[i]}</option>)}</select>
        <label className="block text-xs text-zinc-500">Size {t.size}px<input type="range" min={8} max={400} value={t.size} onChange={(e) => setText({ size: Number(e.target.value) })} className="w-full accent-indigo-500" /></label>
        <div className="flex gap-1">
          <button type="button" onClick={() => setText({ bold: !t.bold })} aria-pressed={t.bold} className={cn('px-3 py-1.5 rounded-lg text-sm font-bold', t.bold ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/10')}>B</button>
          <button type="button" onClick={() => setText({ italic: !t.italic })} aria-pressed={t.italic} className={cn('px-3 py-1.5 rounded-lg text-sm italic', t.italic ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/10')}>I</button>
          {(['left', 'center', 'right'] as const).map((a) => <button key={a} type="button" onClick={() => setText({ align: a })} aria-pressed={t.align === a} className={cn('px-2.5 py-1.5 rounded-lg text-xs capitalize', t.align === a ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/10')}>{a}</button>)}
        </div>
        <Swatches value={t.color} onChange={(c) => setText({ color: c })} label="Text colour" />
        <label className="flex items-center justify-between text-xs text-zinc-500">Outline
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setText({ outline: t.outline ? null : '#000000' })} aria-pressed={!!t.outline} className={cn('px-2 py-1 rounded-md text-[11px] font-semibold', t.outline ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/10')}>{t.outline ? 'On' : 'Off'}</button>
            {t.outline && <input type="color" value={t.outline} onChange={(e) => setText({ outline: e.target.value })} aria-label="Outline colour" className="w-7 h-7 rounded-md bg-transparent" />}
          </span>
        </label>
      </div>
    );
  }
  if (tool === 'brush' || tool === 'eraser') {
    return (
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{tool === 'brush' ? 'Brush' : 'Eraser'}</p>
        <label className="block text-xs text-zinc-500">Size {brush.size}px<input type="range" min={1} max={200} value={brush.size} onChange={(e) => setBrush({ ...brush, size: Number(e.target.value) })} className="w-full accent-indigo-500" /></label>
        {tool === 'brush' && (
          <>
            <label className="block text-xs text-zinc-500">Opacity {Math.round(brush.opacity * 100)}%<input type="range" min={5} max={100} value={Math.round(brush.opacity * 100)} onChange={(e) => setBrush({ ...brush, opacity: Number(e.target.value) / 100 })} className="w-full accent-indigo-500" /></label>
            <Swatches value={brush.color} onChange={(c) => setBrush({ ...brush, color: c })} label="Brush colour" />
            <p className="text-[11px] text-zinc-500">Paints on the chosen picture layer, or on a new paint layer.</p>
          </>
        )}
      </div>
    );
  }
  if (tool === 'shape') {
    return (
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shape: drag on the picture (Shift for a square or circle)</p>
        <div className="grid grid-cols-4 gap-1">
          {([['rect', Square], ['ellipse', Circle], ['line', Minus], ['arrow', ArrowUpRight]] as const).map(([type, Icon]) => (
            <button key={type} type="button" onClick={() => setShape({ ...shape, type })} aria-pressed={shape.type === type} aria-label={type} className={cn('h-9 rounded-lg grid place-items-center', shape.type === type ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300')}><Icon className="w-4 h-4" /></button>
          ))}
        </div>
        <Swatches value={shape.stroke} onChange={(c) => setShape({ ...shape, stroke: c })} label="Line colour" />
        <label className="block text-xs text-zinc-500">Line {shape.width}px<input type="range" min={0} max={60} value={shape.width} onChange={(e) => setShape({ ...shape, width: Number(e.target.value) })} className="w-full accent-indigo-500" /></label>
        {(shape.type === 'rect' || shape.type === 'ellipse') && (
          <label className="flex items-center justify-between text-xs text-zinc-500">Fill
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setShape({ ...shape, fill: shape.fill ? null : '#9ba8ab' })} aria-pressed={!!shape.fill} className={cn('px-2 py-1 rounded-md text-[11px] font-semibold', shape.fill ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/10')}>{shape.fill ? 'On' : 'Off'}</button>
              {shape.fill && <input type="color" value={shape.fill} onChange={(e) => setShape({ ...shape, fill: e.target.value })} aria-label="Fill colour" className="w-7 h-7 rounded-md bg-transparent" />}
            </span>
          </label>
        )}
        {shape.type === 'rect' && <label className="block text-xs text-zinc-500">Rounded corners {shape.radius}px<input type="range" min={0} max={120} value={shape.radius} onChange={(e) => setShape({ ...shape, radius: Number(e.target.value) })} className="w-full accent-indigo-500" /></label>}
      </div>
    );
  }
  if (tool === 'crop') {
    return (
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Crop</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{drag ? `${drag.w} × ${drag.h}` : 'Drag on the picture to choose what to keep.'}</p>
        <div className="flex gap-2"><button type="button" onClick={applyCrop} disabled={!drag || drag.w < 4} className="btn-primary btn-sm"><Crop className="w-3.5 h-3.5" />Crop</button><button type="button" onClick={cancelDrag} disabled={!drag} className="btn-secondary btn-sm">Cancel</button></div>
      </div>
    );
  }
  if (tool === 'select') {
    return (
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Select</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{drag ? `${drag.w} × ${drag.h} on “${active?.name ?? 'no layer'}”` : 'Drag on the picture to select an area of the chosen layer.'}</p>
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" onClick={() => onSelection('copy')} disabled={!drag} className="btn-secondary btn-sm"><Copy className="w-3.5 h-3.5" />To layer</button>
          <button type="button" onClick={() => onSelection('delete')} disabled={!drag} className="btn-secondary btn-sm"><Trash2 className="w-3.5 h-3.5" />Delete</button>
          <button type="button" onClick={() => onSelection('fill')} disabled={!drag} className="btn-secondary btn-sm"><PaintBucket className="w-3.5 h-3.5" />Fill</button>
        </div>
        <Swatches value={brush.color} onChange={(c) => setBrush({ ...brush, color: c })} label="Fill colour" />
      </div>
    );
  }
  return <p className="text-sm text-zinc-500">{tool === 'text' ? 'Click on the picture to add text.' : 'Drag a layer to move it. Choose a text layer to edit its words.'}</p>;
}

function ExportSheet({ doc, title, onName, onClose }: { doc: Doc; title: string; onName: (name: string) => void; onClose: () => void }) {
  const [type, setType] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality] = useState(90);
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const maxScale = Math.max(1, Math.min(2, Math.floor((MAX_SIDE * 2) / Math.max(doc.w, doc.h))));
  const go = async (how: 'download' | 'copy') => {
    setBusy(how);
    try {
      const blob = await exportBlob(doc, how === 'copy' ? 'png' : type, quality / 100, scale);
      if (how === 'copy') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast.success('Copied: paste it into a chat or a doc');
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = exportName(doc.name, type);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast.success('Downloaded');
      }
      haptic('success');
    } catch (e) { toast.error((e as Error).message || 'Couldn’t export.'); }
    finally { setBusy(null); }
  };
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="export-title" className="sheet-in w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#11212d] border border-zinc-200 dark:border-white/10 shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between"><h2 id="export-title" className="font-bold text-zinc-900 dark:text-white">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button></div>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">Name
          <input value={doc.name} onChange={(e) => onName(e.target.value.slice(0, 60))} className="input text-sm mt-1" />
        </label>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Format">
          {([['png', 'PNG'], ['jpeg', 'JPG'], ['webp', 'WebP']] as const).map(([v, label]) => <button key={v} type="button" role="radio" aria-checked={type === v} onClick={() => setType(v)} className={cn('py-2 rounded-xl text-sm font-semibold', type === v ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200')}>{label}</button>)}
        </div>
        <p className="text-xs text-zinc-500">{type === 'png' ? 'Best quality; keeps see-through areas.' : type === 'jpeg' ? 'Smallest for photos; see-through areas turn white.' : 'Small, keeps see-through areas.'}</p>
        {type !== 'png' && <label className="block text-xs text-zinc-500">Quality {quality}%<input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-indigo-500" /></label>}
        {maxScale > 1 && (
          <div className="flex gap-1.5" role="radiogroup" aria-label="Size">
            {[1, 2].filter((s) => s <= maxScale).map((s) => <button key={s} type="button" role="radio" aria-checked={scale === s} onClick={() => setScale(s)} className={cn('flex-1 py-1.5 rounded-xl text-xs font-semibold', scale === s ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/10')}>{s}× · {doc.w * s} × {doc.h * s}</button>)}
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => void go('download')} disabled={!!busy} className="btn-primary flex-1">{busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Download</button>
          {typeof ClipboardItem !== 'undefined' && <button type="button" onClick={() => void go('copy')} disabled={!!busy} className="btn-secondary">{busy === 'copy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}Copy</button>}
        </div>
      </div>
    </div>
  );
}

/** A text layer with its top-left corner at (x, y). */
function textLayer(t: TextProps, x: number, y: number): Layer {
  const m = measureText(t);
  return { id: newId(), name: 'Text', kind: 'text', visible: true, opacity: 1, blend: 'source-over', adjust: { ...NO_ADJUST }, text: t, x: Math.round(x), y: Math.round(y), w: m.w, h: m.h, rotation: 0, flipX: false, flipY: false };
}

/** A small copy of a picture (about 200 px across) for the looks' previews. */
function smallCopy(src: HTMLCanvasElement) {
  const s = Math.min(1, 200 / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * s));
  c.height = Math.max(1, Math.round(src.height * s));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
