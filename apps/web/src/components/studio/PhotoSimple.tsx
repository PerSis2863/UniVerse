'use client';

import { Check, Crop, Eraser, FlipHorizontal2, FlipVertical2, ImagePlus, Loader2, Pencil, RotateCcw, RotateCw, Scissors, SlidersHorizontal, Sparkles, Trash2, Type, Wand2 } from 'lucide-react';
import { CROP_RATIOS, FILTERS, NO_ADJUST, SIMPLE_SLIDERS, filterString, isLook, type Adjust, type Rect } from '@/lib/studio';
import { cn } from '@/lib/utils';
import { FONTS, FONT_NAMES, type Doc, type Layer, type TextProps } from './studio-canvas';

// The photo editor's simple mode (Collaborate → Tools → Edit a photo): one row of plain jobs under the
// picture (crop, turn, adjust, looks, text, draw, background), each opening only what it needs and a
// Done button. "All tools" in the top bar switches to the full editor (layers, blend modes, selections).

export type Task = 'crop' | 'turn' | 'adjust' | 'looks' | 'text' | 'draw' | 'background';

export const TASKS: { id: Task; label: string; icon: typeof Crop }[] = [
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'turn', label: 'Turn', icon: RotateCw },
  { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
  { id: 'looks', label: 'Looks', icon: Wand2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'background', label: 'Background', icon: Scissors },
];
const SWATCHES = ['#000000', '#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#0ea5e9', '#6366f1', '#ec4899'];

export function SimpleBar({ onTask, onAddPhoto, busy }: { onTask: (t: Task) => void; onAddPhoto: () => void; busy: boolean }) {
  return (
    <div role="toolbar" aria-label="Edit" className="flex md:justify-center gap-1 overflow-x-auto px-2 py-2 bg-white dark:bg-[#121830] border-t border-zinc-200 dark:border-white/10">
      {TASKS.map((t) => (
        <button key={t.id} type="button" onClick={() => onTask(t.id)} className="shrink-0 min-w-[4.5rem] flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10">
          <t.icon className="w-5 h-5" aria-hidden />
          <span className="text-xs font-semibold">{t.label}</span>
        </button>
      ))}
      <button type="button" onClick={onAddPhoto} className="shrink-0 min-w-[4.5rem] flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <ImagePlus className="w-5 h-5" aria-hidden />}
        <span className="text-xs font-semibold">Add photo</span>
      </button>
    </div>
  );
}

export interface SimpleApi {
  doc: Doc;
  /** The picture the photo jobs work on (the chosen picture, or the first one). */
  photo: Layer | null;
  active: Layer | null;
  done: () => void;
  ratio: number | null; setRatio: (r: number | null) => void; drag: Rect | null; applyCrop: () => void;
  /** How big the shaped crop is, as a percentage of the biggest that fits (null: no shape chosen). */
  cropSize: number | null; setCropSize: (pct: number) => void;
  turn: (op: 'rotateL' | 'rotateR' | 'flipX' | 'flipY') => void;
  setAdjust: (patch: Partial<Adjust>, live?: boolean) => void; slideStart: () => void; slideEnd: () => void;
  sharpen: () => void; thumb: string | null;
  addText: () => void; setText: (p: Partial<TextProps>) => void; removeActive: () => void;
  brush: { size: number; color: string; opacity: number }; setBrush: (b: { size: number; color: string; opacity: number }) => void;
  eraser: boolean; setEraser: (on: boolean) => void;
  cutout: () => void; busy: string | null; setBackground: (c: string | null) => void;
  addPhoto: () => void;
}

const TITLES: Record<Task, string> = { crop: 'Crop', turn: 'Turn and flip', adjust: 'Adjust', looks: 'Looks', text: 'Text', draw: 'Draw', background: 'Background' };

function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {SWATCHES.map((c) => <button key={c} type="button" onClick={() => onChange(c)} aria-label={`${label}: ${c}`} aria-pressed={value === c} className={cn('w-8 h-8 rounded-full border border-zinc-300 dark:border-white/25', value === c && 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-[#121830]')} style={{ background: c }} />)}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label}: any colour`} className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent" />
    </div>
  );
}

const big = 'flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-white/10 px-2 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 hover:border-indigo-400/60';
const chip = (on: boolean) => cn('rounded-full px-3 py-1.5 text-sm font-semibold border', on ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-200 dark:border-white/15 text-zinc-700 dark:text-zinc-200');

export function SimplePanel({ task, api }: { task: Task; api: SimpleApi }) {
  const { photo, active } = api;
  const needPhoto = (task === 'adjust' || task === 'looks') && !photo;
  return (
    <section aria-labelledby="simple-task" className="bg-white dark:bg-[#121830] border-t border-zinc-200 dark:border-white/10 max-h-[40dvh] overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2 bg-white dark:bg-[#121830] border-b border-zinc-100 dark:border-white/5">
        <h2 id="simple-task" className="font-bold text-zinc-900 dark:text-white">{TITLES[task]}</h2>
        <button type="button" onClick={api.done} className="btn-primary btn-sm"><Check className="w-4 h-4" />Done</button>
      </div>
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {needPhoto ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">Add a photo first.</p>
            <button type="button" onClick={api.addPhoto} className="btn-secondary"><ImagePlus className="w-4 h-4" />Add a photo</button>
          </div>
        ) : task === 'crop' ? (
          <>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Shape">
              {CROP_RATIOS.map((r) => <button key={r.id} type="button" role="radio" aria-checked={api.ratio === r.ratio} onClick={() => api.setRatio(r.ratio)} className={chip(api.ratio === r.ratio)}>{r.label}</button>)}
            </div>
            {api.cropSize !== null && (
              <label className="block text-sm text-zinc-800 dark:text-zinc-200">Size
                <input type="range" min={20} max={100} value={api.cropSize} onChange={(e) => api.setCropSize(Number(e.target.value))} className="w-full accent-indigo-500" />
              </label>
            )}
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{api.drag ? `Keeping ${api.drag.w} × ${api.drag.h}. Drag the frame to move it, or drag outside it to draw a new one.` : 'Drag on the photo to choose what to keep.'}</p>
            <button type="button" onClick={api.applyCrop} disabled={!api.drag || api.drag.w < 4 || api.drag.h < 4} className="btn-primary"><Crop className="w-4 h-4" />Crop</button>
          </>
        ) : task === 'turn' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button type="button" onClick={() => api.turn('rotateL')} className={big}><RotateCcw className="w-5 h-5" aria-hidden />Turn left</button>
            <button type="button" onClick={() => api.turn('rotateR')} className={big}><RotateCw className="w-5 h-5" aria-hidden />Turn right</button>
            <button type="button" onClick={() => api.turn('flipX')} className={big}><FlipHorizontal2 className="w-5 h-5" aria-hidden />Mirror</button>
            <button type="button" onClick={() => api.turn('flipY')} className={big}><FlipVertical2 className="w-5 h-5" aria-hidden />Upside down</button>
          </div>
        ) : task === 'adjust' && photo ? (
          <>
            {SIMPLE_SLIDERS.map((s) => (
              <label key={s.key} className="block text-sm text-zinc-800 dark:text-zinc-200">
                <span className="flex justify-between"><span>{s.label}</span><span className="tabular-nums text-zinc-600 dark:text-zinc-400">{photo.adjust[s.key] > 0 ? '+' : ''}{photo.adjust[s.key]}</span></span>
                <input type="range" min={s.min} max={s.max} value={photo.adjust[s.key]} onPointerDown={api.slideStart} onKeyDown={api.slideStart} onChange={(e) => api.setAdjust({ [s.key]: Number(e.target.value) }, true)} onPointerUp={api.slideEnd} onKeyUp={api.slideEnd} className="w-full accent-indigo-500" />
              </label>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={api.sharpen} className="btn-secondary btn-sm"><Sparkles className="w-4 h-4" />Sharpen</button>
              <button type="button" onClick={() => api.setAdjust({ ...NO_ADJUST })} className="btn-ghost btn-sm">Reset</button>
            </div>
          </>
        ) : task === 'looks' && photo ? (
          <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2" aria-label="Looks">
            {FILTERS.map((f) => {
              const on = isLook(photo.adjust, f.adjust);
              return (
                <li key={f.id}>
                  <button type="button" onClick={() => api.setAdjust({ ...NO_ADJUST, ...f.adjust })} aria-pressed={on} className={cn('w-full rounded-xl p-1 border-2', on ? 'border-indigo-500' : 'border-transparent hover:border-zinc-300 dark:hover:border-white/20')}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a small preview made on this device */}
                    {api.thumb ? <img src={api.thumb} alt="" className="w-full aspect-square object-cover rounded-lg" style={{ filter: filterString({ ...NO_ADJUST, ...f.adjust }) }} /> : <span className="block w-full aspect-square rounded-lg bg-zinc-200 dark:bg-white/10" />}
                    <span className="block mt-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200">{f.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : task === 'text' ? (
          active?.kind === 'text' && active.text ? (
            <>
              <label className="block text-sm text-zinc-800 dark:text-zinc-200">Your words
                <textarea value={active.text.value} onChange={(e) => api.setText({ value: e.target.value.slice(0, 500) })} rows={2} className="input text-base mt-1" />
              </label>
              <label className="block text-sm text-zinc-800 dark:text-zinc-200">Size
                <input type="range" min={12} max={400} value={active.text.size} onChange={(e) => api.setText({ size: Number(e.target.value) })} className="w-full accent-indigo-500" />
              </label>
              <Swatches value={active.text.color} onChange={(c) => api.setText({ color: c })} label="Text colour" />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => api.setText({ bold: !active.text!.bold })} aria-pressed={active.text.bold} className={chip(active.text.bold)}>Bold</button>
                <button type="button" onClick={() => api.setText({ outline: active.text!.outline ? null : '#000000' })} aria-pressed={!!active.text.outline} className={chip(!!active.text.outline)}>Outline</button>
                <select value={active.text.font} onChange={(e) => api.setText({ font: e.target.value })} aria-label="Font" className="input !w-auto text-sm">{FONTS.map((f, i) => <option key={f} value={f}>{FONT_NAMES[i]}</option>)}</select>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Drag the words on the photo to move them.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={api.addText} className="btn-secondary btn-sm"><Type className="w-4 h-4" />Add more text</button>
                <button type="button" onClick={api.removeActive} className="btn-ghost btn-sm text-rose-700 dark:text-rose-400"><Trash2 className="w-4 h-4" />Remove this text</button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <button type="button" onClick={api.addText} className="btn-primary"><Type className="w-4 h-4" />Add text</button>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Or tap words already on the photo to change them.</p>
            </div>
          )
        ) : task === 'draw' ? (
          <>
            <div className="flex gap-2" role="radiogroup" aria-label="Draw with">
              <button type="button" role="radio" aria-checked={!api.eraser} onClick={() => api.setEraser(false)} className={chip(!api.eraser)}><Pencil className="inline w-4 h-4 mr-1 -mt-0.5" aria-hidden />Pen</button>
              <button type="button" role="radio" aria-checked={api.eraser} onClick={() => api.setEraser(true)} className={chip(api.eraser)}><Eraser className="inline w-4 h-4 mr-1 -mt-0.5" aria-hidden />Eraser</button>
            </div>
            {/* Hidden, not removed, for the eraser: the panel keeps its height, so the photo doesn't jump. */}
            <div className={cn(api.eraser && 'invisible')}><Swatches value={api.brush.color} onChange={(c) => api.setBrush({ ...api.brush, color: c })} label="Pen colour" /></div>
            <label className="block text-sm text-zinc-800 dark:text-zinc-200">Thickness
              <input type="range" min={2} max={120} value={api.brush.size} onChange={(e) => api.setBrush({ ...api.brush, size: Number(e.target.value) })} className="w-full accent-indigo-500" />
            </label>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{api.eraser ? 'The eraser takes away what you drew; the photo stays as it is.' : 'Draw on the photo with your finger or mouse.'}</p>
          </>
        ) : task === 'background' ? (
          <>
            {photo && (
              <>
                <button type="button" onClick={api.cutout} disabled={api.busy === 'cutout'} className="btn-primary">{api.busy === 'cutout' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}Remove the background</button>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">Works best on photos of people. It all happens on this device; Undo if it isn’t right.</p>
              </>
            )}
            <div className="space-y-2">
              <p className="text-sm text-zinc-800 dark:text-zinc-200">Behind the photo</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => api.setBackground(null)} aria-pressed={!api.doc.background} className={chip(!api.doc.background)}>See-through</button>
                <Swatches value={api.doc.background ?? '#ffffff'} onChange={(c) => api.setBackground(c)} label="Background colour" />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

