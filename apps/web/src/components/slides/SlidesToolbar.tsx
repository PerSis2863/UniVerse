'use client';

import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Baseline, Bold, BringToFront, ChevronDown, Copy, ImagePlus, Italic, LayoutTemplate, List, ListOrdered, PaintBucket, Palette, Play, Plus, Redo2, SendToBack, Shapes, Sparkles, Strikethrough, Trash2, Type, Underline, Undo2 } from 'lucide-react';
import { ColorGrid, Menu, Popover } from '@/components/ui/Menu';
import { FONTS, LAYOUTS, SHAPES, THEMES, type Anim, type DeckJSON, type Item, type LayoutId, type ShapeKind, type Slide, type ThemeId, type Transition } from '@/lib/slides/deck';
import { cn } from '@/lib/utils';

// The presentation's toolbar (Office suite): new slides, text boxes, shapes and pictures, themes
// and backgrounds, transitions, and for what's selected: fonts, sizes, bold / italic / underline,
// colours, alignment, bullets, fill and outline, order, animation, and Present.

export interface SlideActions {
  undo: () => void; redo: () => void; newSlide: (l: LayoutId) => void; text: () => void; shape: (s: ShapeKind) => void; picture: () => void;
  theme: (t: ThemeId) => void; ratio: (r: DeckJSON['ratio']) => void; background: (c: string | null) => void; backgroundAll: (c: string | null) => void;
  transition: (t: Transition) => void; transitionAll: (t: Transition) => void; present: (fromStart: boolean) => void;
  toggle: (k: 'b' | 'i' | 'u' | 's') => void; color: (c: string | null) => void; align: (a: 'left' | 'center' | 'right') => void; bullets: (k: 'dot' | 'num') => void;
  valign: (v: 'top' | 'middle' | 'bottom') => void; size: (n: number) => void; grow: (d: 1 | -1) => void; font: (f: string | undefined) => void;
  fill: (c: string | null) => void; line: (c: string | null) => void; arrange: (h: 'front' | 'back' | 'forward' | 'backward') => void; anim: (a: Anim | null) => void;
  remove: () => void; duplicate: () => void; alt: (t: string) => void; fitImage: (f: 'cover' | 'contain') => void;
}

const btn = (on: boolean | undefined, label: string, Icon: typeof Bold, run: () => void, disabled?: boolean) => (
  <button key={label} type="button" title={label} aria-label={label} aria-pressed={on === undefined ? undefined : !!on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}
    className={cn('w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40', on ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10')}><Icon className="w-4 h-4" /></button>
);
const sep = (k: string) => <span key={k} aria-hidden className="w-px h-5 bg-zinc-200 dark:bg-white/10 mx-1 shrink-0" />;
const TRANSITIONS: { value: Transition; label: string }[] = [{ value: 'none', label: 'None' }, { value: 'fade', label: 'Fade' }, { value: 'slide', label: 'Slide in' }, { value: 'zoom', label: 'Zoom' }];
const ANIMS: { value: Anim | null; label: string }[] = [{ value: null, label: 'None (always shown)' }, { value: 'fade', label: 'Fade in on a click' }, { value: 'fly', label: 'Fly in on a click' }, { value: 'zoom', label: 'Zoom in on a click' }];

export function SlidesToolbar({ on, canEdit, canUndo, canRedo, deck, slide, selected, editing, bold, italic, underline, strike }: {
  on: SlideActions; canEdit: boolean; canUndo: boolean; canRedo: boolean; deck: DeckJSON; slide: Slide | null; selected: Item[]; editing: boolean;
  bold: boolean; italic: boolean; underline: boolean; strike: boolean;
}) {
  const off = !canEdit;
  const one = selected.length === 1 ? selected[0] : null;
  const hasText = selected.some((i) => i.kind !== 'image') || editing;
  const textOff = off || !hasText;
  return (
    <div role="toolbar" aria-label="Presentation tools" className="relative flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] px-2 py-1.5">
      <button type="button" onClick={() => on.present(false)} className="h-8 shrink-0 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 me-1" title="Present from this slide (F5 from the start)"><Play className="w-3.5 h-3.5" />Present</button>
      <Menu label="Present options" button={<ChevronDown className="w-3.5 h-3.5" />} className="min-w-6 px-1" items={[{ label: 'From the start', onSelect: () => on.present(true), hint: 'F5' }, { label: 'From this slide', onSelect: () => on.present(false) }]} />
      {sep('a')}
      {btn(undefined, 'Undo', Undo2, on.undo, off || !canUndo)}
      {btn(undefined, 'Redo', Redo2, on.redo, off || !canRedo)}
      {sep('b')}
      <Menu label="New slide" disabled={off} button={<><Plus className="w-4 h-4" /><span className="text-xs font-medium">Slide</span></>} items={LAYOUTS.map((l) => ({ label: l.name, onSelect: () => on.newSlide(l.id) }))} />
      {btn(undefined, 'Text box', Type, on.text, off)}
      <Menu label="Shape" disabled={off} button={<><Shapes className="w-4 h-4" /><ChevronDown className="w-3 h-3" /></>} items={SHAPES.map((s) => ({ label: s.label, onSelect: () => on.shape(s.value) }))} />
      {btn(undefined, 'Picture', ImagePlus, on.picture, off)}
      <Popover label="Design: theme, slide size and background" disabled={off} wide button={<><Palette className="w-4 h-4" /><span className="text-xs font-medium">Design</span></>}>
        {(close) => (
          <div className="p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Theme</p>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => (
                <button key={t.id} type="button" aria-pressed={deck.theme === t.id} onClick={() => { on.theme(t.id); close(); }} className={cn('rounded-lg overflow-hidden border text-start', deck.theme === t.id ? 'ring-2 ring-indigo-500 border-transparent' : 'border-zinc-200 dark:border-white/10')}>
                  <span className="block h-12 relative" style={{ background: t.bg }}>
                    <span className="absolute start-2 top-2 text-sm font-bold" style={{ color: t.text, fontFamily: t.title }}>Aa</span>
                    <span className="absolute start-2 end-2 bottom-2 h-1 rounded" style={{ background: t.accent }} />
                  </span>
                  <span className="block px-2 py-1 text-xs font-medium">{t.name}</span>
                </button>
              ))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Slide size</p>
            <div className="flex gap-2">{(['16:9', '4:3'] as const).map((r) => <button key={r} type="button" aria-pressed={deck.ratio === r} onClick={() => on.ratio(r)} className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold border', deck.ratio === r ? 'bg-indigo-600 text-white border-transparent' : 'border-zinc-200 dark:border-white/10')}>{r === '16:9' ? 'Wide (16:9)' : 'Standard (4:3)'}</button>)}</div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Background of this slide</p>
            <ColorGrid label="Background" value={slide?.bg} none="The theme’s" onPick={(c) => on.background(c)} />
            <button type="button" onClick={() => { on.backgroundAll(slide?.bg ?? null); close(); }} className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Use this background on every slide</button>
          </div>
        )}
      </Popover>
      <Menu label="Transition" disabled={off} button={<><LayoutTemplate className="w-4 h-4" /><ChevronDown className="w-3 h-3" /></>} items={[
        { heading: 'Moving to this slide' }, ...TRANSITIONS.map((t) => ({ label: t.label, checked: (slide?.transition ?? 'none') === t.value, onSelect: () => on.transition(t.value) })),
        'sep', { label: 'Use on every slide', onSelect: () => on.transitionAll(slide?.transition ?? 'none') },
      ]} />
      {sep('c')}
      <label className="sr-only" htmlFor="slide-font">Font</label>
      <select id="slide-font" disabled={textOff} value={one?.font ?? ''} onChange={(e) => on.font(e.target.value || undefined)} className="h-8 w-28 shrink-0 rounded-lg bg-transparent text-xs text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 px-1.5 disabled:opacity-40">
        <option value="">Theme font</option>{FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <label className="sr-only" htmlFor="slide-size">Font size</label>
      <select id="slide-size" disabled={textOff || editing} value={one?.size ? String(Math.round((one.size * 0.6))) : ''} onChange={(e) => on.size(Math.round(Number(e.target.value) / 0.6))} className="h-8 w-16 shrink-0 rounded-lg bg-transparent text-xs text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 px-1 disabled:opacity-40">
        <option value="" disabled>Size</option>
        {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 54, 60, 72, 88, 96].map((n) => <option key={n} value={n}>{n}</option>)}
        {one?.size && ![10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 54, 60, 72, 88, 96].includes(Math.round(one.size * 0.6)) && <option value={Math.round(one.size * 0.6)}>{Math.round(one.size * 0.6)}</option>}
      </select>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => on.grow(1)} disabled={textOff || editing} title="Bigger text" className="h-8 w-8 shrink-0 rounded-lg text-sm font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-40">A<sup>+</sup><span className="sr-only"> bigger text</span></button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => on.grow(-1)} disabled={textOff || editing} title="Smaller text" className="h-8 w-8 shrink-0 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-40">A<sup>−</sup><span className="sr-only"> smaller text</span></button>
      {btn(bold, 'Bold', Bold, () => on.toggle('b'), textOff)}
      {btn(italic, 'Italic', Italic, () => on.toggle('i'), textOff)}
      {btn(underline, 'Underline', Underline, () => on.toggle('u'), textOff)}
      {btn(strike, 'Strikethrough', Strikethrough, () => on.toggle('s'), textOff)}
      <Popover label="Text colour" disabled={textOff} button={<span className="flex flex-col items-center"><Baseline className="w-4 h-4" /><span className="w-4 h-1 rounded-sm -mt-0.5" style={{ background: one?.color ?? 'currentColor' }} /></span>}>
        {(close) => <ColorGrid label="Text colour" value={one?.color} none="The theme’s" onPick={(c) => { on.color(c); close(); }} />}
      </Popover>
      {btn(one?.align === 'left' || (!!one && !one.align), 'Align left', AlignLeft, () => on.align('left'), textOff)}
      {btn(one?.align === 'center', 'Centre', AlignCenter, () => on.align('center'), textOff)}
      {btn(one?.align === 'right', 'Align right', AlignRight, () => on.align('right'), textOff)}
      {btn(!!one?.paras?.length && one.paras.every((p) => p.bullet === 'dot'), 'Bullets', List, () => on.bullets('dot'), textOff)}
      {btn(!!one?.paras?.length && one.paras.every((p) => p.bullet === 'num'), 'Numbered list', ListOrdered, () => on.bullets('num'), textOff)}
      <Menu label="Text position in the box" disabled={textOff} button={<span className="text-xs font-semibold">↕</span>} items={[
        { label: 'Top', checked: !one?.valign || one.valign === 'top', onSelect: () => on.valign('top') },
        { label: 'Middle', checked: one?.valign === 'middle', onSelect: () => on.valign('middle') },
        { label: 'Bottom', checked: one?.valign === 'bottom', onSelect: () => on.valign('bottom') },
      ]} />
      {sep('d')}
      <Popover label="Fill colour" disabled={off || !selected.some((i) => i.kind === 'shape')} button={<PaintBucket className="w-4 h-4" />}>
        {(close) => <ColorGrid label="Fill colour" value={one?.fill} none="The theme’s accent" onPick={(c) => { on.fill(c); close(); }} />}
      </Popover>
      <Popover label="Outline colour" disabled={off || !selected.length} button={<span className="w-4 h-4 rounded-sm border-2 border-current" />}>
        {(close) => <ColorGrid label="Outline colour" value={one?.line} none="No outline" onPick={(c) => { on.line(c); close(); }} />}
      </Popover>
      {btn(undefined, 'Bring to front', BringToFront, () => on.arrange('front'), off || !selected.length)}
      {btn(undefined, 'Send to back', SendToBack, () => on.arrange('back'), off || !selected.length)}
      <Menu label="More arranging" disabled={off || !selected.length} button={<ChevronDown className="w-3 h-3" />} className="min-w-6 px-1" items={[{ label: 'Bring forward', icon: <ArrowUpToLine className="w-4 h-4" />, onSelect: () => on.arrange('forward') }, { label: 'Send backward', icon: <ArrowDownToLine className="w-4 h-4" />, onSelect: () => on.arrange('backward') }]} />
      <Menu label="Animation" disabled={off || !selected.length} button={<><Sparkles className="w-4 h-4" /><ChevronDown className="w-3 h-3" /></>} items={ANIMS.map((a) => ({ label: a.label, checked: (one?.anim ?? null) === a.value, onSelect: () => on.anim(a.value) }))} />
      {one?.kind === 'image' && (
        <Popover label="Picture: description and fit" disabled={off} button={<span className="text-xs font-semibold px-1">Alt</span>}>
          {(close) => (
            <form className="p-3 space-y-2 w-72" onSubmit={(e) => { e.preventDefault(); const v = (new FormData(e.currentTarget).get('alt') as string) ?? ''; on.alt(v.slice(0, 300)); close(); }}>
              <label className="block text-sm font-medium">Describe the picture (for people who can’t see it)<input name="alt" defaultValue={one.alt ?? ''} maxLength={300} className="input mt-1" /></label>
              <div className="flex gap-2">{(['cover', 'contain'] as const).map((f) => <button key={f} type="button" aria-pressed={(one.fit ?? 'cover') === f} onClick={() => on.fitImage(f)} className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold border', (one.fit ?? 'cover') === f ? 'bg-indigo-600 text-white border-transparent' : 'border-zinc-200 dark:border-white/10')}>{f === 'cover' ? 'Fill the box' : 'Whole picture'}</button>)}</div>
              <button type="submit" className="btn-primary btn-sm w-full">Save</button>
            </form>
          )}
        </Popover>
      )}
      {btn(undefined, 'Duplicate', Copy, on.duplicate, off || !selected.length)}
      {btn(undefined, 'Delete', Trash2, on.remove, off || !selected.length)}
    </div>
  );
}
